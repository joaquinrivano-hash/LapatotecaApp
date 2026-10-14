-- Imita lo que Supabase ya trae puesto. NO es parte del proyecto: existe
-- solo para probar las migraciones en un Postgres pelado.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'
);

-- En Supabase sale del JWT. Acá de una variable de sesión, para poder
-- ponerme en los zapatos de cada usuario y ver qué filas le llegan.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('prueba.uid', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public
  grant all on tables to anon, authenticated;
