/**
 * Traducción entre el mundo de TypeScript y el de Postgres.
 *
 * Es una regla mecánica, no un mapeador por entidad: los campos van en
 * camelCase y las columnas en snake_case, y `lib/repo/esquema.test.ts`
 * verifica que esa correspondencia siga siendo cierta para las 15 tablas del
 * dominio. Escribir 33 mapeadores a mano sería más código y más superficie
 * para equivocarse en silencio.
 *
 * Las tres cosas que no son mecánicas están acá abajo, cada una con su
 * motivo: el `null` de la base contra el `undefined` de TypeScript, la forma
 * canónica de un instante, y la diferencia entre un día y un instante.
 */

export type Fila = Record<string, unknown>;

export function aSnake(campo: string): string {
  return campo.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function aCamel(columna: string): string {
  return columna.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Un instante con zona, tal como lo devuelve Postgres.
 *
 * Tiene que llevar hora: `2026-09-21` es un DÍA del calendario de Santiago y
 * pasarlo por `toISOString()` lo correría al día anterior, que es justo el
 * error que `enZona()` existe para evitar.
 */
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Postgres devuelve `2026-09-21T15:00:00+00:00` donde la app había guardado
 * `2026-09-21T15:00:00.000Z`. Son el mismo instante y dos textos distintos,
 * y eso rompe cualquier comparación o `sort` por string —que es como la app
 * ordena los historiales—. Por eso todo instante vuelve a su forma canónica
 * al entrar.
 */
function canonizarInstante(valor: string): string {
  return INSTANTE.test(valor) ? new Date(valor).toISOString() : valor;
}

/** Una fila de la base convertida en entidad del dominio. */
export function aEntidad<T>(fila: Fila): T {
  const entidad: Record<string, unknown> = {};
  for (const [columna, valor] of Object.entries(fila)) {
    // La base dice `null` donde el tipo dice "no está". Dejar pasar el null
    // rompe cualquier `=== undefined` y cualquier valor por defecto de
    // parámetro, así que el campo simplemente no se pone.
    if (valor === null) continue;
    entidad[aCamel(columna)] =
      typeof valor === "string" ? canonizarInstante(valor) : valor;
  }
  return entidad as T;
}

/**
 * Una entidad (o un parche parcial) convertida en fila.
 *
 * Un campo presente con valor `undefined` se manda como `null`: en
 * `actualizar(id, { notas: undefined })` el dueño está borrando la nota, y
 * omitir la columna dejaría el valor viejo. Un campo ausente no se toca.
 */
export function aFila(entidad: Record<string, unknown>): Fila {
  const fila: Fila = {};
  for (const [campo, valor] of Object.entries(entidad)) {
    fila[aSnake(campo)] = valor === undefined ? null : valor;
  }
  return fila;
}
