/**
 * Lo que hay que decidir ANTES de hablar con la red.
 *
 * Armar un filtro de PostgREST es pegar texto, y pegar texto con lo que
 * escribió un usuario es la manera clásica de romper algo en silencio: una
 * coma en "Pérez, Javiera" parte el filtro en dos condiciones y la consulta
 * devuelve filas que nadie pidió. Y traducir un rango de días de Santiago a
 * un rango de instantes tiene un error de borde que no se ve hasta que
 * alguien consulta el primer día del mes.
 *
 * Las dos cosas son decisiones puras, así que viven acá con sus tests en vez
 * de adentro de una llamada que solo se puede probar contra la nube.
 */

import { instanteEn, sumarDias } from "@/lib/utils/fecha";
import type { FechaISO, InstanteISO } from "@/lib/types";

/**
 * Caracteres que significan algo dentro de un filtro de PostgREST.
 *
 * `,` separa condiciones, `()` agrupa, `*` y `%` son comodines de `ilike` y
 * `"` abre y cierra un valor citado. Ninguno aporta nada a la búsqueda de un
 * nombre, así que se van antes de llegar a la URL.
 */
const RESERVADOS = /["\\%*(),]/g;

/**
 * Las palabras con las que se va a buscar.
 *
 * Son varias a propósito: el staff escribe "javiera soto" y el nombre está
 * en una columna y el apellido en otra, así que una sola condición con el
 * texto completo no encontraría nada. Cada palabra se exige por separado y
 * puede calzar en cualquier columna.
 */
export function terminosDeBusqueda(texto: string): string[] {
  return texto
    .replace(RESERVADOS, " ")
    .split(/\s+/)
    .map((palabra) => palabra.trim())
    .filter((palabra) => palabra.length > 0);
}

/**
 * Un `or` de PostgREST que pregunta por el término en varias columnas.
 *
 * El valor va entre comillas dobles porque un correo lleva puntos y el punto
 * es el separador entre columna, operador y valor. Sin las comillas,
 * `email.ilike.*javi.cl*` se lee como una columna `email`, un operador
 * `ilike` y un valor que empieza a mitad de camino.
 */
export function filtroEnColumnas(columnas: string[], termino: string): string {
  return columnas.map((c) => `${c}.ilike."*${termino}*"`).join(",");
}

/**
 * El rango de instantes que con seguridad contiene a esos días de Santiago.
 *
 * Es a propósito más ancho que el rango pedido. Una columna `timestamptz` se
 * compara en UTC y el día que la app quiere es el del reloj de Santiago, que
 * va corrido entre 3 y 4 horas; además el corte de horario de verano mueve
 * ese desfase. Pedirle a la base el rango justo dejaría afuera las estadías
 * de la primera y la última hora.
 *
 * Por eso la base devuelve de más y el filtro exacto —el mismo que usa el
 * repositorio local— se aplica después sobre las filas. Un día de más a cada
 * lado no es un problema de volumen y sí es la diferencia entre un
 * calendario correcto y uno que pierde una reserva por día consultado.
 */
export function limitesDelRango(
  desde: FechaISO,
  hasta: FechaISO,
): { desde: InstanteISO; hasta: InstanteISO } {
  return {
    desde: instanteEn(sumarDias(desde, -1), 0),
    hasta: instanteEn(sumarDias(hasta, 2), 0),
  };
}

/** ¿El rango [a, b] toca el rango [desde, hasta]? Todo en días de Santiago. */
export function seTraslapan(
  a: FechaISO,
  b: FechaISO,
  desde: FechaISO,
  hasta: FechaISO,
): boolean {
  return a <= hasta && b >= desde;
}

/** ¿Ese día del calendario cae dentro del rango? */
export function enRangoDeDias(
  dia: FechaISO,
  desde: FechaISO,
  hasta: FechaISO,
): boolean {
  return dia >= desde && dia <= hasta;
}
