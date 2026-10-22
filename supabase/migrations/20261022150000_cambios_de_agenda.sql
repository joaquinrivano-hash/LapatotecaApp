-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · cancelar y mover lo agendado, con su cobro        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Cancelar un día toca dos cosas: el día y su cobro. El dueño podía
-- escribir el día y NO el cobro —en `pagos` solo crea, nunca modifica—, así
-- que la cancelación quedaba a medias: el día cancelado, el cobro en pie y,
-- en el día de prueba, el perro marcado "agendado" para un día que ya no
-- existía. Desaparecía del calendario y el dueño no podía volver a agendar.
--
-- Abrirle `update` sobre `pagos` habría sido el arreglo fácil y el
-- equivocado: desde la consola podría dejar en $0 cualquier cobro pendiente
-- suyo. Así que, igual que `descontar_stock()`, cada cambio es una función
-- que sabe hacer exactamente una cosa, entera y en una sola transacción:
--
--   cancelar_dia_de_prueba     → con aviso, el cobro queda anulado en cero;
--                                encima de la hora, queda en el cargo tardío.
--   reprogramar_dia_de_prueba  → con aviso, gratis; encima de la hora, un
--                                cargo aparte que queda pendiente.
--   cancelar_dia_de_jardin     → con aviso, se anula o queda por devolver y
--                                el día vuelve al pack; encima, se cobra.
--
-- Lo que decide si avisó a tiempo es la hora de la BASE, no la del
-- navegador: si la mandara el navegador, bastaría con atrasar el reloj del
-- teléfono para cancelar gratis.
--
-- Nada se borra. Un cobro anulado queda reembolsado en cero, que es la
-- constancia de que existió y de que alguien lo canceló a tiempo.

/* ── Las reglas, con los mismos números que lib/config ────────────── */

-- Cada constante lleva arriba el nombre de su gemela en TypeScript, y
-- `lib/repo/supabase/reglas-en-la-base.test.ts` verifica que valgan lo
-- mismo. Si alguien cambia el corte en `negocio.ts` y no acá, la pantalla
-- prometería una cosa y la base cobraría otra: el test lo caza antes.

/* ── Cancelar el día de prueba ────────────────────────────────────── */

create or replace function cancelar_dia_de_prueba(estadia uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.diaDePrueba.horasParaCancelarSinCosto
  horas_sin_costo constant numeric := 24;
  -- PRECIOS.cancelacionTardiaDiaDePrueba
  cargo_tardio constant integer := 5000;
  e estadias_jardin;
  horas numeric;
  sin_costo boolean;
  costo integer;
  cobro_del_dia uuid;
begin
  select * into e from estadias_jardin where id = estadia for update;

  -- El mismo mensaje para "no existe" y "no es tuyo": distinguirlos le
  -- contaría a un curioso qué ids existen.
  --
  -- El `coalesce` no es decorativo. Para el cuidador `mi_cliente_id()` es
  -- nulo, la comparación da nulo, `not nulo` también, y un `if` nulo NO
  -- entra: sin él, el cuidador cancelaba el día de cualquiera. La prueba de
  -- aislamiento lo pilló así.
  if not found or not coalesce(e.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese día.';
  end if;
  if e.origen <> 'dia_de_prueba' then
    raise exception 'Ese día no es un día de prueba.';
  end if;
  if e.estado <> 'esperada' then
    raise exception 'Ese día ya no se puede cancelar.';
  end if;

  horas := extract(epoch from (e.inicio_programado - now())) / 3600;
  sin_costo := horas >= horas_sin_costo;
  costo := case when sin_costo then 0 else cargo_tardio end;

  update estadias_jardin set estado = 'cancelada'
   where id = e.id
  returning * into e;

  -- El cobro DEL DÍA es el primero que se emitió. Los cargos por cambiarlo
  -- encima de la hora son aparte y se quedan como están: cada aviso tardío
  -- se cobra, y cancelar después a tiempo no borra el anterior.
  select id into cobro_del_dia
    from pagos
   where referencia_id = e.id and concepto = 'dia_de_prueba'
   order by emitido_en, id
   limit 1;

  -- Solo si sigue pendiente: anularlo ES la devolución. Si ya lo pagó, la
  -- plata está en la casa y eso lo conversa Administración.
  update pagos set
    monto = costo,
    estado = case when costo > 0 then 'pendiente' else 'reembolsado' end,
    pagado_en = null,
    vence_en = case
      when costo > 0 then (now() at time zone 'America/Santiago')::date
    end
  where id = cobro_del_dia and estado = 'pendiente';

  -- Vuelve a la fila: sin esto el perro quedaría "agendado" para un día que
  -- ya no existe y no podría tomar otro.
  update perros set dia_de_prueba = '{"estado": "pendiente"}'::jsonb
   where id = e.perro_id;

  return jsonb_build_object(
    'estadia', to_jsonb(e),
    'horas_de_aviso', horas,
    'sin_costo', sin_costo,
    'costo', costo
  );
end $$;

revoke all on function cancelar_dia_de_prueba(uuid) from public;
grant execute on function cancelar_dia_de_prueba(uuid) to authenticated;

/* ── Cambiar la fecha del día de prueba ───────────────────────────── */

-- Que el bloque esté libre lo revisa la app antes de llamar, igual que al
-- agendar: el cupo es una pregunta de capacidad, no de plata. Lo que se
-- revisa acá es lo que mueve plata, y lo que haría un horario sin sentido.
create or replace function reprogramar_dia_de_prueba(
  estadia uuid,
  nueva_fecha date,
  nuevo_inicio timestamptz,
  nuevo_fin timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.diaDePrueba.horasParaCancelarSinCosto
  horas_sin_costo constant numeric := 24;
  -- PRECIOS.cancelacionTardiaDiaDePrueba
  cargo_tardio constant integer := 5000;
  e estadias_jardin;
  horas numeric;
  sin_costo boolean;
  cargo jsonb;
begin
  select * into e from estadias_jardin where id = estadia for update;

  if not found or not coalesce(e.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese día.';
  end if;
  if e.origen <> 'dia_de_prueba' then
    raise exception 'Ese día no es un día de prueba.';
  end if;
  if e.estado <> 'esperada' then
    raise exception 'Ese día ya no se puede cambiar.';
  end if;
  if nuevo_fin <= nuevo_inicio or nuevo_inicio <= now()
    or (nuevo_inicio at time zone 'America/Santiago')::date <> nueva_fecha then
    raise exception 'Esa hora no sirve para el día de prueba.';
  end if;

  -- El aviso se mide contra el día que se deja, no contra el nuevo: lo que
  -- se pierde es el cupo de ESE día.
  horas := extract(epoch from (e.inicio_programado - now())) / 3600;
  sin_costo := horas >= horas_sin_costo;

  update estadias_jardin set
    fecha = nueva_fecha,
    inicio_programado = nuevo_inicio,
    fin_programado = nuevo_fin
  where id = e.id
  returning * into e;

  if not sin_costo then
    insert into pagos as p
      (cliente_id, concepto, referencia_id, monto, estado, emitido_en, vence_en)
    values
      (e.cliente_id, 'dia_de_prueba', e.id, cargo_tardio, 'pendiente', now(),
       nueva_fecha)
    returning to_jsonb(p.*) into cargo;
  end if;

  update perros set dia_de_prueba =
    jsonb_build_object('estado', 'agendado', 'fecha', nueva_fecha)
   where id = e.perro_id;

  return jsonb_build_object(
    'estadia', to_jsonb(e),
    'horas_de_aviso', horas,
    'sin_costo', sin_costo,
    'costo', case when sin_costo then 0 else cargo_tardio end,
    'cargo', cargo
  );
end $$;

revoke all on function reprogramar_dia_de_prueba(uuid, date, timestamptz, timestamptz) from public;
grant execute on function reprogramar_dia_de_prueba(uuid, date, timestamptz, timestamptz) to authenticated;

/* ── Cancelar un día de jardín ────────────────────────────────────── */

create or replace function cancelar_dia_de_jardin(estadia uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.jardin.horasParaCancelarSinCosto
  horas_sin_costo constant numeric := 24;
  e estadias_jardin;
  horas numeric;
  devuelve boolean;
  a_devolver integer := 0;
  plan_devuelto jsonb;
begin
  select * into e from estadias_jardin where id = estadia for update;

  if not found or not coalesce(e.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese día.';
  end if;
  -- El día de prueba tiene su propia regla (el cargo tardío) y deja al perro
  -- en la fila. Cancelarlo por acá se saltaría las dos cosas.
  if e.origen = 'dia_de_prueba' then
    raise exception 'El día de prueba se cancela desde su propia pantalla.';
  end if;
  if e.estado <> 'esperada' then
    raise exception 'Ese día ya no se puede cancelar.';
  end if;

  horas := extract(epoch from (e.inicio_programado - now())) / 3600;
  devuelve := horas >= horas_sin_costo;

  update estadias_jardin set estado = 'cancelada'
   where id = e.id
  returning * into e;

  -- Fuera de plazo el día se pierde: el cobro queda como estaba —pendiente
  -- de cobrar si no lo había pagado— y el día del pack queda consumido.
  if devuelve then
    select coalesce(sum(monto), 0) into a_devolver
      from pagos
     where referencia_id = e.id and estado = 'pagado';

    -- Pendiente: anularlo ya es la devolución, no hay plata que mover.
    update pagos set monto = 0, estado = 'reembolsado', pagado_en = null,
                     vence_en = null
     where referencia_id = e.id and estado = 'pendiente';

    -- Pagado: la plata está en la casa. Conserva el monto, que es justo lo
    -- que se le debe, y aparece en "Por devolver".
    update pagos set estado = 'reembolsado', vence_en = null
     where referencia_id = e.id and estado = 'pagado';

    if e.plan_id is not null then
      update planes as p set dias_usados = greatest(0, p.dias_usados - 1)
       where p.id = e.plan_id
      returning to_jsonb(p.*) into plan_devuelto;
    end if;
  end if;

  return jsonb_build_object(
    'estadia', to_jsonb(e),
    'horas_de_aviso', horas,
    'devuelve', devuelve,
    'a_devolver', a_devolver,
    'plan', plan_devuelto
  );
end $$;

revoke all on function cancelar_dia_de_jardin(uuid) from public;
grant execute on function cancelar_dia_de_jardin(uuid) to authenticated;

/* ── Lo agendado no se reescribe desde la consola ─────────────────── */

-- La política "el equipo opera" deja al dueño actualizar SUS estadías y
-- reservas, y RLS acota filas, no columnas. Con eso podía correr la hora de
-- llegada de un día para que pareciera cancelado con aviso, o darse por
-- confirmada una reserva de hotel. Las funciones de arriba miden el aviso
-- contra `inicio_programado`: si el dueño pudiera moverlo a mano, el corte
-- de 24 horas no valdría nada.
--
-- La app ya no le pide al dueño ningún `update` directo sobre estas tablas:
-- agendar es un insert, y cancelar o mover pasa por las funciones. Esas
-- corren como su dueña y no como `authenticated`, y por eso pasan.
--
-- Misma idea que `proteger_ficha_de_la_casa` y `proteger_turno_planificado`.
create or replace function proteger_lo_agendado()
returns trigger
language plpgsql
as $$
begin
  -- El equipo marca llegadas y salidas: es su trabajo.
  if es_equipo() then
    return new;
  end if;

  -- Desde adentro de una función `security definer`: el cambio ya pasó por
  -- las reglas.
  if current_user <> 'authenticated' then
    return new;
  end if;

  raise exception 'Un día agendado se cancela o se cambia desde la app.';
end;
$$;

drop trigger if exists lo_agendado_jardin on estadias_jardin;
create trigger lo_agendado_jardin before update on estadias_jardin
  for each row execute function proteger_lo_agendado();

drop trigger if exists lo_agendado_hotel on reservas_hotel;
create trigger lo_agendado_hotel before update on reservas_hotel
  for each row execute function proteger_lo_agendado();
