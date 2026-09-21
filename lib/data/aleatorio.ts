/**
 * Generador pseudoaleatorio determinista (mulberry32).
 *
 * Con la misma semilla sale siempre el mismo set de datos, así que el
 * prototipo se ve igual en tu computador y en el mío, y los tests del seed
 * pueden afirmar cosas concretas.
 */

export interface Aleatorio {
  /** Número en [0, 1). */
  siguiente(): number;
  /** Entero entre min y max, ambos incluidos. */
  entero(min: number, max: number): number;
  decimal(min: number, max: number, decimales?: number): number;
  elegir<T>(opciones: readonly T[]): T;
  /** n elementos distintos, en orden aleatorio. */
  elegirVarios<T>(opciones: readonly T[], n: number): T[];
  /** true con probabilidad p (0 a 1). */
  probabilidad(p: number): boolean;
  barajar<T>(opciones: readonly T[]): T[];
}

export function crearAleatorio(semilla: number): Aleatorio {
  let estado = semilla >>> 0;

  const siguiente = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const entero = (min: number, max: number) =>
    Math.floor(siguiente() * (max - min + 1)) + min;

  const barajar = <T,>(opciones: readonly T[]): T[] => {
    const copia = [...opciones];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(siguiente() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  };

  return {
    siguiente,
    entero,
    barajar,
    decimal(min, max, decimales = 1) {
      const factor = 10 ** decimales;
      return Math.round((siguiente() * (max - min) + min) * factor) / factor;
    },
    elegir(opciones) {
      return opciones[Math.floor(siguiente() * opciones.length)];
    },
    elegirVarios(opciones, n) {
      return barajar(opciones).slice(0, Math.min(n, opciones.length));
    },
    probabilidad(p) {
      return siguiente() < p;
    },
  };
}

/** Semilla del seed oficial del prototipo. */
export const SEMILLA_PATOTECA = 20_260_921;
