-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · lo que el dueño no se salta, aunque abra la consola ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Salió de un hackeo ético hecho el 6-11-2026: ponerse en el lugar de un
-- cliente —o de un script con su sesión y la llave pública— y probar qué
-- escribe en la base saltándose la app. Lo que se encontró, y lo que cierra
-- este archivo:
--
--   descontar_stock  → la llamaba cualquiera con cualquier producto. Un
--                      script dejaba la tienda entera en cero.
--   pagos            → el dueño insertaba cobros de cualquier concepto y
--                      monto. Con uno de $0 en `recargo_jardin` o
--                      `saldo_hotel` la cola de Administración daba por
--                      decidido el recargo y nunca lo cobraba.
--   estadias/reservas → se agendaban directo: sin admisión, sin cupo, sin
--                      precio. 30 reservas a la vez entraban las 30.
--   servicios        → nacían "agendado" y se saltaban la cola que les pone
--                      precio: un servicio que nunca se cobra.
--   ordenes          → nacían "pagada" con total 0.
--
-- La respuesta es la de siempre en este repo: lo que toca plata o cupo pasa
-- por funciones que saben hacer una sola cosa entera, y disparadores que
-- no dejan hacer lo mismo por fuera. Y lo que se decide se prueba: cada
-- agujero de arriba es un caso de `supabase/pruebas/aislamiento.sh`.
--
-- El equipo queda como estaba. El cuidador que registra un perro en la
-- puerta sin cupo lo hace a propósito ("Registrar de todas formas") y eso
-- sigue siendo su decisión: todo lo de acá mira a quien NO es de la casa.

/* ── Quién es quién ───────────────────────────────────────────────── */

-- Un dueño con sesión. Es nulo-seguro a propósito: en el editor SQL y en
-- las migraciones `auth.uid()` es nulo, y ahí nada de esto tiene que
-- disparar. Mira la identidad y no `current_user`, porque adentro de una
-- función `security definer` el usuario es la dueña de la función y la
-- identidad sigue siendo la del que llamó.
create or replace function es_dueno()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and not coalesce(es_equipo(), false);
$$;

-- Un dueño escribiendo DIRECTO, sin pasar por una función.
create or replace function escribe_por_fuera()
returns boolean
language sql
stable
as $$
  select current_user = 'authenticated' and es_dueno();
$$;

/* ── El cupo, contado por la base ─────────────────────────────────── */

-- El pico de ocupación entre dos instantes, en franjas de 30 minutos, con
-- las mismas reglas que `calcularOcupacionDia`: traslape estricto, y un
-- rango que termina antes de empezar ocupa hasta el final de su día.
create or replace function pico_de_ocupacion(desde timestamptz, hasta timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with ocupantes as (
    select coalesce(inicio_real, inicio_programado) as ini,
           coalesce(fin_real, fin_programado) as fin
      from estadias_jardin
     where estado in ('esperada', 'presente', 'finalizada')
    union all
    select coalesce(inicio_real, inicio_programado),
           coalesce(fin_real, fin_programado)
      from reservas_hotel
     where estado in ('pendiente', 'confirmada', 'en_curso', 'finalizada')
  ),
  arreglados as (
    select ini,
           case when fin > ini then fin
                else ((ini at time zone 'America/Santiago')::date + 1)::timestamp
                       at time zone 'America/Santiago'
           end as fin
      from ocupantes
  ),
  franjas as (
    select t as ini, t + interval '30 minutes' as fin
      from generate_series(
        date_trunc('hour', desde),
        hasta - interval '1 second',
        interval '30 minutes') t
  )
  select coalesce(max(n), 0)::integer
    from (
      select count(*) as n
        from franjas f
        join arreglados o on o.ini < f.fin and o.fin > f.ini
       group by f.ini
    ) s;
$$;

revoke all on function pico_de_ocupacion(timestamptz, timestamptz) from public;
grant execute on function pico_de_ocupacion(timestamptz, timestamptz) to authenticated;

/* ── La admisión, leída por la base ───────────────────────────────── */

-- Los BLOQUEOS de `evaluarAdmision`, y solo esos: lo que avisa sin bloquear
-- (desparasitación sin registro, sociabilidad sin evaluar) acá tampoco
-- bloquea. Lanza con el motivo, porque "no admitido" a secas no le sirve a
-- nadie.
create or replace function revisar_admision(f perros, el_dia date, es_dia_de_prueba boolean)
returns void
language plpgsql
stable
as $$
declare
  -- NEGOCIO.admision.pesoMaximoKg
  peso_maximo constant numeric := 20;
  -- NEGOCIO.admision.mesesParaExigirCastracion
  meses_castracion constant integer := 7;
  obligatorias text[];
  tipo text;
  ultima jsonb;
begin
  if not es_dia_de_prueba
     and coalesce(f.dia_de_prueba->>'estado', 'pendiente') <> 'aprobado' then
    raise exception 'Falta el día de prueba aprobado.';
  end if;

  if f.peso_kg > peso_maximo
     and (f.excepcion_peso is null
          or f.peso_kg > (f.excepcion_peso->>'hastaKg')::numeric) then
    raise exception 'Pasa del peso que recibimos.';
  end if;

  -- Castrado desde los 7 meses; sin fecha de nacimiento se asume que ya
  -- tiene la edad, como `leCorrespondeEstarCastrado`.
  if f.sexo = 'macho' and not f.esterilizado
     and (f.fecha_nacimiento is null
          or f.fecha_nacimiento <= el_dia - make_interval(months => meses_castracion)) then
    raise exception 'Los machos deben estar castrados.';
  end if;

  if f.desparasitado_hasta is not null and f.desparasitado_hasta < el_dia then
    raise exception 'La desparasitación está vencida.';
  end if;

  if f.sociable is false then
    raise exception 'No está evaluado como sociable.';
  end if;

  select vacunas_obligatorias into obligatorias from configuracion limit 1;
  foreach tipo in array coalesce(obligatorias, '{}') loop
    select v into ultima
      from jsonb_array_elements(coalesce(f.vacunas, '[]')) v
     where v->>'tipo' = tipo
     order by v->>'fechaAplicacion' desc
     limit 1;
    if ultima is null or (ultima->>'fechaVencimiento')::date < el_dia then
      raise exception 'Falta la vacuna % vigente.', tipo;
    end if;
  end loop;
end $$;

/* ── Lo que cuida la casa en cada día y cada reserva ──────────────── */

-- Dispara en CUALQUIER inserción de un dueño, directa o a través de una
-- función: la admisión, el cupo, el horizonte, el perro propio y los
-- duplicados. Así `agendar_dia_con_plan` y `agendar_dia_de_prueba`, que ya
-- existían, quedan cubiertas sin reescribirlas.
--
-- El cupo se cuenta bajo un candado de transacción: dos dueños confirmando
-- en el mismo instante entran uno después del otro, y el segundo ve lo que
-- agendó el primero. Es lo que cierra la ventana que midió
-- `capacidad-multiusuario.test.ts`.
create or replace function lo_que_cuida_la_casa()
returns trigger
language plpgsql
as $$
declare
  -- NEGOCIO.capacidad.maximoSimultaneo
  maximo constant integer := 25;
  -- NEGOCIO.agenda.diasMaximosDeAnticipacion
  horizonte constant integer := 180;
  -- NEGOCIO.diaDePrueba.maximoPorBloque
  por_bloque constant integer := 1;
  f perros;
  ini timestamptz;
  fin timestamptz;
  el_dia date;
  de_prueba boolean;
begin
  if not es_dueno() then
    return new;
  end if;

  ini := new.inicio_programado;
  fin := new.fin_programado;
  el_dia := (ini at time zone 'America/Santiago')::date;
  -- En dos pasos a propósito: `new.origen` no existe en la tabla de hotel y
  -- plpgsql no promete cortocircuito en un `and`.
  if tg_table_name = 'estadias_jardin' then
    de_prueba := new.origen = 'dia_de_prueba';
  else
    de_prueba := false;
  end if;

  select * into f from perros where id = new.perro_id;
  if not found or f.cliente_id <> new.cliente_id
     or f.cliente_id is distinct from mi_cliente_id() then
    raise exception 'Ese perro no es tuyo.';
  end if;

  if fin <= ini then
    raise exception 'El retiro tiene que ser después de la llegada.';
  end if;
  if ini <= now() then
    raise exception 'Esa hora ya pasó.';
  end if;
  if el_dia > (now() at time zone 'America/Santiago')::date + horizonte then
    raise exception 'Todavía no se puede agendar tan adelante.';
  end if;

  perform revisar_admision(f, el_dia, de_prueba);

  -- Un perro, una jornada por día; una reserva de hotel no se pisa con otra
  -- del mismo perro. Es el límite natural de lo que un script puede llenar.
  if tg_table_name = 'estadias_jardin' then
    if exists (select 1 from estadias_jardin
                where perro_id = new.perro_id and fecha = new.fecha
                  and estado not in ('cancelada', 'no_show')
                  and id <> new.id) then
      raise exception 'Ese perro ya tiene el día agendado.';
    end if;
  else
    if exists (select 1 from reservas_hotel
                where perro_id = new.perro_id
                  and estado not in ('cancelada', 'no_show')
                  and inicio_programado < fin and fin_programado > ini
                  and id <> new.id) then
      raise exception 'Ese perro ya tiene una reserva en esas fechas.';
    end if;
  end if;

  -- Todo lo que cuenta cupo pasa por este candado, de a uno.
  perform pg_advisory_xact_lock(hashtext('la-patoteca:cupo'));

  if de_prueba and (
       select count(*) from estadias_jardin
        where origen = 'dia_de_prueba' and estado <> 'cancelada'
          and inicio_programado = ini and id <> new.id) >= por_bloque then
    raise exception 'Ese bloque ya tiene un perro nuevo, elige otra hora.';
  end if;

  if pico_de_ocupacion(ini, fin) >= maximo then
    raise exception 'No queda cupo en alguna de las horas que elegiste.';
  end if;

  return new;
end $$;

drop trigger if exists lo_que_cuida_la_casa_jardin on estadias_jardin;
create trigger lo_que_cuida_la_casa_jardin
  before insert or update of inicio_programado, fin_programado, perro_id
  on estadias_jardin for each row execute function lo_que_cuida_la_casa();

drop trigger if exists lo_que_cuida_la_casa_hotel on reservas_hotel;
create trigger lo_que_cuida_la_casa_hotel
  before insert or update of inicio_programado, fin_programado, perro_id
  on reservas_hotel for each row execute function lo_que_cuida_la_casa();

/* ── Ya nada se agenda directo ────────────────────────────────────── */

-- Redefine el disparador de `planes_y_dia_de_prueba`: antes dejaba pasar un
-- día suelto o una reserva "con la forma correcta". Ahora el precio lo
-- pone la base, así que la forma correcta es pasar por la función.
create or replace function lo_que_agenda_el_dueno()
returns trigger
language plpgsql
as $$
begin
  if escribe_por_fuera() then
    raise exception 'Eso se agenda desde la app.';
  end if;
  return new;
end;
$$;

-- Los cobros nacen adentro de las funciones. El dueño ya no inserta ninguno
-- a mano: era por donde se fabricaba el recargo "ya decidido" en $0.
drop policy if exists "agendo y queda pendiente" on pagos;

create or replace function lo_que_no_se_escribe_por_fuera()
returns trigger
language plpgsql
as $$
begin
  if escribe_por_fuera() then
    raise exception 'Eso lo hace la app, no se escribe directo.';
  end if;
  -- En un `delete` lo que hay es `old`: devolver `new` (nulo) le saltaría
  -- el borrado a Administración sin ningún error.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists por_fuera_ordenes on ordenes;
create trigger por_fuera_ordenes before insert or update or delete on ordenes
  for each row execute function lo_que_no_se_escribe_por_fuera();

drop trigger if exists por_fuera_suscripciones on suscripciones;
create trigger por_fuera_suscripciones before insert or update or delete on suscripciones
  for each row execute function lo_que_no_se_escribe_por_fuera();

drop trigger if exists por_fuera_pagos on pagos;
create trigger por_fuera_pagos before insert or update or delete on pagos
  for each row execute function lo_que_no_se_escribe_por_fuera();

/* ── Los servicios se piden; el precio lo pone la casa ────────────── */

-- Un servicio pedido desde el portal nace `por_confirmar` y sin cobro, y
-- Administración le pone precio desde su cola. Si el dueño pudiera
-- insertarlo ya "agendado" se saltaría esa cola y no se cobraría nunca.
create or replace function lo_que_pide_el_dueno()
returns trigger
language plpgsql
as $$
declare
  -- NEGOCIO.agenda.diasMaximosDeAnticipacion
  horizonte constant integer := 180;
begin
  if not escribe_por_fuera() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Un servicio pedido lo cambia la casa.';
  end if;
  if new.estado <> 'por_confirmar' then
    raise exception 'El servicio nace por confirmar: el valor lo pone la casa.';
  end if;
  if not exists (select 1 from perros
                  where id = new.perro_id and cliente_id = new.cliente_id
                    and cliente_id = mi_cliente_id()) then
    raise exception 'Ese perro no es tuyo.';
  end if;
  if new.fecha_hora <= now() then
    raise exception 'Esa hora ya pasó.';
  end if;
  if (new.fecha_hora at time zone 'America/Santiago')::date
       > (now() at time zone 'America/Santiago')::date + horizonte then
    raise exception 'Todavía no se puede agendar tan adelante.';
  end if;
  return new;
end;
$$;

drop trigger if exists lo_que_pide_el_dueno on servicios;
create trigger lo_que_pide_el_dueno before insert or update or delete on servicios
  for each row execute function lo_que_pide_el_dueno();

/* ── El stock lo mueve la casa, o una compra ──────────────────────── */

-- `descontar_stock` queda para el inventario de Administración. La compra
-- del dueño descuenta adentro de `comprar_en_tienda`, que es la única que
-- sabe cuánto y a qué precio.
create or replace function descontar_stock(producto uuid, cantidad integer)
returns productos
language plpgsql
security definer
set search_path = public
as $$
declare fila productos;
begin
  if not coalesce(es_equipo(), false) then
    raise exception 'El stock lo mueve la casa.';
  end if;
  if cantidad < 0 then
    raise exception 'La cantidad a descontar no puede ser negativa.';
  end if;

  update productos
     set stock = greatest(0, stock - cantidad)
   where id = producto
  returning * into fila;

  if not found then
    raise exception 'No existe el producto %', producto;
  end if;

  return fila;
end $$;

/* ── Agendar un día suelto: precio, cobro y día, juntos ───────────── */

-- El `segundo perro` mira a los OTROS perros del mismo dueño comprometidos
-- ese día, sin contar los cancelados. La app cuenta igual (`indicePerro`).
create or replace function hay_otro_perro_del_dueno(el_cliente uuid, el_perro uuid, el_dia date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from estadias_jardin
     where cliente_id = el_cliente and perro_id <> el_perro and fecha = el_dia
       and estado not in ('cancelada', 'no_show'));
$$;

create or replace function agendar_dia_suelto(
  perro uuid,
  nueva_fecha date,
  nuevo_inicio timestamptz,
  nuevo_fin timestamptz,
  la_cotizacion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.jardin.horasJornadaCorta
  horas_corta constant numeric := 4;
  -- NEGOCIO.jardin.horasJornadaMedia
  horas_media constant numeric := 8;
  -- PRECIOS.jardin.jornadaCorta
  precio_corta constant integer := 10000;
  -- PRECIOS.jardin.jornadaMedia
  precio_media constant integer := 16000;
  -- PRECIOS.jardin.jornadaLarga
  precio_larga constant integer := 18000;
  -- DESCUENTOS.segundoPerro
  segundo_perro constant numeric := 0.2;
  f perros;
  e estadias_jardin;
  horas numeric;
  subtotal integer;
  descuento integer := 0;
  total integer;
  pago jsonb;
begin
  select * into f from perros where id = perro for update;
  if not found or not coalesce(f.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese perro.';
  end if;
  if (nuevo_inicio at time zone 'America/Santiago')::date <> nueva_fecha then
    raise exception 'La hora no cae en ese día.';
  end if;

  horas := extract(epoch from (nuevo_fin - nuevo_inicio)) / 3600;
  subtotal := case when horas < horas_corta then precio_corta
                   when horas <= horas_media then precio_media
                   else precio_larga end;
  if hay_otro_perro_del_dueno(f.cliente_id, f.id, nueva_fecha) then
    descuento := round(subtotal * segundo_perro);
  end if;
  total := subtotal - descuento;

  -- La cotización la arma la app para mostrarla; lo que se cobra lo pone la
  -- base. Si no coinciden, alguien la tocó en el camino.
  if coalesce((la_cotizacion->>'total')::numeric, -1) <> total then
    raise exception 'El precio del día no calza.';
  end if;

  insert into estadias_jardin
    (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen,
     estado, cotizacion, creada_en)
  values
    (f.cliente_id, f.id, nueva_fecha, nuevo_inicio, nuevo_fin, 'dia_suelto',
     'esperada', la_cotizacion, now())
  returning * into e;

  insert into pagos as g
    (cliente_id, concepto, referencia_id, monto, estado, emitido_en)
  values
    (f.cliente_id, 'dia_suelto', e.id, total, 'pendiente', now())
  returning to_jsonb(g.*) into pago;

  return jsonb_build_object('estadia', to_jsonb(e), 'pago', pago);
end $$;

revoke all on function agendar_dia_suelto(uuid, date, timestamptz, timestamptz, jsonb) from public;
grant execute on function agendar_dia_suelto(uuid, date, timestamptz, timestamptz, jsonb) to authenticated;

/* ── Reservar hotel: precio en cascada, abono y reserva, juntos ───── */

create or replace function reservar_hotel(
  perro uuid,
  nuevo_inicio timestamptz,
  nuevo_fin timestamptz,
  paseos integer,
  paseos_cortos integer,
  la_cotizacion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.hotel.horasPorBloque
  horas_por_bloque constant numeric := 24;
  -- NEGOCIO.hotel.horasToleranciaCheckout
  tolerancia constant numeric := 2;
  -- NEGOCIO.hotel.nochesParaDescuento10
  noches_para_10 constant integer := 7;
  -- NEGOCIO.hotel.nochesParaDescuento15
  noches_para_15 constant integer := 14;
  -- NEGOCIO.hotel.fraccionAbono
  fraccion_abono constant numeric := 0.5;
  -- PRECIOS.hotel.bloque24h
  precio_bloque constant integer := 24000;
  -- PRECIOS.hotel.horaExtra
  precio_hora_extra constant integer := 1000;
  -- PRECIOS.hotel.paseo
  precio_paseo constant integer := 4000;
  -- PRECIOS.hotel.paseoCorto
  precio_paseo_corto constant integer := 2000;
  -- PASEOS_POR_PACK
  paseos_por_pack constant integer := 3;
  -- PRECIOS.paseoPack3.30
  precio_pack_paseo constant integer := 10000;
  -- PRECIOS.paseoPack3.15
  precio_pack_paseo_corto constant integer := 5000;
  -- DESCUENTOS.hotelDesde7Noches
  desde_7 constant numeric := 0.1;
  -- DESCUENTOS.hotelDesde14Noches
  desde_14 constant numeric := 0.15;
  -- DESCUENTOS.segundoPerro
  segundo_perro constant numeric := 0.2;
  f perros;
  r reservas_hotel;
  desde date;
  horas numeric;
  bloques integer;
  sobrantes numeric;
  extra integer := 0;
  subtotal integer;
  restante numeric;
  total integer;
  abono integer;
  pago jsonb;
begin
  select * into f from perros where id = perro for update;
  if not found or not coalesce(f.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese perro.';
  end if;
  if coalesce(paseos, 0) < 0 or coalesce(paseos_cortos, 0) < 0 then
    raise exception 'Los paseos no pueden ser negativos.';
  end if;

  desde := (nuevo_inicio at time zone 'America/Santiago')::date;
  horas := greatest(0, extract(epoch from (nuevo_fin - nuevo_inicio)) / 3600);
  bloques := greatest(1, floor(horas / horas_por_bloque));
  sobrantes := greatest(0, horas - bloques * horas_por_bloque);
  if sobrantes - tolerancia > 0 then
    extra := ceil(sobrantes - tolerancia);
  end if;

  -- Los paseos, como `lineasDePaseos`: cada tres, el precio de la promo; el
  -- resto, sueltos. Entre enteros, `/` es la división entera.
  subtotal := bloques * precio_bloque + extra * precio_hora_extra
            + (coalesce(paseos, 0) / paseos_por_pack) * precio_pack_paseo
            + (coalesce(paseos, 0) % paseos_por_pack) * precio_paseo
            + (coalesce(paseos_cortos, 0) / paseos_por_pack) * precio_pack_paseo_corto
            + (coalesce(paseos_cortos, 0) % paseos_por_pack) * precio_paseo_corto;

  -- La cascada, en el mismo orden que `calcularPrecioHotel`: duración y
  -- segundo perro, cada uno sobre lo que va quedando. El plan de jardín ya
  -- no descuenta el hotel (11-11-2026): el folleto no lo da.
  restante := subtotal;
  if bloques >= noches_para_15 then
    restante := restante - round(restante * desde_14);
  elsif bloques >= noches_para_10 then
    restante := restante - round(restante * desde_7);
  end if;
  if hay_otro_perro_del_dueno(f.cliente_id, f.id, desde) then
    restante := restante - round(restante * segundo_perro);
  end if;
  total := round(restante);
  abono := round(total * fraccion_abono);

  if coalesce((la_cotizacion->>'total')::numeric, -1) <> total
     or coalesce((la_cotizacion->>'abono')::numeric, -1) <> abono then
    raise exception 'El precio del hotel no calza.';
  end if;

  insert into reservas_hotel
    (cliente_id, perro_id, inicio_programado, fin_programado,
     paseos_contratados, paseos_cortos_contratados, estado, cotizacion,
     abono_pagado, creada_en)
  values
    (f.cliente_id, f.id, nuevo_inicio, nuevo_fin,
     coalesce(paseos, 0), coalesce(paseos_cortos, 0), 'pendiente', la_cotizacion,
     false, now())
  returning * into r;

  insert into pagos as g
    (cliente_id, concepto, referencia_id, monto, estado, emitido_en, vence_en)
  values
    (f.cliente_id, 'abono_hotel', r.id, abono, 'pendiente', now(), desde)
  returning to_jsonb(g.*) into pago;

  return jsonb_build_object('reserva', to_jsonb(r), 'pago', pago);
end $$;

revoke all on function reservar_hotel(uuid, timestamptz, timestamptz, integer, integer, jsonb) from public;
grant execute on function reservar_hotel(uuid, timestamptz, timestamptz, integer, integer, jsonb) to authenticated;

/* ── Comprar en la tienda: precio de la vitrina, stock y orden, juntos ── */

-- Lo que había era un agujero y un bug a la vez: el dueño descontaba stock
-- a mano y la orden nacía "pagada" con el total que él mandara — y en la
-- nube la base rechazaba el cobro, así que la compra fallaba con el stock
-- ya descontado. Ahora el precio lo pone la vitrina, lo que no alcanza se
-- ajusta y se avisa, y la orden nace PENDIENTE como todo lo demás: se
-- transfiere y Administración la marca pagada.
create or replace function comprar_en_tienda(los_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.tienda.ordenesSinPagarMaximas
  sin_pagar_maximas constant integer := 3;
  el_cliente uuid := mi_cliente_id();
  item jsonb;
  p productos;
  cantidad integer;
  lineas jsonb := '[]';
  ajustados text[] := '{}';
  total integer := 0;
  o ordenes;
  pago jsonb;
begin
  if el_cliente is null then
    raise exception 'Hay que tener cuenta para comprar.';
  end if;

  -- Un script podría vaciar la vitrina con órdenes que nadie paga. Con
  -- tres sin pagar, la siguiente espera a que se concilie alguna.
  if (select count(*) from ordenes
       where cliente_id = el_cliente and estado = 'pendiente') >= sin_pagar_maximas then
    raise exception 'Tienes compras pendientes de pago: escríbenos y las ordenamos.';
  end if;

  for item in select * from jsonb_array_elements(coalesce(los_items, '[]')) loop
    select * into p from productos
     where id = (item->>'productoId')::uuid and activo for update;
    if not found or p.stock = 0 then
      if found then ajustados := ajustados || (p.nombre || ' quedó sin stock.'); end if;
      continue;
    end if;

    cantidad := least(greatest(0, coalesce((item->>'cantidad')::integer, 0)), p.stock);
    if cantidad = 0 then continue; end if;
    if cantidad < (item->>'cantidad')::integer then
      ajustados := ajustados || ('De ' || p.nombre || ' quedaban ' || p.stock || ': se cobraron esos.');
    end if;

    update productos set stock = stock - cantidad where id = p.id;
    lineas := lineas || jsonb_build_object(
      'productoId', p.id, 'nombre', p.nombre,
      'cantidad', cantidad, 'precioUnitario', p.precio);
    total := total + cantidad * p.precio;
  end loop;

  if jsonb_array_length(lineas) = 0 then
    raise exception 'Ninguno de los productos tiene stock.';
  end if;

  insert into ordenes (cliente_id, items, total, estado, creada_en)
  values (el_cliente, lineas, total, 'pendiente', now())
  returning * into o;

  insert into pagos as g (cliente_id, concepto, referencia_id, monto, estado, emitido_en)
  values (el_cliente, 'tienda', o.id, total, 'pendiente', now())
  returning to_jsonb(g.*) into pago;

  return jsonb_build_object(
    'orden', to_jsonb(o), 'pago', pago, 'ajustados', to_jsonb(ajustados));
end $$;

revoke all on function comprar_en_tienda(jsonb) from public;
grant execute on function comprar_en_tienda(jsonb) to authenticated;
