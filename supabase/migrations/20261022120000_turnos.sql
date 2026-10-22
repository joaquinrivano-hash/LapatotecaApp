-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · quién cubre qué horas                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Un turno es una promesa: tal persona cubre de tal hora a tal hora, tal
-- día. Al lado se guarda lo que pasó de verdad, que viene de dos fuentes
-- distintas y NO son lo mismo:
--
--   entrada_real / salida_real → la persona fichó. Es la hora exacta.
--   (los rastros)              → lo que hizo durante el turno: reportes e
--                                incidentes llevan su nombre y su hora.
--                                Eso es un PISO, no la presencia: si llegó
--                                a las 7 y el primer perro a las 8, su
--                                primer rastro es a las 8.
--
-- La app las muestra por separado a propósito. Juntarlas en "hora de
-- entrada" sería presentar una deducción como un hecho.

create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  fecha date not null,
  -- "07:00". Texto y no `time` porque la app los maneja como HH:MM en
  -- todas partes, y convertir de ida y vuelta solo agrega lugares donde
  -- equivocarse con la zona horaria.
  desde text not null,
  hasta text not null,
  entrada_real timestamptz,
  salida_real timestamptz,
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists turnos_por_fecha on turnos (fecha);
create index if not exists turnos_por_persona on turnos (perfil_id, fecha);

alter table turnos enable row level security;

grant select, insert, update, delete on turnos to authenticated;

/*
 * El equipo ve la planilla completa.
 *
 * No solo su turno: saber quién viene en el siguiente es parte de hacer el
 * propio. Una planilla donde cada uno ve solo su fila obliga a preguntar
 * por WhatsApp lo que debería estar a la vista.
 */
drop policy if exists "el equipo ve la planilla" on turnos;
create policy "el equipo ve la planilla" on turnos
  for select using (es_equipo());

-- La planilla la arma Administración, de punta a punta.
drop policy if exists "administracion arma los turnos" on turnos;
create policy "administracion arma los turnos" on turnos
  for all using (es_admin()) with check (es_admin());

/*
 * Y cada quien ficha el suyo.
 *
 * Es un `update` sobre su propia fila, que es lo único que RLS sabe
 * acotar: no puede decir "solo estas dos columnas". Esa parte la cuida el
 * disparador de abajo.
 */
drop policy if exists "cada uno ficha su turno" on turnos;
create policy "cada uno ficha su turno" on turnos
  for update using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

/*
 * Lo que el fichaje NO puede tocar: el turno planificado.
 *
 * Sin esto, la política de arriba deja a cualquiera reescribir su propio
 * horario — y entonces la comparación entre lo planificado y lo real deja
 * de significar algo, porque el que llegó tarde puede correr la hora de
 * entrada y quedar puntual. Es la misma idea que proteger_ficha_de_la_casa.
 *
 * Administración sí puede: para eso arma la planilla.
 */
create or replace function proteger_turno_planificado()
returns trigger
language plpgsql
as $$
begin
  if es_admin() then
    return new;
  end if;

  if new.perfil_id is distinct from old.perfil_id
    or new.fecha is distinct from old.fecha
    or new.desde is distinct from old.desde
    or new.hasta is distinct from old.hasta then
    raise exception 'El turno planificado lo cambia Administración.';
  end if;

  return new;
end;
$$;

drop trigger if exists al_fichar_el_turno on turnos;
create trigger al_fichar_el_turno before update on turnos
  for each row execute function proteger_turno_planificado();
