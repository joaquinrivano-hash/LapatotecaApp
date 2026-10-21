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
intento "agenda y le nace un cobro pendiente" "1" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dia_de_prueba', 12345, 'pendiente'); select count(*) from pagos where monto = 12345;"
intento "compra y descuenta stock" "7" \
  "select stock from descontar_stock('eeeeeeee-0000-0000-0000-000000000001', 3);"

echo "▸ y lo que no, aunque se parezca"
intento "se crea un cobro ya pagado" "violates row-level security" \
  "insert into pagos (cliente_id, concepto, monto, estado, pagado_en) values ('aaaaaaaa-0000-0000-0000-000000000001', 'plan', 1, 'pagado', now());"
intento "le cobra a otro" "violates row-level security" \
  "insert into pagos (cliente_id, concepto, monto, estado) values ('bbbbbbbb-0000-0000-0000-000000000002', 'plan', 999999, 'pendiente');"
intento "le cambia el precio a la vitrina" "6000" \
  "update productos set precio = 1 where nombre = 'Pelota'; select precio from productos where nombre = 'Pelota';"
intento "se regala stock" "no puede ser negativa" \
  "select stock from descontar_stock('eeeeeeee-0000-0000-0000-000000000001', -50);"

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

echo "▸ repetir un archivo suelto no rompe los demás"
psql -h "$D" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$raiz/supabase/migrations/20261014120100_permisos.sql" >/dev/null 2>&1
# Una política creada por una migración POSTERIOR al archivo de permisos.
quedan=$(sql "select count(*) from pg_policies where policyname = 'agendo y queda pendiente';" | tail -1)
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
