-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · quién puede ver qué                               ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se pega después de 0001. Se puede correr de nuevo sin hacer daño.
--
-- Esto es lo que reemplaza al selector de rol del prototipo. Hasta ahora
-- el rol vivía en el navegador: cualquiera podía abrir las herramientas de
-- desarrollo, cambiarlo a "admin" y ver la cobranza completa. Acá las
-- reglas viven pegadas a los datos, así que no hay pantalla que saltarse:
-- si un dueño pide los pagos de otro, la base devuelve cero filas.
--
-- Tres roles, tres alcances:
--
--   dueño  → lo suyo y nada más. Sus perros, sus reservas, sus cobros.
--   equipo → los perros y las fichas, porque los cuida. La plata NO: el
--            que recibe al perro en la puerta no necesita ver cuánto
--            debe su dueño, y lo que no se necesita no se expone.
--   admin  → todo.

/* ── Quién pregunta ───────────────────────────────────────────────── */

-- `security definer` acá no es un atajo: sin él, la política de `perfiles`
-- tendría que leer `perfiles` para resolverse y Postgres corta por
-- recursión infinita.
create or replace function mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid();
$$;

create or replace function mi_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clientes where perfil_id = auth.uid();
$$;

create or replace function es_admin()
returns boolean
language sql
stable
as $$ select mi_rol() = 'admin'; $$;

-- Staff y admin. El staff entra a casi todo lo operativo; lo que lo
-- distingue del admin es la plata y la configuración.
create or replace function es_equipo()
returns boolean
language sql
stable
as $$ select mi_rol() in ('staff', 'admin'); $$;

/* ── Permiso de entrada ───────────────────────────────────────────── */

-- Los GRANT son una capa distinta de las políticas, y es fácil confundirlas:
-- el grant dice si un rol puede TOCAR la tabla, la política dice QUÉ FILAS
-- se lleva. Hacen falta los dos. Una tabla con políticas perfectas y sin
-- grant devuelve "permission denied"; una con grant y sin políticas la
-- entrega entera.
--
-- El proyecto está creado con "Automatically expose new tables" apagado, así
-- que una tabla nueva nace sin alcance y hay que nombrarla acá a propósito.
-- Es más trabajo y es el lado correcto para equivocarse: lo que se me olvide
-- queda invisible en vez de quedar expuesto.

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles', 'clientes', 'perros', 'suscripciones', 'planes',
    'reservas_hotel', 'estadias_jardin', 'servicios', 'cuentas_mensuales',
    'pagos', 'productos', 'ordenes', 'reportes', 'incidentes', 'mensajes',
    'notificaciones', 'configuracion'
  ]
  loop
    execute format(
      'grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- El visitante sin cuenta alcanza dos tablas y solo para leer: la vitrina
-- de la tienda y las listas que el formulario de alta necesita para
-- dibujarse. Nada más, y nunca para escribir.
grant select on productos, configuracion to anon;

/* ── RLS encendido en todo ────────────────────────────────────────── */

-- Sin esto las políticas de abajo no se aplican y la tabla queda abierta
-- a cualquiera con la clave anónima, que es pública por diseño.
do $$
declare t text;
begin
  foreach t in array array[
    'perfiles', 'clientes', 'perros', 'suscripciones', 'planes',
    'reservas_hotel', 'estadias_jardin', 'servicios', 'cuentas_mensuales',
    'pagos', 'productos', 'ordenes', 'reportes', 'incidentes', 'mensajes',
    'notificaciones', 'configuracion'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Para poder correr este archivo dos veces, cada política se borra justo
-- antes de crearse. La tentación era borrarlas TODAS de una y recrearlas,
-- que es menos código; el problema es que este archivo dejaría de ser
-- repetible por su cuenta: correrlo después de una migración posterior se
-- llevaría las políticas de esa otra y no las devolvería.

/* ── Perfiles ─────────────────────────────────────────────────────── */

drop policy if exists "veo mi perfil" on perfiles;
create policy "veo mi perfil" on perfiles
  for select using (id = auth.uid() or es_equipo());

-- El rol lo asciende Administración, nunca el propio interesado: si un
-- dueño pudiera editar su fila, se haría admin en una línea de consola.
drop policy if exists "administracion asigna roles" on perfiles;
create policy "administracion asigna roles" on perfiles
  for all using (es_admin()) with check (es_admin());

/* ── Clientes ─────────────────────────────────────────────────────── */

drop policy if exists "veo mi cuenta" on clientes;
create policy "veo mi cuenta" on clientes
  for select using (perfil_id = auth.uid() or es_equipo());

-- Al registrarse, el dueño crea su propia ficha y la amarra a su cuenta.
-- El `with check` es lo que impide amarrarla a la de otro.
drop policy if exists "me registro" on clientes;
create policy "me registro" on clientes
  for insert with check (perfil_id = auth.uid() or es_admin());

drop policy if exists "corrijo mis datos" on clientes;
create policy "corrijo mis datos" on clientes
  for update using (perfil_id = auth.uid() or es_admin())
  with check (perfil_id = auth.uid() or es_admin());

drop policy if exists "administracion borra clientes" on clientes;
create policy "administracion borra clientes" on clientes
  for delete using (es_admin());

/* ── Perros ───────────────────────────────────────────────────────── */

-- El dueño manda sobre la ficha de su perro: son sus datos y nadie los
-- conoce mejor. Cada cambio deja una notificación (ver `notificaciones`).
drop policy if exists "mis perros" on perros;
create policy "mis perros" on perros
  for all using (cliente_id = mi_cliente_id() or es_admin())
  with check (cliente_id = mi_cliente_id() or es_admin());

drop policy if exists "el equipo ve las fichas" on perros;
create policy "el equipo ve las fichas" on perros
  for select using (es_equipo());

-- El staff anota lo que pasa en el día (sociabilidad, notas), no cambia
-- al dueño ni el peso declarado.
drop policy if exists "el equipo anota la ficha" on perros;
create policy "el equipo anota la ficha" on perros
  for update using (es_equipo()) with check (es_equipo());

/* ── Lo que ocupa la casa ─────────────────────────────────────────── */

-- Reservas, estadías, planes, suscripciones y servicios tienen todos la
-- misma forma: una columna `cliente_id` y las mismas tres reglas. Se
-- generan en bucle para que no haya una tabla con la política distinta
-- por un copiar y pegar.
do $$
declare t text;
begin
  foreach t in array array[
    'reservas_hotel', 'estadias_jardin', 'planes', 'suscripciones',
    'servicios', 'ordenes'
  ]
  loop
    execute format(
      'drop policy if exists "lo mio" on %1$I', t);
    execute format(
      'create policy "lo mio" on %1$I'
      ' for select using (cliente_id = mi_cliente_id() or es_equipo())', t);

    execute format(
      'drop policy if exists "reservo lo mio" on %1$I', t);
    execute format(
      'create policy "reservo lo mio" on %1$I'
      ' for insert with check (cliente_id = mi_cliente_id() or es_equipo())', t);

    -- El dueño cancela y reprograma; el equipo registra llegadas y
    -- salidas. Los dos escriben sobre las mismas filas, cada uno en sus
    -- columnas, y de eso se encarga la capa de servicios.
    execute format(
      'drop policy if exists "el equipo opera" on %1$I', t);
    execute format(
      'create policy "el equipo opera" on %1$I'
      ' for update using (cliente_id = mi_cliente_id() or es_equipo())'
      ' with check (cliente_id = mi_cliente_id() or es_equipo())', t);

    execute format(
      'drop policy if exists "administracion borra" on %1$I', t);
    execute format(
      'create policy "administracion borra" on %1$I'
      ' for delete using (es_admin())', t);
  end loop;
end $$;

/* ── Plata ────────────────────────────────────────────────────────── */

-- El dueño ve lo que debe y lo que pagó. No lo edita: un cobro que el
-- cobrado puede cambiar no es un cobro.
drop policy if exists "veo mis cobros" on pagos;
create policy "veo mis cobros" on pagos
  for select using (cliente_id = mi_cliente_id() or es_admin());

drop policy if exists "administracion cobra" on pagos;
create policy "administracion cobra" on pagos
  for all using (es_admin()) with check (es_admin());

drop policy if exists "veo mi cuenta del mes" on cuentas_mensuales;
create policy "veo mi cuenta del mes" on cuentas_mensuales
  for select using (cliente_id = mi_cliente_id() or es_admin());

drop policy if exists "administracion emite" on cuentas_mensuales;
create policy "administracion emite" on cuentas_mensuales
  for all using (es_admin()) with check (es_admin());

-- Ojo: el staff no aparece en ninguna de las cuatro. Ve al perro, no la
-- deuda de su dueño.

/* ── Tienda ───────────────────────────────────────────────────────── */

drop policy if exists "la vitrina" on productos;
create policy "la vitrina" on productos
  for select using (activo or es_equipo());

drop policy if exists "administracion surte" on productos;
create policy "administracion surte" on productos
  for all using (es_admin()) with check (es_admin());

/* ── El día a día ─────────────────────────────────────────────────── */

-- Un reporte cubre varios perros, y cada dueño tiene que ver solo el
-- que menciona a los suyos.
drop policy if exists "los reportes de mis perros" on reportes;
create policy "los reportes de mis perros" on reportes
  for select using (
    es_equipo()
    or exists (
      select 1 from perros p
      where p.id = any (reportes.perro_ids)
        and p.cliente_id = mi_cliente_id()
    )
  );

drop policy if exists "el equipo reporta" on reportes;
create policy "el equipo reporta" on reportes
  for all using (es_equipo()) with check (es_equipo());

drop policy if exists "los incidentes de mis perros" on incidentes;
create policy "los incidentes de mis perros" on incidentes
  for select using (
    es_equipo()
    or exists (
      select 1 from perros p
      where p.id = incidentes.perro_id
        and p.cliente_id = mi_cliente_id()
    )
  );

drop policy if exists "el equipo anota incidentes" on incidentes;
create policy "el equipo anota incidentes" on incidentes
  for all using (es_equipo()) with check (es_equipo());

-- La bandeja de mensajes es interna: guarda el intento, el error y el
-- reintento. Al dueño le llega el WhatsApp, no el registro del envío.
drop policy if exists "la bandeja es del equipo" on mensajes;
create policy "la bandeja es del equipo" on mensajes
  for all using (es_equipo()) with check (es_equipo());

-- Las notificaciones las escribe el dueño sin saberlo —al corregir la
-- ficha de su perro— y las lee Administración. De ahí el reparto raro:
-- inserta uno y lee el otro.
drop policy if exists "mi cambio avisa" on notificaciones;
create policy "mi cambio avisa" on notificaciones
  for insert with check (cliente_id = mi_cliente_id() or es_equipo());

drop policy if exists "administracion lee los avisos" on notificaciones;
create policy "administracion lee los avisos" on notificaciones
  for select using (es_equipo());

drop policy if exists "administracion marca leido" on notificaciones;
create policy "administracion marca leido" on notificaciones
  for update using (es_equipo()) with check (es_equipo());

/* ── Configuración ────────────────────────────────────────────────── */

-- Se lee sin sesión a propósito: la pantalla de crear cuenta necesita
-- las razas y los campos obligatorios para dibujarse, y todavía no hay
-- nadie identificado. No hay nada reservado acá —son las mismas listas
-- que el folleto— y cerrarla dejaría el formulario sin desplegables.
drop policy if exists "todos leen las reglas" on configuracion;
create policy "todos leen las reglas" on configuracion
  for select using (true);

drop policy if exists "administracion define las reglas" on configuracion;
create policy "administracion define las reglas" on configuracion
  for all using (es_admin()) with check (es_admin());
