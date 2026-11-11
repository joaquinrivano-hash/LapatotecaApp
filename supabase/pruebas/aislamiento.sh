#!/usr/bin/env bash
#
# Prueba que las políticas de 0002_permisos.sql aíslan de verdad.
#
# Levanta un Postgres desechable, corre las dos migraciones, siembra
# cuatro cuentas y le pregunta a la base qué ve cada una. Después intenta
# pasarse por encima de las reglas y verifica que no pueda.
#
#   ./supabase/pruebas/aislamiento.sh
#
# Hace falta porque una política que aísla hoy puede dejar de aislar con
# el próximo cambio, y eso no se nota mirando: la base no avisa, solo
# devuelve una fila que no correspondía. Correr esto después de tocar
# cualquier `create policy` es la diferencia entre saber y suponer.
set -uo pipefail

raiz=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export PATH=/usr/lib/postgresql/16/bin:${PATH}
D=${PGDATA_PRUEBA:-/var/lib/postgresql/prueba-aislamiento}
fallas=0

# initdb se niega a correr como root, así que el cluster vive en el home
# de postgres y se levanta con su usuario.
como_postgres () { su postgres -s /bin/bash -c "PATH=$PATH $1"; }

echo "▸ levantando Postgres desechable en $D"
como_postgres "pg_ctl -D $D/datos stop" >/dev/null 2>&1
rm -rf "$D"; mkdir -p "$D"; chown -R postgres:postgres "$D"
como_postgres "initdb -D $D/datos -U postgres --auth=trust" >/dev/null 2>&1 \
  || { echo "✗ no se pudo crear el cluster"; exit 1; }
como_postgres "pg_ctl -D $D/datos -o '-k $D -c listen_addresses=' -l $D/log start" >/dev/null 2>&1
for _ in $(seq 20); do
  psql -h "$D" -U postgres -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done

sql () { psql -h "$D" -U postgres -tAqc "$1"; }

echo "▸ corriendo migraciones (dos veces, para probar que se repiten sin daño)"
for vuelta in 1 2; do
  # El andamio primero, después las migraciones en el mismo orden en que
  # las aplica Supabase: por nombre, que por eso lleva marca de tiempo.
  for archivo in supabase/pruebas/andamio.sql \
                 $(cd "$raiz" && ls supabase/migrations/*.sql); do
    salida=$(psql -h "$D" -U postgres -v ON_ERROR_STOP=1 -q \
      -f "$raiz/$archivo" 2>&1 | grep -i "^psql.*ERROR")
    if [[ -n $salida ]]; then
      echo "✗ vuelta $vuelta, $archivo:"; echo "$salida"; fallas=$((fallas + 1))
    fi
  done
done

echo "▸ sembrando cuatro cuentas"
psql -h "$D" -U postgres -v ON_ERROR_STOP=1 -q -f "$raiz/supabase/pruebas/datos.sql" \
  || { echo "✗ falló la siembra"; exit 1; }

ANA=11111111-1111-1111-1111-111111111111
BETO=22222222-2222-2222-2222-222222222222
STAFF=33333333-3333-3333-3333-333333333333
ADMIN=44444444-4444-4444-4444-444444444444

# ── Qué ve cada uno ──────────────────────────────────────────────────
comprobar_vista () {
  local nombre=$1 uid=$2 esperado=$3
  local quien=null obtenido
  [[ -n $uid ]] && quien="'$uid'"
  obtenido=$(sql "set role authenticated; select string_agg(tabla||'='||filas, ' ' order by tabla) from mirar($quien);" | tail -1)
  if [[ $obtenido == "$esperado" ]]; then
    printf '  ✓ %-8s %s\n' "$nombre" "$obtenido"
  else
    printf '  ✗ %-8s esperaba [%s]\n           obtuvo   [%s]\n' "$nombre" "$esperado" "$obtenido"
    fallas=$((fallas + 1))
  fi
}

echo "▸ lo que ve cada rol"
# Ana y Beto: lo suyo y nada más. El equipo: ningún cobro, de ningún tipo.
# Ya no emite ninguno, así que no le hace falta ver ninguno.
comprobar_vista Ana   "$ANA"   "clientes=1 configuracion=1 pagos=2 perros=1 reportes=1"
comprobar_vista Beto  "$BETO"  "clientes=1 configuracion=1 pagos=1 perros=1 reportes=1"
comprobar_vista Staff "$STAFF" "clientes=2 configuracion=1 pagos=0 perros=2 reportes=2"
comprobar_vista Admin "$ADMIN" "clientes=2 configuracion=1 pagos=3 perros=2 reportes=2"
comprobar_vista Anón  ""       "clientes=0 configuracion=1 pagos=0 perros=0 reportes=0"

# ── Intentos de pasarse por encima ───────────────────────────────────
intento () {
  local descripcion=$1 esperado=$2 consulta=$3 obtenido
  # Sin tail acá: Postgres imprime ERROR y después CONTEXT, así que la
  # última línea sería la pista y no el motivo. Se elige más abajo.
  obtenido=$(psql -h "$D" -U postgres -tAq 2>&1 <<SQL | grep -v "^$ANA\$" | grep -v '^$' 
begin;
set local role authenticated;
select set_config('prueba.uid', '$ANA', true);
$consulta
rollback;
SQL
)
  local error
  error=$(grep -m1 "^ERROR:" <<<"$obtenido" || true)
  obtenido=${error:-$(tail -1 <<<"$obtenido")}
  if [[ $obtenido == *"$esperado"* ]]; then
    printf '  ✓ %-42s %s\n' "$descripcion" "$obtenido"
  else
    printf '  ✗ %-42s esperaba [%s], obtuvo [%s]\n' "$descripcion" "$esperado" "$obtenido"
    fallas=$((fallas + 1))
  fi
}

echo "▸ un dueño intentando lo que no le toca"
intento "lee el cobro de otro" "0" \
  "select count(*) from pagos where concepto = 'hotel';"
intento "edita el perro de otro" "0" \
  "update perros set peso_kg = 99 where nombre = 'Rocky'; select count(*) from perros where peso_kg = 99;"
intento "cuelga un perro de la cuenta de otro" "violates row-level security" \
  "insert into perros (cliente_id, nombre, raza, peso_kg, sexo, esterilizado) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Colado', 'Mestizo', 5, 'macho', true);"
intento "se asciende a admin" "cliente" \
  "update perfiles set rol = 'admin' where id = '$ANA'; select rol from perfiles where id = '$ANA';"
intento "se da su cobro por pagado" "pendiente" \
  "update pagos set estado = 'pagado' where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001'; select estado from pagos where cliente_id = 'aaaaaaaa-0000-0000-0000-000000000001';"
intento "se muda a la cuenta de otro" "violates row-level security" \
  "update clientes set perfil_id = '$BETO' where perfil_id = '$ANA';"
intento "edita su propio perro (debe poder)" "10.00" \
  "update perros set peso_kg = 10 where nombre = 'Lola'; select peso_kg from perros where nombre = 'Lola';"

# Igual que `intento`, pero poniéndose en los zapatos de quien se indique.
intento_como () {
  local uid=$1 descripcion=$2 esperado=$3 consulta=$4 obtenido error
  obtenido=$(psql -h "$D" -U postgres -tAq 2>&1 <<SQL | grep -v "^$uid\$" | grep -v '^$'
begin;
set local role authenticated;
select set_config('prueba.uid', '$uid', true);
$consulta
rollback;
SQL
)
  error=$(grep -m1 "^ERROR:" <<<"$obtenido" || true)
  obtenido=${error:-$(tail -1 <<<"$obtenido")}
  if [[ $obtenido == *"$esperado"* ]]; then
    printf '  ✓ %-42s %s\n' "$descripcion" "$obtenido"
  else
    printf '  ✗ %-42s esperaba [%s], obtuvo [%s]\n' "$descripcion" "$esperado" "$obtenido"
    fallas=$((fallas + 1))
  fi
}

echo "▸ lo que el dueño SÍ tiene que poder hacer"
# Comprar pasa entero por la base: precio de la vitrina, stock y orden
# pendiente. Antes el dueño descontaba stock a mano y la orden nacía
# "pagada" con el total que él mandara.
intento "compra: la orden y el cobro nacen pendientes" "7 pendiente pendiente 18000" \
  "select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 3}]');
   select p.stock || ' ' || o.estado || ' ' || g.estado || ' ' || g.monto
     from ordenes o join pagos g on g.referencia_id = o.id
     join productos p on p.id = 'eeeeeeee-0000-0000-0000-000000000001';"
intento "si no alcanza, compra lo que hay y lo avisa" "quedaban 10" \
  "select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 99}]')->'ajustados'->>0;"

echo "▸ y lo que no, aunque se parezca"
intento "se crea un cobro a mano" "lo hace la app" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dia_de_prueba', 12345, 'pendiente');"
intento "se crea un cobro ya pagado" "lo hace la app" \
  "insert into pagos (cliente_id, concepto, monto, estado, pagado_en) values ('aaaaaaaa-0000-0000-0000-000000000001', 'plan', 1, 'pagado', now());"
intento "le cobra a otro" "lo hace la app" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('bbbbbbbb-0000-0000-0000-000000000002', 'plan', 999999, 'pendiente');"
intento "le cambia el precio a la vitrina" "6000" \
  "update productos set precio = 1 where nombre = 'Pelota'; select precio from productos where nombre = 'Pelota';"
intento "mueve stock a mano" "lo mueve la casa" \
  "select stock from descontar_stock('eeeeeeee-0000-0000-0000-000000000001', 3);"
intento_como "$ADMIN" "Administración sí ajusta el inventario" "7" \
  "select stock from descontar_stock('eeeeeeee-0000-0000-0000-000000000001', 3);"

# ── Que no quede ninguna tabla sin RLS ───────────────────────────────
echo "▸ lo que el cuidador SÍ tiene que poder hacer"
intento_como "$STAFF" "ve la agenda de hoy" "1" \
  "select count(*) from estadias_jardin where fecha = current_date;"
intento_como "$STAFF" "ve la agenda de los próximos días" "1" \
  "select count(*) from estadias_jardin where fecha > current_date;"
intento_como "$STAFF" "marca la llegada" "presente" \
  "update estadias_jardin set estado = 'presente', inicio_real = now() where fecha = current_date; select estado from estadias_jardin where fecha = current_date;"
intento_como "$STAFF" "marca la salida" "finalizada" \
  "update estadias_jardin set estado = 'finalizada', fin_real = now() where fecha = current_date; select estado from estadias_jardin where fecha = current_date;"
intento_como "$STAFF" "manda un reporte" "3" \
  "insert into reportes (perro_ids, fecha, nota, autor_staff) values (array['cccccccc-0000-0000-0000-000000000001']::uuid[], current_date, 'Lola comió todo', 'Javi'); select count(*) from reportes where fecha = current_date;"
intento_como "$STAFF" "abre la ficha del perro" "Mestizo" \
  "select raza from perros where nombre = 'Lola';"
intento_como "$STAFF" "anota un incidente" "1" \
  "insert into incidentes (perro_id, fecha, tipo, gravedad, descripcion, autor_staff) values ('cccccccc-0000-0000-0000-000000000001', current_date, 'roce', 'leve', 'Se puso intensa en el patio', 'Javi'); select count(*) from incidentes;"

echo "▸ y lo que el cuidador NO"
intento_como "$STAFF" "emite el cobro del día que cerró" "violates row-level security" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dia_suelto', 18000, 'pendiente');"
intento_como "$STAFF" "ve cualquier cobro" "0" \
  "select count(*) from pagos;"
intento_como "$STAFF" "marca un cobro como pagado" "0" \
  "update pagos set estado = 'pagado' where concepto = 'dia_de_prueba'; select count(*) from pagos where estado = 'pagado' and concepto = 'dia_de_prueba';"
intento_como "$STAFF" "ve la cuenta del mes de un cliente" "0" \
  "select count(*) from cuentas_mensuales;"
intento_como "$STAFF" "suma las ganancias del mes" "0" \
  "select coalesce(sum(monto), 0) from pagos where concepto in ('plan', 'abono_hotel', 'servicio', 'tienda', 'cuenta_mensual');"
intento_como "$STAFF" "emite una cuenta mensual" "violates row-level security" \
  "insert into cuentas_mensuales (cliente_id, periodo, total, estado) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10', 50000, 'pendiente');"
intento_como "$STAFF" "cambia el precio de la vitrina" "6000" \
  "update productos set precio = 1 where nombre = 'Pelota'; select precio from productos where nombre = 'Pelota';"

# Cada archivo tiene que ser repetible POR SU CUENTA, no solo la tanda
# entera en orden. Alguien va a volver a correr uno suelto en el editor SQL
# —para releerlo, para arreglar un typo— y si ese archivo borrara en bloque
# se llevaría las políticas de los que vinieron después, sin devolverlas.
# ── Cómo entra alguien del equipo ────────────────────────────────────
echo "▸ invitaciones"

comprobar () {
  local descripcion=$1 esperado=$2 obtenido=$3
  if [[ $obtenido == "$esperado" ]]; then
    printf '  ✓ %-46s %s\n' "$descripcion" "$obtenido"
  else
    printf '  ✗ %-46s esperaba [%s], obtuvo [%s]\n' "$descripcion" "$esperado" "$obtenido"
    fallas=$((fallas + 1))
  fi
}

# Quien llega por su cuenta nace cliente, invitación o no.
sql "insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'curiosa@ejemplo.cl');" >/dev/null
comprobar "sin invitación la cuenta nace cliente" "cliente" \
  "$(sql "select rol from perfiles where id = '55555555-5555-5555-5555-555555555555';" | tail -1)"

# Con invitación, la base le pone el rol sola.
sql "insert into invitaciones (email, rol) values ('maria@lapatoteca.cl', 'staff');" >/dev/null
sql "insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'maria@lapatoteca.cl');" >/dev/null
comprobar "con invitación entra como cuidadora" "staff" \
  "$(sql "select rol from perfiles where id = '66666666-6666-6666-6666-666666666666';" | tail -1)"

comprobar "la invitación queda gastada" "1" \
  "$(sql "select count(*) from invitaciones where email = 'maria@lapatoteca.cl' and usada_en is not null;" | tail -1)"

# El correo se compara en minúscula: "Maria@" y "maria@" son la misma persona
# para todo el mundo menos para una comparación de texto.
sql "insert into invitaciones (email, rol) values ('pedro@lapatoteca.cl', 'staff');" >/dev/null
sql "insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'Pedro@Lapatoteca.CL');" >/dev/null
comprobar "no importa cómo escriba las mayúsculas" "staff" \
  "$(sql "select rol from perfiles where id = '77777777-7777-7777-7777-777777777777';" | tail -1)"

# Una invitación gastada no sirve dos veces.
sql "insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'maria@lapatoteca.cl');" >/dev/null
comprobar "una invitación usada no sirve de nuevo" "cliente" \
  "$(sql "select rol from perfiles where id = '88888888-8888-8888-8888-888888888888';" | tail -1)"

intento_como "$STAFF" "el cuidador invita a alguien" "violates row-level security" \
  "insert into invitaciones (email, rol) values ('colado@ejemplo.cl', 'admin');"
intento "el dueño se invita a sí mismo como admin" "violates row-level security" \
  "insert into invitaciones (email, rol) values ('ana@ejemplo.cl', 'admin');"
intento_como "$STAFF" "el cuidador lee a quién invitaron" "0" \
  "select count(*) from invitaciones;"

# ── El alta de una cuenta de dueño, desde el navegador ───────────────
#
# Es el flujo que estrena `clientes.perfil_id default auth.uid()`. Sin ese
# default la app no manda la columna —no existe en el tipo `Cliente`, a
# propósito—, el insert llega con perfil_id nulo y la política lo rechaza:
# o sea, nadie podría crearse una cuenta. El seed no lo cubre porque
# siembra como superusuario, saltándose las políticas.
echo "▸ el alta de una cuenta nueva"
NUEVA=55555555-5555-5555-5555-555555555555
ficha="insert into clientes (nombre, apellido, email, telefono, comuna) values ('Curiosa', 'Perez', 'curiosa@ejemplo.cl', '+56900000000', 'Providencia');"

intento_como "$NUEVA" "crea su ficha sin mandar perfil_id" "1" \
  "$ficha select count(*) from clientes where perfil_id = '$NUEVA';"

# La ficha tiene que quedar amarrada a SU cuenta. Si el default fuera null
# el insert pasaría igual (la política mira auth.uid() contra la columna) y
# el dueño quedaría sin poder ver sus propios datos después.
# Se pregunta como booleano y no devolviendo la columna: `intento_como`
# filtra las líneas iguales al uid para borrar el ruido de `set_config`, y
# un perfil_id correcto ES ese uid, así que se lo llevaría el filtro.
# El valor esperado lleva etiqueta porque `intento` compara por subcadena:
# un "t" pelado lo satisface hasta un mensaje de error que tenga una t, y el
# chequeo pasaría en falso justamente cuando el alta está rota.
intento_como "$NUEVA" "y le queda amarrada a su cuenta" "amarrada=true" \
  "$ficha select 'amarrada=' || (perfil_id = '$NUEVA')::text from clientes where email = 'curiosa@ejemplo.cl';"

# Y recién con la ficha creada `mi_cliente_id()` resuelve, que es lo que
# habilita inscribir al perro: los dos pasos del alta, en orden.
intento_como "$NUEVA" "y después inscribe a su perro" "Quiltro" \
  "$ficha
   insert into perros (cliente_id, nombre, raza, peso_kg, sexo, esterilizado)
     select id, 'Nube', 'Quiltro', 8, 'hembra', true from clientes where perfil_id = '$NUEVA';
   select raza from perros where nombre = 'Nube';"

# El default no es una comodidad: es lo que impide que el navegador apunte
# la ficha a la cuenta de otra persona mandando la columna a mano.
intento_como "$NUEVA" "no puede apuntar la ficha a otra cuenta" "violates row-level security" \
  "insert into clientes (perfil_id, nombre, apellido, email, telefono, comuna) values ('$ANA', 'Colada', 'Perez', 'x@ejemplo.cl', '+56900000001', 'Nunoa');"

# ── La planilla de turnos ────────────────────────────────────────────
#
# El turno planificado es una promesa de Administración; el fichaje es de
# quien lo cubre. Si el que ficha pudiera correr su propia hora de
# entrada, la comparación entre lo planificado y lo real no significaría
# nada: el que llegó tarde quedaría puntual.
echo "▸ turnos"
sql "insert into turnos (id, perfil_id, fecha, desde, hasta)
     values ('99999999-0000-0000-0000-000000000001', '$STAFF', current_date, '07:00', '15:00')
     on conflict (id) do nothing;" >/dev/null

intento_como "$STAFF" "ve la planilla completa" "1" \
  "select count(*) from turnos where fecha = current_date;"

intento_como "$STAFF" "ficha su propia entrada" "fichado" \
  "update turnos set entrada_real = now() where perfil_id = '$STAFF';
   select 'fichado' from turnos where perfil_id = '$STAFF' and entrada_real is not null;"

# Dónde fichó lo escribe quien ficha, igual que la hora: el disparador
# cuida solo el horario planificado.
intento_como "$STAFF" "ficha con su ubicación" "con ubicación" \
  "update turnos set entrada_ubicacion = '{\"lat\": -33.4436, \"lng\": -70.6189, \"precisionM\": 20}'
     where perfil_id = '$STAFF';
   select 'con ubicación' from turnos
     where perfil_id = '$STAFF' and entrada_ubicacion->>'lat' is not null;"

intento_como "$STAFF" "no se corre su hora de entrada" "lo cambia Administración" \
  "update turnos set desde = '09:00' where perfil_id = '$STAFF';"

intento_como "$STAFF" "no se pasa el turno a otro día" "lo cambia Administración" \
  "update turnos set fecha = current_date + 1 where perfil_id = '$STAFF';"

intento_como "$STAFF" "no se arma un turno solo" "violates row-level security" \
  "insert into turnos (perfil_id, fecha, desde, hasta)
     values ('$STAFF', current_date + 7, '07:00', '15:00');"

intento_como "$STAFF" "no se borra un turno" "1" \
  "delete from turnos where perfil_id = '$STAFF';
   select count(*) from turnos where perfil_id = '$STAFF';"

intento "el dueño no ve la planilla" "0" \
  "select count(*) from turnos;"

intento_como "$ADMIN" "Administración sí arma la planilla" "2" \
  "insert into turnos (perfil_id, fecha, desde, hasta)
     values ('$STAFF', current_date + 7, '13:00', '19:00');
   select count(*) from turnos;"

intento_como "$ADMIN" "y sí corrige el horario" "09:00" \
  "update turnos set desde = '09:00' where perfil_id = '$STAFF';
   select desde from turnos where perfil_id = '$STAFF' limit 1;"

# ── Quién firma la marca ─────────────────────────────────────────────
#
# El equipo ya puede actualizar estas filas —marcar llegadas es su
# trabajo—, así que sin el disparador podría atribuirle una marca a otra
# persona escribiendo otro id. La planilla diría que alguien estuvo
# trabajando cuando no vino, que es peor que no tener el dato.
echo "▸ la firma de la marca"

intento_como "$STAFF" "al marcar, la firma es suya" "es_suya" \
  "update estadias_jardin set inicio_marcado_en = now(), inicio_marcado_por = '$STAFF'
     where fecha = current_date;
   select 'es_suya' from estadias_jardin
     where fecha = current_date and inicio_marcado_por = '$STAFF';"

intento_como "$STAFF" "no se la puede colgar a otro" "0" \
  "update estadias_jardin set inicio_marcado_en = now(), inicio_marcado_por = '$ADMIN'
     where fecha = current_date;
   select count(*) from estadias_jardin
     where fecha = current_date and inicio_marcado_por = '$ADMIN';"

intento_como "$ADMIN" "Administración sí corrige una firma vieja" "1" \
  "update estadias_jardin set inicio_marcado_en = now(), inicio_marcado_por = '$STAFF'
     where fecha = current_date;
   select count(*) from estadias_jardin
     where fecha = current_date and inicio_marcado_por = '$STAFF';"

# ── Cancelar y mover lo agendado ─────────────────────────────────────
#
# El dueño no puede tocar un cobro, así que cancelar pasa por funciones que
# hacen el cambio entero —el día, el cobro y el perro— con la hora de la
# base. Antes la cancelación quedaba a medias: el día cancelado y el cobro
# en pie, porque el update sobre `pagos` no le correspondía.
echo "▸ cancelar y mover lo agendado"

ANA_CLI=aaaaaaaa-0000-0000-0000-000000000001
LOLA=cccccccc-0000-0000-0000-000000000001
PRUEBA=ffffffff-0000-0000-0000-000000000001
SUELTO=ffffffff-0000-0000-0000-000000000002
BETO_DIA=$(sql "select id from estadias_jardin where cliente_id = 'bbbbbbbb-0000-0000-0000-000000000002';" | tail -1)

# Lo que arma la casa antes de la prueba: corre como postgres, que es como
# corren las funciones. El dueño ya no puede fabricar un día de prueba ni
# marcar a su perro agendado por fuera de ellas.
# Y sin identidad: `prueba.uid` queda puesto en la transacción, y con él
# puesto los disparadores que miran al dueño (`es_dueno()`) se dispararían
# sobre lo que la casa prepara. En el editor SQL real `auth.uid()` es nulo.
como_la_casa () {
  echo "reset role; select set_config('prueba.uid', '', true); $1
        select set_config('prueba.uid', '${2:-$ANA}', true); set local role authenticated;"
}

# Lola lista para reservar: día de prueba aprobado y vacunas vigentes. La
# base ahora revisa la admisión en todo lo que agenda un dueño, así que la
# ficha del seed —sin vacunas, pendiente— no alcanza para un día de jardín.
VACUNAS_AL_DIA="'[{\"tipo\":\"octuple\",\"fechaAplicacion\":\"2026-01-01\",\"fechaVencimiento\":\"2099-01-01\"},
                   {\"tipo\":\"antirrabica\",\"fechaAplicacion\":\"2026-01-01\",\"fechaVencimiento\":\"2099-01-01\"},
                   {\"tipo\":\"kc\",\"fechaAplicacion\":\"2026-01-01\",\"fechaVencimiento\":\"2099-01-01\"}]'::jsonb"
lola_vacunada () {
  como_la_casa "update perros set vacunas = $VACUNAS_AL_DIA where id = '$LOLA';"
}
lola_lista () {
  como_la_casa "update perros set vacunas = $VACUNAS_AL_DIA,
                  dia_de_prueba = jsonb_build_object('estado', 'aprobado') where id = '$LOLA';"
}

# El día de prueba de Lola, agendado a tanto de ahora, con su cobro.
prueba_en () {
  como_la_casa "insert into estadias_jardin (id, cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$PRUEBA', '$ANA_CLI', '$LOLA', (now() + interval '$1')::date,
             now() + interval '$1', now() + interval '$1' + interval '6 hours',
             'dia_de_prueba', 'esperada');
   insert into pagos (cliente_id, concepto, referencia_id, monto, estado, emitido_en)
     values ('$ANA_CLI', 'dia_de_prueba', '$PRUEBA', 10000, 'pendiente', now() - interval '1 hour');
   update perros set dia_de_prueba = jsonb_build_object('estado', 'agendado'),
     vacunas = $VACUNAS_AL_DIA where id = '$LOLA';"
}

# Lo mismo, pero el dueño ya transfirió y Administración lo marcó pagado.
prueba_pagada_en () {
  como_la_casa "insert into estadias_jardin (id, cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$PRUEBA', '$ANA_CLI', '$LOLA', (now() + interval '$1')::date,
             now() + interval '$1', now() + interval '$1' + interval '6 hours',
             'dia_de_prueba', 'esperada');
   insert into pagos (cliente_id, concepto, referencia_id, monto, estado, emitido_en, pagado_en)
     values ('$ANA_CLI', 'dia_de_prueba', '$PRUEBA', 10000, 'pagado', now() - interval '1 hour', now() - interval '30 minutes');
   update perros set dia_de_prueba = jsonb_build_object('estado', 'agendado'),
     vacunas = $VACUNAS_AL_DIA where id = '$LOLA';"
}

# Un día suelto de jardín de Lola, con su cobro.
suelto_en () {
  como_la_casa "insert into estadias_jardin (id, cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$SUELTO', '$ANA_CLI', '$LOLA', (now() + interval '$1')::date,
             now() + interval '$1', now() + interval '$1' + interval '9 hours',
             'dia_suelto', 'esperada');
   insert into pagos (cliente_id, concepto, referencia_id, monto, estado)
     values ('$ANA_CLI', 'dia_suelto', '$SUELTO', 18000, 'pendiente');"
}

# Mover el día de prueba a dentro de tres días.
MOVER="select reprogramar_dia_de_prueba('$PRUEBA',
         ((now() + interval '3 days') at time zone 'America/Santiago')::date,
         now() + interval '3 days', now() + interval '3 days 6 hours');"

COBRO_DE_PRUEBA="select string_agg(estado || ' ' || monto, ', ' order by emitido_en)
  from pagos where referencia_id = '$PRUEBA';"

intento "cancela a tiempo: el cobro queda anulado, no borrado" "reembolsado 0" \
  "$(prueba_en '3 days') select cancelar_dia_de_prueba('$PRUEBA'); $COBRO_DE_PRUEBA"
intento "y el perro vuelve a la fila" "pendiente" \
  "$(prueba_en '3 days') select cancelar_dia_de_prueba('$PRUEBA');
   select dia_de_prueba->>'estado' from perros where id = '$LOLA';"
intento "cancela encima de la hora: queda por cobrar" "pendiente 5000" \
  "$(prueba_en '3 hours') select cancelar_dia_de_prueba('$PRUEBA'); $COBRO_DE_PRUEBA"
intento "lo mueve con tiempo: no paga nada más" "pendiente 10000" \
  "$(prueba_en '2 days') $MOVER $COBRO_DE_PRUEBA"
intento "lo mueve encima de la hora: se suma el cargo" "pendiente 10000, pendiente 5000" \
  "$(prueba_en '3 hours') $MOVER $COBRO_DE_PRUEBA"
intento "y cancelar después a tiempo no borra el cargo" "reembolsado 0, pendiente 5000" \
  "$(prueba_en '3 hours') $MOVER select cancelar_dia_de_prueba('$PRUEBA'); $COBRO_DE_PRUEBA"
intento "pagó y cancela a tiempo: queda entero por devolver" "reembolsado 10000" \
  "$(prueba_pagada_en '3 days') select cancelar_dia_de_prueba('$PRUEBA'); $COBRO_DE_PRUEBA"
intento "y la función dice cuánto hay que devolver" "10000" \
  "$(prueba_pagada_en '3 days') select cancelar_dia_de_prueba('$PRUEBA')->>'a_devolver';"
intento "pagó y cancela tarde: se queda el cargo, devuelve el resto" "pagado 5000, reembolsado 5000" \
  "$(prueba_pagada_en '3 hours') select cancelar_dia_de_prueba('$PRUEBA');
   select string_agg(estado || ' ' || monto, ', ' order by estado)
     from pagos where referencia_id = '$PRUEBA';"
intento "y lo que entró suma lo mismo que entró" "10000" \
  "$(prueba_pagada_en '3 hours') select cancelar_dia_de_prueba('$PRUEBA');
   select sum(monto) from pagos where referencia_id = '$PRUEBA';"
intento "cancela un día suelto a tiempo: anulado" "reembolsado 0" \
  "$(suelto_en '3 days') select cancelar_dia_de_jardin('$SUELTO');
   select estado || ' ' || monto from pagos where referencia_id = '$SUELTO';"
intento "cancela un día suelto encima: queda por cobrar" "pendiente 18000" \
  "$(suelto_en '3 hours') select cancelar_dia_de_jardin('$SUELTO');
   select estado || ' ' || monto from pagos where referencia_id = '$SUELTO';"
intento_como "$ADMIN" "Administración cancela por el dueño" "cancelada" \
  "select cancelar_dia_de_jardin('$BETO_DIA');
   select estado from estadias_jardin where id = '$BETO_DIA';"

echo "▸ y lo que nadie se salta"
intento "corre la hora del día para cancelar gratis" "se cancela o se cambia desde la app" \
  "$(prueba_en '3 hours') update estadias_jardin set inicio_programado = now() + interval '3 days' where id = '$PRUEBA';"
intento "marca cancelado el día sin pasar por el cobro" "se cancela o se cambia desde la app" \
  "$(suelto_en '3 days') update estadias_jardin set estado = 'cancelada' where id = '$SUELTO';"
intento "se confirma solo la reserva de hotel" "se cancela o se cambia desde la app" \
  "$(como_la_casa "insert into reservas_hotel (id, cliente_id, perro_id, inicio_programado, fin_programado, estado, cotizacion)
     values ('ffffffff-0000-0000-0000-000000000003', '$ANA_CLI', '$LOLA', now() + interval '5 days', now() + interval '7 days', 'pendiente', '{}');")
   update reservas_hotel set estado = 'confirmada' where id = 'ffffffff-0000-0000-0000-000000000003';"
intento "cancela el día de otro dueño" "No existe ese día" \
  "select cancelar_dia_de_jardin('$BETO_DIA');"
intento "cancela el de prueba por la puerta del jardín" "desde su propia pantalla" \
  "$(prueba_en '3 hours') select cancelar_dia_de_jardin('$PRUEBA');"
intento "lo mueve a una hora que ya pasó" "no sirve" \
  "$(prueba_en '3 days') select reprogramar_dia_de_prueba('$PRUEBA',
     ((now() - interval '1 day') at time zone 'America/Santiago')::date,
     now() - interval '1 day', now() - interval '18 hours');"
intento "cancela dos veces" "ya no se puede cancelar" \
  "$(prueba_en '3 days') select cancelar_dia_de_prueba('$PRUEBA'); select cancelar_dia_de_prueba('$PRUEBA');"
intento_como "$STAFF" "el cuidador cancela un día (es plata)" "No existe ese día" \
  "select cancelar_dia_de_jardin('$BETO_DIA');"

# Los avisos los escribe el dueño y los lee Administración. Pedir la fila de
# vuelta (`returning`, que es lo que hace `.select()` en supabase-js) exige
# poder LEERLA, así que falla aunque el insert esté permitido. Por eso el
# repositorio la inserta sin pedirla.
echo "▸ los avisos del dueño"
intento "deja un aviso sin pedirlo de vuelta" "dejado" \
  "insert into notificaciones (cliente_id, perro_id, titulo) values ('$ANA_CLI', '$LOLA', 'Canceló'); select 'dejado';"
intento "pedirlo de vuelta falla, aunque pueda dejarlo" "violates row-level security" \
  "insert into notificaciones (cliente_id, perro_id, titulo) values ('$ANA_CLI', '$LOLA', 'Canceló') returning id;"

# ── Los planes y el día de prueba ────────────────────────────────────
#
# El dueño podía bajarse `dias_usados` a cero, insertar un plan sin cobro y
# marcarse el día de prueba como aprobado. Ahora comprar, usar un día y
# agendar la prueba pasan por funciones, y lo demás no se puede por fuera.
echo "▸ comprar y usar un plan"

# El próximo día hábil que esté a más de un día, para agendar con plan.
HABIL="(select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d
         where extract(isodow from d) < 6 limit 1)"
SABADO="(select d::date from generate_series(current_date + 1, current_date + 8, interval '1 day') d
          where extract(isodow from d) = 6 limit 1)"
COTIZACION_PLAN="'{\"total\": 0}'::jsonb"
COMPRAR_12="select comprar_plan_de_jardin('$LOLA', 'dias', 12);"
# Para USAR días, un plan que vence en 30: el que se compra vence a fin de
# mes, y en los últimos días del mes no le queda ningún día hábil por delante.
PLAN=ffffffff-0000-0000-0000-000000000004
plan_de_la_casa () {
  como_la_casa "insert into planes (id, cliente_id, perro_id, tipo, dias_totales, vence_en, precio, cerrado_en)
     values ('$PLAN', '$ANA_CLI', '$LOLA', 'dias', 12, current_date + 30, 168000, ${1:-null});
   update perros set vacunas = $VACUNAS_AL_DIA,
     dia_de_prueba = jsonb_build_object('estado', 'aprobado') where id = '$LOLA';"
}
# Usar un día de ese plan.
usar_dia () {
  echo "select agendar_dia_con_plan('$PLAN',
     $1, ($1 + time '12:00') at time zone 'America/Santiago',
     ($1 + time '19:00') at time zone 'America/Santiago', $COTIZACION_PLAN);"
}

intento "compra 12 días: precio por tramo, cobro pendiente" "12 168000 pendiente 168000" \
  "$COMPRAR_12
   select p.dias_totales || ' ' || p.precio || ' ' || g.estado || ' ' || g.monto
     from planes p join pagos g on g.referencia_id = p.id where p.perro_id = '$LOLA';"
# El día se cuenta en SANTIAGO, igual que la función. Con current_date la
# comprobación usa la fecha del contenedor, que va en UTC: entre las 21:00 y
# la medianoche de Santiago ya es el día siguiente allá, y entonces la cuenta
# de días hábiles no calza aunque la función esté perfecta. Pasó el 5-11-2026
# a las 22:00 de Santiago.
intento "el pase libre cubre los días hábiles del mes" "ok" \
  "select comprar_plan_de_jardin('$LOLA', 'pase_libre', null);
   select case when precio = 220000 and dias_totales = (
       select count(*) from generate_series(
         (now() at time zone 'America/Santiago')::date,
         (date_trunc('month', (now() at time zone 'America/Santiago')::date)
           + interval '1 month - 1 day')::date,
         interval '1 day') d where extract(isodow from d) < 6)
     then 'ok' else dias_totales || ' ' || precio end
     from planes where perro_id = '$LOLA';"
intento "comprar otro cierra el anterior" "1 cerrado, 1 vigente" \
  "$COMPRAR_12 select comprar_plan_de_jardin('$LOLA', 'dias', 5);
   select count(*) filter (where cerrado_en is not null) || ' cerrado, '
       || count(*) filter (where cerrado_en is null) || ' vigente'
     from planes where perro_id = '$LOLA';"
intento "usa un día: se agenda y se descuenta" "1 plan" \
  "$(plan_de_la_casa) $(usar_dia "$HABIL")
   select p.dias_usados || ' ' || e.origen from planes p
     join estadias_jardin e on e.plan_id = p.id where p.perro_id = '$LOLA';"
intento "y cancelarlo a tiempo lo devuelve" "0" \
  "$(plan_de_la_casa) $(usar_dia "$HABIL")
   select cancelar_dia_de_jardin((select id from estadias_jardin where origen = 'plan' and perro_id = '$LOLA'));
   select dias_usados from planes where perro_id = '$LOLA';"

echo "▸ y lo que no se hace con un plan"
intento "se baja los días usados a cero" "se compran y se usan desde la app" \
  "$(plan_de_la_casa) update planes set dias_usados = 0 where perro_id = '$LOLA';"
intento "se arma un plan sin pasar por caja" "se compran y se usan desde la app" \
  "insert into planes (cliente_id, perro_id, tipo, dias_totales, vence_en, precio)
     values ('$ANA_CLI', '$LOLA', 'dias', 99, current_date + 30, 0);"
intento "inventa un día con plan para devolverlo" "se agenda desde la app" \
  "$(plan_de_la_casa) insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, plan_id, estado)
     values ('$ANA_CLI', '$LOLA', current_date + 3, now() + interval '3 days', now() + interval '3 days 8 hours', 'plan',
             '$PLAN', 'esperada');"
intento "usa el plan en sábado" "de lunes a viernes" \
  "$(plan_de_la_casa) $(usar_dia "$SABADO")"
intento "usa dos veces el mismo día" "ya tiene el día agendado" \
  "$(plan_de_la_casa) $(usar_dia "$HABIL") $(usar_dia "$HABIL")"
intento "usa un plan ya cerrado" "ya no cubre ese día" \
  "$(plan_de_la_casa 'now()') $(usar_dia "$HABIL")"
intento "le compra un plan al perro de otro" "No existe ese perro" \
  "select comprar_plan_de_jardin('dddddddd-0000-0000-0000-000000000002', 'dias', 5);"
intento_como "$STAFF" "el cuidador vende un plan (es plata)" "No existe ese perro" \
  "select comprar_plan_de_jardin('$LOLA', 'dias', 5);"

echo "▸ el día de prueba"
# Mañana a mediodía de Santiago: seis horas, como manda la casa.
MANANA="((current_date + 2) + time '12:00') at time zone 'America/Santiago'"
agendar_prueba () {
  echo "$(lola_vacunada) select agendar_dia_de_prueba('$LOLA', current_date + 2, $MANANA, $MANANA + interval '$1', '{\"total\": $2}'::jsonb);"
}

intento "agenda su día de prueba y le nace el cobro" "agendado pendiente 10000" \
  "$(agendar_prueba '6 hours' 10000)
   select f.dia_de_prueba->>'estado' || ' ' || g.estado || ' ' || g.monto
     from perros f join estadias_jardin e on e.perro_id = f.id and e.origen = 'dia_de_prueba'
     join pagos g on g.referencia_id = e.id where f.id = '$LOLA';"
intento "se marca aprobado sin venir" "lo agenda la app y lo cierra la casa" \
  "update perros set dia_de_prueba = jsonb_build_object('estado', 'aprobado') where id = '$LOLA';"
intento "se marca agendado sin pagar" "lo agenda la app y lo cierra la casa" \
  "update perros set dia_de_prueba = jsonb_build_object('estado', 'agendado') where id = '$LOLA';"
intento "inscribe un perro que nace aprobado" "lo agenda la app y lo cierra la casa" \
  "insert into perros (cliente_id, nombre, raza, peso_kg, sexo, esterilizado, dia_de_prueba)
     values ('$ANA_CLI', 'Colado', 'Mestizo', 5, 'hembra', true, jsonb_build_object('estado', 'aprobado'));"
intento "inventa un día de prueba sin cobro" "se agenda desde la app" \
  "insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$ANA_CLI', '$LOLA', current_date + 3, now() + interval '3 days', now() + interval '3 days 6 hours', 'dia_de_prueba', 'esperada');"
intento "agenda la prueba dos veces" "ya tiene su día de prueba tomado" \
  "$(agendar_prueba '6 hours' 10000) $(agendar_prueba '6 hours' 10000)"
intento "una prueba de doce horas" "no sirve para el día de prueba" \
  "$(agendar_prueba '12 hours' 10000)"
intento "una prueba que dice costar cero" "no calza" \
  "$(agendar_prueba '6 hours' 0)"
intento "sigue corrigiendo el resto de su ficha" "8.00" \
  "update perros set peso_kg = 8 where id = '$LOLA'; select peso_kg from perros where id = '$LOLA';"
intento_como "$ADMIN" "Administración sí lo aprueba" "aprobado" \
  "update perros set dia_de_prueba = jsonb_build_object('estado', 'aprobado') where id = '$LOLA';
   select dia_de_prueba->>'estado' from perros where id = '$LOLA';"

# ── Lo que el dueño agenda, y por dónde ──────────────────────────────
#
# Desde `lo_que_el_dueno_no_se_salta` ya no inserta días, reservas,
# cobros ni órdenes: pasa por funciones que ponen el precio y lo comparan
# con lo que vio, y un disparador revisa admisión, cupo y duplicados.
echo "▸ lo que el dueño agenda, por la función"
EN3="((current_date + 3) + time '09:00') at time zone 'America/Santiago'"
DIA_SUELTO="select agendar_dia_suelto('$LOLA', current_date + 3, $EN3, $EN3 + interval '8 hours', '{\"total\": 16000}'::jsonb);"
HOTEL="select reservar_hotel('$LOLA', $EN3, $EN3 + interval '48 hours', 0, 0, '{\"total\": 48000, \"abono\": 24000}'::jsonb);"

intento "un día suelto: nace esperado y con su cobro" "esperada pendiente 16000" \
  "$(lola_lista) $DIA_SUELTO
   select e.estado || ' ' || g.estado || ' ' || g.monto from estadias_jardin e
     join pagos g on g.referencia_id = e.id where e.origen = 'dia_suelto' and e.fecha = current_date + 3;"
intento "una reserva de hotel: por confirmar, con el abono" "pendiente pendiente 24000" \
  "$(lola_lista) $HOTEL
   select r.estado || ' ' || g.estado || ' ' || g.monto from reservas_hotel r
     join pagos g on g.referencia_id = r.id where r.perro_id = '$LOLA';"
intento "con dos noches y media paga la hora extra" "ok" \
  "$(lola_lista) select reservar_hotel('$LOLA', $EN3, $EN3 + interval '51 hours', 0, 0, '{\"total\": 49000, \"abono\": 24500}'::jsonb); select 'ok';"
intento "desde 7 noches, el 10%" "ok" \
  "$(lola_lista) select reservar_hotel('$LOLA', $EN3, $EN3 + interval '168 hours', 0, 0, '{\"total\": 151200, \"abono\": 75600}'::jsonb); select 'ok';"
# 48.000 + 3 de media hora (10.000, la promo) + 4 de 15 (5.000 + 2.000).
intento "cada tres paseos, la promo del folleto" "ok" \
  "$(lola_lista) select reservar_hotel('$LOLA', $EN3, $EN3 + interval '48 hours', 3, 4, '{\"total\": 65000, \"abono\": 32500}'::jsonb); select 'ok';"
intento "los paseos multiplicados, sin la promo, ya no calzan" "no calza" \
  "$(lola_lista) select reservar_hotel('$LOLA', $EN3, $EN3 + interval '48 hours', 3, 4, '{\"total\": 68000, \"abono\": 34000}'::jsonb);"

echo "▸ y ya nada directo"
intento "un día suelto a mano" "se agenda desde la app" \
  "$(lola_lista) insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$ANA_CLI', '$LOLA', current_date + 3, $EN3, $EN3 + interval '8 hours', 'dia_suelto', 'esperada');"
intento "una reserva de hotel a mano" "se agenda desde la app" \
  "$(lola_lista) insert into reservas_hotel (cliente_id, perro_id, inicio_programado, fin_programado, estado, cotizacion)
     values ('$ANA_CLI', '$LOLA', $EN3, $EN3 + interval '48 hours', 'pendiente', '{}');"

# ── Un script con la sesión de un dueño ──────────────────────────────
#
# El hackeo ético del 6-11-2026, caso por caso. Cada uno entraba antes de
# `lo_que_el_dueno_no_se_salta`; si alguno vuelve a pasar, se abrió de
# nuevo. Lo que distingue a un script de una persona es la velocidad y el
# volumen, así que también se prueba lo que acota el daño: un perro por
# día, sin pisarse, y hasta seis meses adelante.
echo "▸ un script con la sesión de un dueño"
intento "anula el recargo con un cobro de \$0 (ya decidido)" "lo hace la app" \
  "$(suelto_en '3 days') insert into pagos (cliente_id, concepto, referencia_id, monto, estado)
     values ('$ANA_CLI', 'recargo_jardin', '$SUELTO', 0, 'pendiente');"
intento "anula el saldo del hotel con un cobro de \$0" "lo hace la app" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('$ANA_CLI', 'saldo_hotel', 0, 'pendiente');"
intento "pide un servicio ya agendado (sin pasar por caja)" "nace por confirmar" \
  "insert into servicios (cliente_id, perro_id, tipo, fecha_hora, estado, cotizacion)
     values ('$ANA_CLI', '$LOLA', 'spa', now() + interval '3 days', 'agendado', '{\"total\": 0}');"
intento "pide un servicio por confirmar (lo normal)" "1" \
  "insert into servicios (cliente_id, perro_id, tipo, fecha_hora, estado, cotizacion)
     values ('$ANA_CLI', '$LOLA', 'spa', now() + interval '3 days', 'por_confirmar', '{\"total\": 25000}');
   select count(*) from servicios where perro_id = '$LOLA';"
intento "y después se lo marca agendado" "lo cambia la casa" \
  "insert into servicios (cliente_id, perro_id, tipo, fecha_hora, estado, cotizacion)
     values ('$ANA_CLI', '$LOLA', 'spa', now() + interval '3 days', 'por_confirmar', '{}');
   update servicios set estado = 'agendado' where perro_id = '$LOLA';"
intento "pide un servicio para el perro de otro" "no es tuyo" \
  "insert into servicios (cliente_id, perro_id, tipo, fecha_hora, estado, cotizacion)
     values ('$ANA_CLI', 'dddddddd-0000-0000-0000-000000000002', 'spa', now() + interval '3 days', 'por_confirmar', '{}');"
intento "se arma una orden pagada en \$0" "lo hace la app" \
  "insert into ordenes (cliente_id, items, total, estado) values ('$ANA_CLI', '[]', 0, 'pagada');"
intento "se arma una suscripción" "lo hace la app" \
  "insert into suscripciones (cliente_id, perro_id, tipo, estado, proximo_cobro) values ('$ANA_CLI', '$LOLA', 'pase_libre', 'activa', current_date + 30);"
intento "vacía la vitrina con órdenes que no paga" "pendientes de pago" \
  "select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 1}]');
   select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 1}]');
   select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 1}]');
   select comprar_en_tienda('[{\"productoId\": \"eeeeeeee-0000-0000-0000-000000000001\", \"cantidad\": 1}]');"
intento "agenda con una cotización tocada (\$0)" "no calza" \
  "$(lola_lista) select agendar_dia_suelto('$LOLA', current_date + 3, $EN3, $EN3 + interval '8 hours', '{\"total\": 0}'::jsonb);"
intento "reserva hotel con el abono tocado" "no calza" \
  "$(lola_lista) select reservar_hotel('$LOLA', $EN3, $EN3 + interval '48 hours', 0, 0, '{\"total\": 48000, \"abono\": 1}'::jsonb);"
intento "agenda al perro de otro" "No existe ese perro" \
  "select agendar_dia_suelto('dddddddd-0000-0000-0000-000000000002', current_date + 3, $EN3, $EN3 + interval '8 hours', '{\"total\": 16000}'::jsonb);"
intento "agenda sin el día de prueba aprobado" "Falta el día de prueba" \
  "$(lola_vacunada) $DIA_SUELTO"
intento "agenda con una vacuna vencida" "Falta la vacuna" \
  "$(como_la_casa "update perros set dia_de_prueba = jsonb_build_object('estado', 'aprobado') where id = '$LOLA';") $DIA_SUELTO"
intento "agenda el mismo día dos veces" "ya tiene el día agendado" \
  "$(lola_lista) $DIA_SUELTO $DIA_SUELTO"
intento "dos reservas de hotel que se pisan" "ya tiene una reserva" \
  "$(lola_lista) $HOTEL select reservar_hotel('$LOLA', $EN3 + interval '24 hours', $EN3 + interval '72 hours', 0, 0, '{\"total\": 48000, \"abono\": 24000}'::jsonb);"
intento "agenda para dentro de dos años" "tan adelante" \
  "$(lola_lista) select agendar_dia_suelto('$LOLA', current_date + 730, ((current_date + 730) + time '09:00') at time zone 'America/Santiago', ((current_date + 730) + time '17:00') at time zone 'America/Santiago', '{\"total\": 16000}'::jsonb);"
intento "agenda para ayer" "ya pasó" \
  "$(lola_lista) select agendar_dia_suelto('$LOLA', current_date - 1, ((current_date - 1) + time '09:00') at time zone 'America/Santiago', ((current_date - 1) + time '17:00') at time zone 'America/Santiago', '{\"total\": 16000}'::jsonb);"

# La casa llena: 25 perros de Beto ese día (los arma la casa, sin cupo que
# los frene). El 26, de Ana, no entra — y el cuidador sí, porque en la
# puerta decide él.
LLENAR="insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
  select 'bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
         current_date + 3, $EN3 - interval '2 hours', $EN3 + interval '10 hours', 'dia_suelto', 'esperada'
    from generate_series(1, 25);"
intento "el perro 26 no entra en una casa llena" "No queda cupo" \
  "$(lola_lista) $(como_la_casa "$LLENAR") $DIA_SUELTO"
intento "ni una reserva de hotel que cruce ese día" "No queda cupo" \
  "$(lola_lista) $(como_la_casa "$LLENAR") $HOTEL"
intento "ni su día de prueba" "No queda cupo" \
  "$(lola_vacunada) $(como_la_casa "$LLENAR") select agendar_dia_de_prueba('$LOLA', current_date + 3, $EN3, $EN3 + interval '6 hours', '{\"total\": 10000}'::jsonb);"
intento "dos perros nuevos en el mismo bloque" "ya tiene un perro nuevo" \
  "$(lola_vacunada) $(como_la_casa "insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', current_date + 3, $EN3, $EN3 + interval '6 hours', 'dia_de_prueba', 'esperada');")
   select agendar_dia_de_prueba('$LOLA', current_date + 3, $EN3, $EN3 + interval '6 hours', '{\"total\": 10000}'::jsonb);"
intento_como "$STAFF" "el cuidador registra igual con la casa llena" "26" \
  "$(como_la_casa "$LLENAR" "$STAFF") insert into estadias_jardin (cliente_id, perro_id, fecha, inicio_programado, fin_programado, origen, estado)
     values ('$ANA_CLI', '$LOLA', current_date + 3, $EN3, $EN3 + interval '8 hours', 'dia_suelto', 'esperada');
   select count(*) from estadias_jardin where fecha = current_date + 3;"

echo "▸ repetir un archivo suelto no rompe los demás"
psql -h "$D" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$raiz/supabase/migrations/20261014120100_permisos.sql" >/dev/null 2>&1
# Una política creada por una migración POSTERIOR al archivo de permisos.
quedan=$(sql "select count(*) from pg_policies where policyname = 'administracion invita';" | tail -1)
if [[ $quedan == "1" ]]; then
  echo "  ✓ las políticas de las migraciones posteriores siguen ahí"
else
  echo "  ✗ volver a correr los permisos se llevó una política posterior"
  fallas=$((fallas + 1))
fi

echo "▸ cobertura"
abiertas=$(sql "select coalesce(string_agg(tablename, ', '), '') from pg_tables where schemaname = 'public' and not rowsecurity;" | tail -1)
if [[ -z $abiertas ]]; then
  echo "  ✓ todas las tablas con RLS encendido"
else
  echo "  ✗ tablas abiertas a cualquiera con la clave anónima: $abiertas"
  fallas=$((fallas + 1))
fi

como_postgres "pg_ctl -D $D/datos stop" >/dev/null 2>&1
echo
if (( fallas == 0 )); then
  echo "Todo en orden."
else
  echo "$fallas comprobación(es) falló."
fi
exit $(( fallas > 0 ))
