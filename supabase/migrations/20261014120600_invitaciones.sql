-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · cómo entra alguien del equipo                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- El alta del portal exige un perro, porque es el alta de un DUEÑO. La
-- cuidadora no tiene perro que inscribir, así que por ahí no entra.
--
-- Y el rol no se puede pedir al registrarse: si se pudiera, cualquiera se
-- haría admin en el primer formulario. Por eso la invitación va al revés —
-- Administración deja anotado el correo ANTES, y cuando esa persona se
-- registra, la base le pone el rol que le corresponde.
--
-- Nada de esto necesita la service_role key: la decisión la toma el
-- disparador dentro de la base, no una llave en el servidor.

create table if not exists invitaciones (
  -- En minúscula siempre. "Maria@" y "maria@" son la misma persona para
  -- cualquiera menos para una comparación de texto.
  email text primary key,
  rol text not null check (rol in ('staff', 'admin')),
  invitada_por uuid references perfiles (id) on delete set null,
  creada_en timestamptz not null default now(),
  -- Se gasta al usarse: una invitación que sirve para siempre es una
  -- invitación que alguien reutiliza.
  usada_en timestamptz
);

/* ── El disparador ahora mira la invitación ───────────────────────── */

create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitado text;
begin
  -- Solo una invitación sin usar da rol. Si no hay ninguna, la cuenta nace
  -- cliente, que es lo que corresponde a cualquiera que llegue por su cuenta.
  select rol into invitado
    from invitaciones
   where email = lower(new.email)
     and usada_en is null;

  insert into perfiles (id, rol, nombre)
  values (
    new.id,
    coalesce(invitado, 'cliente'),
    coalesce(new.raw_user_meta_data ->> 'nombre', '')
  )
  on conflict (id) do nothing;

  if invitado is not null then
    update invitaciones set usada_en = now() where email = lower(new.email);
  end if;

  return new;
end;
$$;

/* ── Quién puede invitar ──────────────────────────────────────────── */

alter table invitaciones enable row level security;

grant select, insert, update, delete on invitaciones to authenticated;

-- Solo Administración, y de punta a punta: invitar es repartir permisos.
drop policy if exists "administracion invita" on invitaciones;
create policy "administracion invita" on invitaciones
  for all using (es_admin()) with check (es_admin());
