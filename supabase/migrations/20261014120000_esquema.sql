-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · esquema                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se pega entero en el editor SQL de Supabase. Se puede correr de nuevo
-- sin hacer daño: todo va con IF NOT EXISTS.
--
-- Criterios:
--
--   · Columnas en español y snake_case. El repositorio traduce a camelCase,
--     así que ni las pantallas ni las reglas se enteran.
--
--   · Los objetos que SIEMPRE se leen junto a su dueño van en `jsonb`:
--     las vacunas de un perro, la cotización de una reserva, los ítems de
--     una orden. Nadie consulta "todas las vacunas" sin el perro al lado,
--     así que partirlos en tablas solo agregaría joins.
--
--   · La plata va en `integer`. El peso chileno no tiene decimales y un
--     `float` redondeando un cobro es un bug esperando.
--
--   · Un día del calendario es `date` y un instante es `timestamptz`. La
--     distinción es la misma que en `lib/utils/fecha.ts` y por el mismo
--     motivo: "2026-09-21" es un día de Santiago, no un instante.

create extension if not exists "pgcrypto";

/* ── Quién es cada quien ──────────────────────────────────────────── */

-- Una fila por cuenta. El rol vive acá y NO en el navegador: es lo que
-- mira la base para decidir qué puede ver cada uno.
create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('cliente', 'staff', 'admin')),
  nombre text not null default '',
  creado_en timestamptz not null default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  -- Nulo mientras el dueño no haya reclamado su cuenta: Administración
  -- puede cargar un cliente antes de que él entre por primera vez.
  perfil_id uuid unique references perfiles (id) on delete set null,
  nombre text not null,
  apellido text not null,
  email text not null,
  telefono text not null,
  comuna text not null,
  direccion text,
  creado_en timestamptz not null default now()
);

create table if not exists perros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  nombre text not null,
  raza text not null,
  peso_kg numeric(5, 2) not null,
  sexo text not null check (sexo in ('macho', 'hembra')),
  esterilizado boolean not null,
  fecha_nacimiento date,
  foto_url text,
  carnet_vacunas_urls text[] not null default '{}',
  vacunas jsonb not null default '[]',
  -- Se deriva del antiparasitario, pero se guarda porque es lo que mira
  -- la admisión, que no tiene por qué saber de duraciones.
  desparasitado_hasta date,
  antiparasitario jsonb,
  sociable boolean,
  dia_de_prueba jsonb not null default '{"estado": "pendiente"}',
  alimentacion jsonb,
  medicamentos jsonb,
  alergias jsonb,
  indicaciones text,
  notas text,
  creado_en timestamptz not null default now()
);

/* ── Planes y suscripciones ───────────────────────────────────────── */

create table if not exists suscripciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid not null references perros (id) on delete cascade,
  tipo text not null,
  dias_contratados integer,
  estado text not null,
  creada_en timestamptz not null default now(),
  proximo_cobro date not null
);

create table if not exists planes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid not null references perros (id) on delete cascade,
  tipo text not null,
  dias_totales integer not null,
  dias_usados integer not null default 0,
  comprado_en timestamptz not null default now(),
  vence_en date not null,
  precio integer not null,
  cerrado_en timestamptz,
  suscripcion_id uuid references suscripciones (id) on delete set null
);

/* ── Lo que ocupa la casa ─────────────────────────────────────────── */

create table if not exists reservas_hotel (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid not null references perros (id) on delete cascade,
  inicio_programado timestamptz not null,
  fin_programado timestamptz not null,
  inicio_real timestamptz,
  fin_real timestamptz,
  paseos_contratados integer not null default 0,
  estado text not null,
  cotizacion jsonb not null,
  abono_pagado boolean not null default false,
  cancelada_en timestamptz,
  creada_en timestamptz not null default now()
);

create table if not exists estadias_jardin (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid not null references perros (id) on delete cascade,
  fecha date not null,
  inicio_programado timestamptz not null,
  fin_programado timestamptz not null,
  inicio_real timestamptz,
  fin_real timestamptz,
  origen text not null,
  plan_id uuid references planes (id) on delete set null,
  estado text not null,
  cotizacion jsonb,
  creada_en timestamptz not null default now()
);

create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid not null references perros (id) on delete cascade,
  tipo text not null,
  fecha_hora timestamptz not null,
  nivel_spa text,
  duracion_min integer,
  km numeric(6, 2),
  estado text not null,
  cotizacion jsonb not null,
  creado_en timestamptz not null default now()
);

/* ── Plata ────────────────────────────────────────────────────────── */

create table if not exists cuentas_mensuales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  periodo text not null,
  emitida_en timestamptz not null default now(),
  renovaciones jsonb not null default '[]',
  consumos jsonb not null default '[]',
  total integer not null,
  estado text not null,
  -- La cuenta del día 1 es idempotente. Hasta ahora eso lo cuidaba el
  -- servicio; acá lo cuida la base, que es donde no se puede olvidar.
  unique (cliente_id, periodo)
);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  concepto text not null,
  referencia_id uuid,
  cuenta_mensual_id uuid references cuentas_mensuales (id) on delete set null,
  monto integer not null,
  estado text not null,
  metodo text,
  emitido_en timestamptz not null default now(),
  vence_en date,
  pagado_en timestamptz
);

/* ── Tienda ───────────────────────────────────────────────────────── */

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text not null default '',
  categoria text not null,
  precio integer not null,
  stock integer not null default 0,
  imagen_url text,
  activo boolean not null default true
);

create table if not exists ordenes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  items jsonb not null default '[]',
  total integer not null,
  estado text not null,
  creada_en timestamptz not null default now()
);

/* ── El día a día ─────────────────────────────────────────────────── */

create table if not exists reportes (
  id uuid primary key default gen_random_uuid(),
  perro_ids uuid[] not null,
  fecha date not null,
  nota text not null,
  foto_url text,
  autor_staff text not null,
  creado_en timestamptz not null default now()
);

create table if not exists incidentes (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references perros (id) on delete cascade,
  fecha date not null,
  tipo text not null,
  gravedad text not null,
  descripcion text not null,
  autor_staff text not null,
  creado_en timestamptz not null default now()
);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  canal text not null,
  cliente_id uuid not null references clientes (id) on delete cascade,
  destino text not null,
  plantilla text not null,
  idioma text not null,
  parametros text[] not null default '{}',
  vista_previa text not null,
  adjunto_url text,
  referencia jsonb,
  estado text not null,
  intentos integer not null default 0,
  error text,
  id_proveedor text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  perro_id uuid references perros (id) on delete set null,
  titulo text not null,
  cambios jsonb not null default '[]',
  leida boolean not null default false,
  creada_en timestamptz not null default now()
);

/* ── Lo que Administración configura ──────────────────────────────── */

-- Una sola fila, siempre. El `check (id)` sobre un boolean hace imposible
-- que exista una segunda: no hay dos valores verdaderos.
create table if not exists configuracion (
  id boolean primary key default true check (id),
  vacunas_obligatorias text[] not null,
  duracion_vacunas_meses jsonb not null,
  campos_obligatorios text[] not null,
  catalogos jsonb not null,
  actualizado_en timestamptz not null default now()
);

/* ── Índices ──────────────────────────────────────────────────────── */

-- Los que usa el repositorio todos los días: "lo de este cliente", "lo de
-- este perro" y "lo que cae en este rango de fechas".
create index if not exists perros_cliente on perros (cliente_id);
create index if not exists reservas_cliente on reservas_hotel (cliente_id);
create index if not exists reservas_perro on reservas_hotel (perro_id);
create index if not exists reservas_rango on reservas_hotel (inicio_programado, fin_programado);
create index if not exists estadias_cliente on estadias_jardin (cliente_id);
create index if not exists estadias_perro on estadias_jardin (perro_id);
create index if not exists estadias_fecha on estadias_jardin (fecha);
create index if not exists planes_cliente on planes (cliente_id);
create index if not exists planes_perro on planes (perro_id);
create index if not exists suscripciones_cliente on suscripciones (cliente_id);
create index if not exists servicios_cliente on servicios (cliente_id);
create index if not exists servicios_fecha on servicios (fecha_hora);
create index if not exists pagos_cliente on pagos (cliente_id);
create index if not exists pagos_emitido on pagos (emitido_en);
create index if not exists cuentas_cliente on cuentas_mensuales (cliente_id);
create index if not exists ordenes_cliente on ordenes (cliente_id);
create index if not exists reportes_fecha on reportes (fecha);
create index if not exists incidentes_perro on incidentes (perro_id);
create index if not exists incidentes_fecha on incidentes (fecha);
create index if not exists mensajes_cliente on mensajes (cliente_id);
create index if not exists notificaciones_leida on notificaciones (leida);

/* ── Una cuenta nueva nace siendo cliente ─────────────────────────── */

-- Cuando alguien se registra, Supabase crea la fila en auth.users. Este
-- disparador le pone su perfil con rol "cliente". Staff y admin los
-- asciende Administración después, a mano: que un rol se pueda pedir al
-- registrarse sería regalar el backoffice.
create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse
  after insert on auth.users
  for each row execute function crear_perfil_al_registrarse();
