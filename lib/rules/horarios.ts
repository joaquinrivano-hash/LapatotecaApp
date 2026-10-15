/**
 * A qué hora llegan y a qué hora los buscan.
 *
 * Dos preguntas distintas que se responden con los mismos datos:
 *
 *   · **Cuándo pasa el movimiento.** Para saber a qué hora se necesita más
 *     gente en la puerta, y si el jardín se vacía a las tres o a las seis.
 *   · **Cuánto se parece a lo agendado.** El que llega antes ocupa un cupo
 *     que nadie contó; el que se queda de más empuja el cierre.
 *
 * Son funciones puras: reciben los instantes ya resueltos y no saben que
 * existe un repositorio.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { minutosDelDia, minutosEntre } from "@/lib/utils/fecha";
import type { InstanteISO } from "@/lib/types";

/* ── Cuándo pasa el movimiento ─────────────────────────────────────── */

export interface FranjaHoraria {
  /** Hora del día, 0 a 23. */
  hora: number;
  llegadas: number;
  retiros: number;
}

/**
 * Cuenta llegadas y retiros por hora del día.
 *
 * Devuelve SOLO las horas entre la primera y la última con movimiento. Las 24
 * completas dejarían el gráfico con quince barras vacías a los lados y el
 * movimiento real apretado en el medio.
 */
export function distribucionHoraria(
  eventos: { llegada?: InstanteISO; retiro?: InstanteISO }[],
): FranjaHoraria[] {
  const porHora = new Map<number, { llegadas: number; retiros: number }>();

  const sumar = (instante: InstanteISO, cual: "llegadas" | "retiros") => {
    const hora = Math.floor(minutosDelDia(instante) / 60);
    const actual = porHora.get(hora) ?? { llegadas: 0, retiros: 0 };
    porHora.set(hora, { ...actual, [cual]: actual[cual] + 1 });
  };

  for (const { llegada, retiro } of eventos) {
    if (llegada) sumar(llegada, "llegadas");
    if (retiro) sumar(retiro, "retiros");
  }

  const horas = [...porHora.keys()];
  if (horas.length === 0) return [];

  const desde = Math.min(...horas);
  const hasta = Math.max(...horas);

  return Array.from({ length: hasta - desde + 1 }, (_, i) => {
    const hora = desde + i;
    const { llegadas = 0, retiros = 0 } = porHora.get(hora) ?? {};
    return { hora, llegadas, retiros };
  });
}

/* ── Cuánto se parece a lo agendado ────────────────────────────────── */

export type Puntualidad = "temprano" | "a_la_hora" | "tarde";

/**
 * Compara lo real contra lo agendado, con el margen de la config.
 *
 * Un perro que llega diez minutos antes no llegó temprano: llegó. Sin margen
 * el análisis diría que casi nadie es puntual, que es una manera elegante de
 * no decir nada.
 */
export function clasificarPuntualidad(
  programado: InstanteISO,
  real: InstanteISO,
): Puntualidad {
  const minutos = minutosEntre(programado, real);
  const margen = NEGOCIO.asistencia.minutosDePuntualidad;

  if (minutos < -margen) return "temprano";
  if (minutos > margen) return "tarde";
  return "a_la_hora";
}

export interface RepartoDePuntualidad {
  temprano: number;
  a_la_hora: number;
  tarde: number;
  total: number;
}

export function repartirPuntualidad(
  pares: { programado: InstanteISO; real: InstanteISO }[],
): RepartoDePuntualidad {
  const reparto: RepartoDePuntualidad = {
    temprano: 0,
    a_la_hora: 0,
    tarde: 0,
    total: pares.length,
  };

  for (const { programado, real } of pares) {
    reparto[clasificarPuntualidad(programado, real)] += 1;
  }
  return reparto;
}

/**
 * El porcentaje de un reparto, redondeado.
 *
 * Con total cero devuelve cero y no `NaN`: una pantalla que dice "NaN%" es
 * peor que una que dice "0%" cuando no pasó nada todavía.
 */
export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}
