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
# Ana y Beto: lo suyo y nada más. El equipo ve los dos cobros operativos
# (el día de prueba y el día suelto) y NO la cuenta del mes de Ana.
comprobar_vista Ana   "$ANA"   "clientes=1 configuracion=1 pagos=2 perros=1 reportes=1"
comprobar_vista Beto  "$BETO"  "clientes=1 configuracion=1 pagos=1 perros=1 reportes=1"
comprobar_vista Staff "$STAFF" "clientes=2 configuracion=1 pagos=2 perros=2 reportes=2"
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
