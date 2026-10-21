/**
 * Un cliente de Supabase de mentira, para probar el repositorio sin red.
 *
 * No emula Postgres: emula la FORMA de hablarle. Registra la cadena de
 * llamadas (`select`, `eq`, `or`, `range`…) y responde lo que el test le
 * programe. Con eso se puede verificar las dos mitades donde están los
 * errores de verdad:
 *
 * - **qué se le pide a la base**: que `crear` no mande id, que la búsqueda
 *   encadene un `or` por palabra, que descontar stock pase por la función y
 *   no por un `update` a la tabla.
 * - **qué se hace con lo que responde**: el mapeo de columnas a campos, la
 *   paginación, y el filtro exacto que se aplica después de un rango ancho.
 *
 * Lo que NO puede probar es si las políticas de RLS dejan pasar la consulta.
 * Eso se prueba contra un Postgres de verdad, y para eso está
 * `supabase/pruebas/aislamiento.sh`.
 */

import type { Cliente0 } from "@/lib/repo/supabase/repositorio";

export type Operacion = [string, unknown[]];

export interface Llamada {
  tabla: string;
  operaciones: Operacion[];
}

export interface Respuesta {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

/** Decide qué responder mirando lo que se pidió. */
export type Responder = (llamada: Llamada) => Respuesta;

const METODOS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "or",
  "contains",
  "order",
  "range",
  "limit",
  "single",
  "maybeSingle",
] as const;

class Constructor implements PromiseLike<Respuesta> {
  readonly operaciones: Operacion[] = [];

  constructor(
    readonly tabla: string,
    private responder: Responder,
  ) {
    for (const metodo of METODOS) {
      (this as unknown as Record<string, unknown>)[metodo] = (
        ...args: unknown[]
      ) => {
        this.operaciones.push([metodo, args]);
        return this;
      };
    }
  }

  /**
   * Lo que hace que `await consulta` funcione.
   *
   * Devuelve una promesa de verdad y no `this`: un thenable que se resuelve
   * consigo mismo se queda dando vueltas para siempre.
   */
  then<R1 = Respuesta, R2 = never>(
    alResolver?: ((valor: Respuesta) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((razon: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const respuesta = this.responder({
      tabla: this.tabla,
      operaciones: this.operaciones,
    });
    return Promise.resolve({
      data: respuesta.data ?? null,
      error: respuesta.error ?? null,
    }).then(alResolver, alFallar);
  }
}

export interface ClienteFalso {
  cliente: Cliente0;
  /** Todo lo que se le pidió, en orden. */
  llamadas: Llamada[];
  /** Las llamadas a una tabla. */
  aTabla(tabla: string): Llamada[];
  /** Los argumentos de la primera vez que se usó ese método. */
  argumentosDe(metodo: string): unknown[] | null;
  /** Todos los argumentos de ese método, en orden. */
  todosLos(metodo: string): unknown[][];
}

export function clienteFalso(responder: Responder = () => ({})): ClienteFalso {
  const llamadas: Llamada[] = [];

  const registrar: Responder = (llamada) => {
    // Se registra al resolverse, cuando la cadena ya está completa.
    const previa = llamadas.find((l) => l.operaciones === llamada.operaciones);
    if (!previa) llamadas.push(llamada);
    return responder(llamada);
  };

  const cliente = {
    from: (tabla: string) => new Constructor(tabla, registrar),
    rpc: (nombre: string, parametros?: unknown) => {
      const constructor = new Constructor(`rpc:${nombre}`, registrar);
      constructor.operaciones.push(["rpc", [parametros]]);
      return constructor;
    },
  } as unknown as Cliente0;

  const operaciones = () => llamadas.flatMap((l) => l.operaciones);

  return {
    cliente,
    llamadas,
    aTabla: (tabla) => llamadas.filter((l) => l.tabla === tabla),
    argumentosDe: (metodo) =>
      operaciones().find(([nombre]) => nombre === metodo)?.[1] ?? null,
    todosLos: (metodo) =>
      operaciones()
        .filter(([nombre]) => nombre === metodo)
        .map(([, args]) => args),
  };
}

/** Una respuesta de página única: las filas y nada más. */
export function filas(...valores: Record<string, unknown>[]): Respuesta {
  return { data: valores };
}
