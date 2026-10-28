-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · las tareas del día                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Es lo que el equipo escribía en el grupo "La Patoteca REPORTES": después
-- de cada comida, la rutina (comida, cacas, aguas, reportes), el aseo, los
-- encargos de Administración, los remedios y las novedades para el turno
-- que viene. Dos tablas:
--
--   tareas              → lo que la casa quiere que se haga. La rutina de
--                         aseo se repite ciertos días de la semana; el
--                         encargo aparece desde su fecha y se arrastra
--                         hasta que alguien lo hace. Lo arma Administración.
--   registros_de_tareas → lo que el equipo fue marcando, día por día.
--
-- No está acoplada: el código viejo no nombra estas tablas, así que se
-- puede correr antes de publicar. Al revés, sin ella la pantalla de tareas
-- falla al cargar.

create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  instrucciones text,
  tipo text not null check (tipo in ('rutina', 'encargo')),
  -- 0 = domingo … 6 = sábado. Solo la rutina.
  dias_de_la_semana int[],
  -- Desde qué día aparece. Solo el encargo.
  fecha date,
  ronda text check (ronda in ('manana', 'mediodia', 'tarde')),
  activa boolean not null default true,
  orden int not null default 0,
  creada_por text,
  creada_en timestamptz not null default now(),
  check (tipo <> 'encargo' or fecha is not null)
);

create index if not exists tareas_activas on tareas (activa, tipo);

create table if not exists registros_de_tareas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  -- El id de una tarea, o una clave de rutina: 'ronda:manana:aguas',
  -- 'medicamento:<perro>', 'extra', 'novedad'. Texto y no llave foránea
  -- porque la mayoría no apunta a una fila.
  clave text not null,
  estado text not null
    check (estado in ('pendiente', 'en_proceso', 'hecha', 'no_se_hizo')),
  nota text,
  -- En la comida: los que no comieron. Sin llave foránea, igual que en
  -- `reportes.perro_ids`.
  perro_ids uuid[],
  autor_staff text not null,
  autor_id uuid references perfiles (id) on delete set null,
  marcado_en timestamptz not null default now()
);

create index if not exists registros_de_tareas_por_fecha
  on registros_de_tareas (fecha);
create index if not exists registros_de_tareas_por_clave
  on registros_de_tareas (clave);

alter table tareas enable row level security;
alter table registros_de_tareas enable row level security;

-- El proyecto no expone tablas nuevas solo: hay que nombrarlas.
grant select, insert, update, delete on tareas to authenticated;
grant select, insert, update, delete on registros_de_tareas to authenticated;

/* ── tareas ───────────────────────────────────────────────────────── */

-- El equipo ve la lista entera: es su trabajo del día.
drop policy if exists "el equipo ve las tareas" on tareas;
create policy "el equipo ve las tareas" on tareas
  for select using (es_equipo());

-- Qué se hace y cuándo lo decide Administración. Si el turno pudiera
-- editar la rutina, "no se hizo" se arreglaría borrando la tarea.
drop policy if exists "administracion arma las tareas" on tareas;
create policy "administracion arma las tareas" on tareas
  for all using (es_admin()) with check (es_admin());

/* ── registros_de_tareas ──────────────────────────────────────────── */

drop policy if exists "el equipo ve lo marcado" on registros_de_tareas;
create policy "el equipo ve lo marcado" on registros_de_tareas
  for select using (es_equipo());

drop policy if exists "el equipo marca" on registros_de_tareas;
create policy "el equipo marca" on registros_de_tareas
  for insert with check (es_equipo());

/*
 * Cualquiera del equipo corrige un paso del día, no solo quien lo marcó:
 * el día es uno solo y lo comparten los dos turnos. Si José marcó las aguas
 * a las 10 y Flo las vuelve a cambiar a las 14, el registro es de Flo.
 */
drop policy if exists "el equipo corrige lo marcado" on registros_de_tareas;
create policy "el equipo corrige lo marcado" on registros_de_tareas
  for update using (es_equipo()) with check (es_equipo());

-- Borrar, solo lo propio: una novedad mal escrita se saca; la de otra
-- persona no.
drop policy if exists "cada uno borra lo suyo" on registros_de_tareas;
create policy "cada uno borra lo suyo" on registros_de_tareas
  for delete using (autor_id = auth.uid() or es_admin());

/*
 * La firma la pone la base, igual que firmar_la_marca: sin esto, alguien
 * del equipo podría atribuirle a otra persona algo que no hizo escribiendo
 * otro id desde la consola. Administración sí puede: corrige registros.
 */
create or replace function firmar_el_registro_de_tarea()
returns trigger
language plpgsql
as $$
begin
  if es_admin() then
    return new;
  end if;
  new.autor_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists al_marcar_una_tarea on registros_de_tareas;
create trigger al_marcar_una_tarea before insert or update on registros_de_tareas
  for each row execute function firmar_el_registro_de_tarea();
