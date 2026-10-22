-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · el saldo del plan y el día de prueba, en la base  ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Dos agujeros de la misma familia que el de las cancelaciones: RLS acota
-- filas, no columnas, y el dueño tenía la API a mano.
--
--   planes  → podía bajarse `dias_usados` a cero (días gratis), o insertar
--             un plan entero sin cobro. Y comprar uno desde el portal ni
--             siquiera funcionaba: el cobro nacía "pagado", la base lo
--             rechazaba, y el plan quedaba creado y usable SIN cobro.
--   perros  → podía marcarse el día de prueba como aprobado, o nacer
--             aprobado, y saltarse la evaluación que la casa exige antes de
--             la primera reserva.
--
-- Igual que con las cancelaciones (`20261022150000_cambios_de_agenda.sql`),
-- lo que el dueño hace con esos datos pasa por funciones que saben hacer
-- exactamente una cosa, entera y en una transacción:
--
--   comprar_plan_de_jardin  → calcula días, precio y vencimiento, cierra el
--                             plan anterior y deja el cobro PENDIENTE.
--   agendar_dia_con_plan    → crea el día y descuenta uno del pack.
--   agendar_dia_de_prueba   → crea el día, su cobro y deja al perro
--                             agendado.
--
-- Y disparadores que no dejan hacer lo mismo por fuera. Que haya cupo y que
-- el perro cumpla la admisión lo sigue revisando la app antes de llamar, como
-- con todo lo que se agenda: es una pregunta de capacidad, no de plata.

/* ── Las reglas, con los mismos números que lib/config ────────────── */

-- Cada constante lleva arriba el nombre de su gemela en TypeScript, y
-- `lib/repo/supabase/reglas-en-la-base.test.ts` verifica que valgan lo
-- mismo. Si alguien cambia un precio en `precios.ts` y no acá, la pantalla
-- cotizaría una cosa y la base cobraría otra.

/* ── Comprar un plan ──────────────────────────────────────────────── */

create or replace function comprar_plan_de_jardin(
  perro uuid,
  tipo_de_plan text,
  dias integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.planes.minimoDias
  minimo_dias constant integer := 5;
  -- PRECIOS.planes.tramosPorDia.0.hastaDias
  hasta_primer_tramo constant integer := 10;
  -- PRECIOS.planes.tramosPorDia.0.precioPorDia
  precio_primer_tramo constant integer := 15000;
  -- PRECIOS.planes.tramosPorDia.1.precioPorDia
  precio_segundo_tramo constant integer := 14000;
  -- PRECIOS.planes.paseLibre
  precio_pase_libre constant integer := 220000;
  f perros;
  hoy date := (now() at time zone 'America/Santiago')::date;
  vence date;
  dias_totales integer;
  precio integer;
  plan jsonb;
  pago jsonb;
begin
  select * into f from perros where id = perro;

  -- El mismo mensaje para "no existe" y "no es tuyo". Y el `coalesce` es el
  -- de siempre: para quien no es dueño `mi_cliente_id()` es nulo, `not
  -- nulo` también, y un `if` nulo no entra.
  if not found or not coalesce(f.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese perro.';
  end if;
  if tipo_de_plan not in ('dias', 'pase_libre') then
    raise exception 'No existe ese plan.';
  end if;

  -- Mensual: vale hasta el último día del mes en que se compra.
  vence := (date_trunc('month', hoy) + interval '1 month - 1 day')::date;

  if tipo_de_plan = 'pase_libre' then
    -- Los días hábiles que le quedan al mes: es lo máximo que se puede usar
    -- de verdad, y así el saldo funciona igual que en cualquier plan.
    select count(*) into dias_totales
      from generate_series(hoy, vence, interval '1 day') as d
     where extract(isodow from d) < 6;
    precio := precio_pase_libre;
  else
    dias_totales := greatest(minimo_dias, coalesce(dias, minimo_dias));
    precio := dias_totales * case
      when dias_totales <= hasta_primer_tramo then precio_primer_tramo
      else precio_segundo_tramo
    end;
  end if;

  -- Los días no son acumulables: comprar uno nuevo cierra el que estaba
  -- vigente. Queda la fecha, para que el historial no mienta.
  update planes set cerrado_en = now()
   where perro_id = f.id
     and cerrado_en is null
     and dias_usados < planes.dias_totales
     and vence_en >= hoy;

  insert into planes as p
    (cliente_id, perro_id, tipo, dias_totales, dias_usados, comprado_en,
     vence_en, precio)
  values
    (f.cliente_id, f.id, tipo_de_plan, dias_totales, 0, now(), vence, precio)
  returning to_jsonb(p.*) into plan;

  -- Pendiente: no hay pasarela. El dueño transfiere y Administración lo
  -- marca pagado, igual que el abono del hotel y el día suelto.
  insert into pagos as g
    (cliente_id, concepto, referencia_id, monto, estado, emitido_en)
  values
    (f.cliente_id, 'plan', (plan->>'id')::uuid, precio, 'pendiente', now())
  returning to_jsonb(g.*) into pago;

  return jsonb_build_object('plan', plan, 'pago', pago);
end $$;

revoke all on function comprar_plan_de_jardin(uuid, text, integer) from public;
grant execute on function comprar_plan_de_jardin(uuid, text, integer) to authenticated;

/* ── Usar un día del plan ─────────────────────────────────────────── */

-- El día del pack se descuenta al AGENDAR, no cuando el perro llega. Y crear
-- el día y descontarlo van juntos: si fueran por separado, un día creado sin
-- descontar sería gratis, y uno descontado sin crear sería un día perdido.
create or replace function agendar_dia_con_plan(
  plan uuid,
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
  -- NEGOCIO.planes.soloDiasHabiles
  solo_dias_habiles constant boolean := true;
  p planes;
  e estadias_jardin;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  select * into p from planes where id = plan for update;

  if not found or not coalesce(p.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese plan.';
  end if;
  if p.cerrado_en is not null or p.dias_usados >= p.dias_totales
    or nueva_fecha > p.vence_en then
    raise exception 'Ese plan ya no cubre ese día.';
  end if;
  if solo_dias_habiles and extract(isodow from nueva_fecha) > 5 then
    raise exception 'Los días del plan se usan de lunes a viernes.';
  end if;
  if nueva_fecha < hoy or nuevo_fin <= nuevo_inicio
    or (nuevo_inicio at time zone 'America/Santiago')::date <> nueva_fecha then
    raise exception 'Esa hora no sirve para un día de jardín.';
  end if;
  -- Un perro no tiene dos jornadas el mismo día, y menos dos días del pack.
  if exists (
    select 1 from estadias_jardin
     where perro_id = p.perro_id and fecha = nueva_fecha and estado <> 'cancelada'
  ) then
    raise exception 'Ese perro ya tiene el día agendado.';
  end if;

  insert into estadias_jardin
    (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen,
     plan_id, estado, cotizacion, creada_en)
  values
    (p.cliente_id, p.perro_id, nueva_fecha, nuevo_inicio, nuevo_fin, 'plan',
     p.id, 'esperada', la_cotizacion, now())
  returning * into e;

  update planes set dias_usados = dias_usados + 1
   where id = p.id
  returning * into p;

  return jsonb_build_object('estadia', to_jsonb(e), 'plan', to_jsonb(p));
end $$;

revoke all on function agendar_dia_con_plan(uuid, date, timestamptz, timestamptz, jsonb) from public;
grant execute on function agendar_dia_con_plan(uuid, date, timestamptz, timestamptz, jsonb) to authenticated;

/* ── Agendar el día de prueba ─────────────────────────────────────── */

create or replace function agendar_dia_de_prueba(
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
  -- PRECIOS.diaDePrueba
  precio constant integer := 10000;
  -- NEGOCIO.diaDePrueba.horasDeEstadia
  horas_de_estadia constant numeric := 6;
  f perros;
  e estadias_jardin;
  pago jsonb;
begin
  select * into f from perros where id = perro for update;

  if not found or not coalesce(f.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese perro.';
  end if;
  -- Solo desde "pendiente": agendado ya lo tiene tomado, y aprobado o
  -- rechazado ya pasó por la casa.
  if coalesce(f.dia_de_prueba->>'estado', 'pendiente') <> 'pendiente' then
    raise exception 'Este perrito ya tiene su día de prueba tomado.';
  end if;
  -- Media jornada, ni más ni menos: un día de prueba de doce horas sería un
  -- día completo al precio de la evaluación.
  if nuevo_inicio <= now()
    or nuevo_fin - nuevo_inicio <> make_interval(hours => horas_de_estadia::integer)
    or (nuevo_inicio at time zone 'America/Santiago')::date <> nueva_fecha then
    raise exception 'Esa hora no sirve para el día de prueba.';
  end if;
  -- La cotización la arma la app para mostrarla; lo que se cobra lo pone la
  -- base. Si no coinciden, alguien la tocó en el camino.
  if coalesce((la_cotizacion->>'total')::numeric, -1) <> precio then
    raise exception 'El precio del día de prueba no calza.';
  end if;

  insert into estadias_jardin
    (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen,
     estado, cotizacion, creada_en)
  values
    (f.cliente_id, f.id, nueva_fecha, nuevo_inicio, nuevo_fin, 'dia_de_prueba',
     'esperada', la_cotizacion, now())
  returning * into e;

  -- Se cobra al agendar, y nace pendiente: Administración lo marca pagado
  -- cuando llega la transferencia.
  insert into pagos as g
    (cliente_id, concepto, referencia_id, monto, estado, emitido_en, vence_en)
  values
    (f.cliente_id, 'dia_de_prueba', e.id, precio, 'pendiente', now(), nueva_fecha)
  returning to_jsonb(g.*) into pago;

  update perros set dia_de_prueba =
    jsonb_build_object('estado', 'agendado', 'fecha', nueva_fecha)
   where id = f.id
  returning * into f;

  return jsonb_build_object(
    'estadia', to_jsonb(e),
    'pago', pago,
    'perro', to_jsonb(f)
  );
end $$;

revoke all on function agendar_dia_de_prueba(uuid, date, timestamptz, timestamptz, jsonb) from public;
grant execute on function agendar_dia_de_prueba(uuid, date, timestamptz, timestamptz, jsonb) to authenticated;

/* ── Lo que el dueño no puede hacer por fuera ─────────────────────── */

-- En los cuatro disparadores pasa lo mismo: el equipo pasa porque es su
-- trabajo, y las funciones de arriba pasan porque corren como su dueña y no
-- como `authenticated`. Misma idea que `proteger_lo_agendado`.

-- Los planes: ni comprarlos ni tocarlos a mano. Comprar, usar un día y
-- devolverlo al cancelar pasan todos por funciones.
create or replace function proteger_los_planes()
returns trigger
language plpgsql
as $$
begin
  if es_equipo() or current_user <> 'authenticated' then
    return new;
  end if;
  raise exception 'Los planes se compran y se usan desde la app.';
end;
$$;

drop trigger if exists los_planes_de_la_casa on planes;
create trigger los_planes_de_la_casa before insert or update on planes
  for each row execute function proteger_los_planes();

-- El día de prueba: lo agenda la app y lo cierra la casa. El dueño sigue
-- mandando sobre el resto de la ficha; esto no le cambia nada de eso.
--
-- Va aparte de `proteger_ficha_de_la_casa` a propósito: redefinir aquella
-- función acá haría que volver a correr su archivo suelto se llevara esta
-- regla sin avisar.
create or replace function proteger_el_dia_de_prueba()
returns trigger
language plpgsql
as $$
begin
  if es_equipo() or current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Un perro nuevo nace sin evaluar. Nacer aprobado sería saltarse la
    -- evaluación antes de llegar.
    if coalesce(new.dia_de_prueba->>'estado', 'pendiente') <> 'pendiente' then
      raise exception 'El día de prueba lo agenda la app y lo cierra la casa.';
    end if;
    return new;
  end if;

  if new.dia_de_prueba is distinct from old.dia_de_prueba then
    raise exception 'El día de prueba lo agenda la app y lo cierra la casa.';
  end if;
  return new;
end;
$$;

drop trigger if exists dia_de_prueba_de_la_casa on perros;
create trigger dia_de_prueba_de_la_casa before insert or update on perros
  for each row execute function proteger_el_dia_de_prueba();

-- Lo que el dueño agenda directo, sin función de por medio, es un día
-- suelto o una reserva de hotel recién pedida. Todo lo demás tiene su
-- función. Sin esto bastaba con insertar:
--
--   · un día "con plan" y cancelarlo a tiempo, para que el pack recuperara
--     un día que nunca se descontó;
--   · un día de prueba sin cobro y moverlo, para quedar agendado gratis;
--   · una reserva de hotel ya confirmada y con el abono marcado.
create or replace function lo_que_agenda_el_dueno()
returns trigger
language plpgsql
as $$
begin
  if es_equipo() or current_user <> 'authenticated' then
    return new;
  end if;

  if tg_table_name = 'estadias_jardin' then
    if new.origen <> 'dia_suelto' or new.plan_id is not null
      or new.estado <> 'esperada'
      or new.inicio_real is not null or new.fin_real is not null then
      raise exception 'Ese día se agenda desde la app.';
    end if;
  elsif tg_table_name = 'reservas_hotel' then
    if new.estado <> 'pendiente' or new.abono_pagado
      or new.inicio_real is not null or new.fin_real is not null
      or new.cancelada_en is not null then
      raise exception 'La reserva nace por confirmar: la confirma la casa.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lo_que_agenda_el_dueno_jardin on estadias_jardin;
create trigger lo_que_agenda_el_dueno_jardin before insert on estadias_jardin
  for each row execute function lo_que_agenda_el_dueno();

drop trigger if exists lo_que_agenda_el_dueno_hotel on reservas_hotel;
create trigger lo_que_agenda_el_dueno_hotel before insert on reservas_hotel
  for each row execute function lo_que_agenda_el_dueno();
