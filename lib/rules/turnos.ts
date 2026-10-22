/**
 * Cobertura: quién está en la casa a cada hora, y dónde falta alguien.
 *
 * Dos preguntas distintas, y vale la pena no confundirlas:
 *
 * 1. **¿Qué se planificó?** Los turnos, que son una promesa.
 * 2. **¿Qué pasó?** Y eso llega por dos caminos de distinta calidad: el
 *    fichaje, que es la hora exacta, y los rastros del turno —reportes e
 *    incidentes con nombre y hora—, que son un PISO. Si llegó a las 7 y el
 *    primer perro a las 8, su primer rastro es a las 8.
 *
 * Las reglas de acá no las mezclan nunca. Una pantalla que diga "entró a
 * las 8:00" cuando eso salió de un rastro está presentando una deducción
 * como un hecho, y lo que se hace con eso —una conversación sobre
 * puntualidad— merece saber de dónde salió el número.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { minutosDesdeHHMM, hhmmDesdeMinutos } from "@/lib/utils/fecha";
import type { FechaISO, InstanteISO, ID, Turno } from "@/lib/types";

/** Cada cuántos minutos se mira la cobertura. El mismo paso que la ocupación. */
export const PASO_MINUTOS = NEGOCIO.capacidad.minutosPorSlot;

export interface FranjaDeCobertura {
  minutoDelDia: number;
  hora: string;
  /** Cuántas personas cubren esa franja. */
  gente: number;
  /** Cuántos perros había en la casa, si se sabe. */
  perros: number;
}

/**
 * Los minutos que cubre un turno.
 *
 * Un turno que termina antes de empezar es uno que cruza la medianoche
 * —el del hotel, que funciona de noche—, así que se cierra al final del
 * día. Tratarlo como un rango vacío haría desaparecer de la planilla
 * justo al que se queda cuidando mientras todos duermen.
 */
export function minutosDelTurno(turno: {
  desde: string;
  hasta: string;
}): { desde: number; hasta: number } {
  const desde = minutosDesdeHHMM(turno.desde);
  const hasta = minutosDesdeHHMM(turno.hasta);
  return { desde, hasta: hasta > desde ? hasta : 24 * 60 };
}

/** ¿El turno cubre ese minuto del día? */
export function cubre(turno: { desde: string; hasta: string }, minuto: number): boolean {
  const r = minutosDelTurno(turno);
  return minuto >= r.desde && minuto < r.hasta;
}

/**
 * La cobertura del día, franja por franja.
 *
 * `perrosPorMinuto` es opcional porque la planilla se arma mirando hacia
 * adelante, cuando todavía no hay perros que contar.
 */
export function coberturaDelDia(
  turnos: Turno[],
  perrosPorMinuto: (minuto: number) => number = () => 0,
  desdeMinuto = 0,
  hastaMinuto = 24 * 60,
): FranjaDeCobertura[] {
  const franjas: FranjaDeCobertura[] = [];
  for (let m = desdeMinuto; m < hastaMinuto; m += PASO_MINUTOS) {
    franjas.push({
      minutoDelDia: m,
      hora: hhmmDesdeMinutos(m),
      gente: turnos.filter((t) => cubre(t, m)).length,
      perros: perrosPorMinuto(m),
    });
  }
  return franjas;
}

export interface HuecoDeCobertura {
  desde: string;
  hasta: string;
  /** El momento más lleno del hueco. Es lo que lo hace grave o no. */
  perros: number;
}

/**
 * Las franjas con perros en la casa y nadie cubriendo.
 *
 * Es el único número de esta pantalla que importa de verdad. Una planilla
 * bonita con un hueco de dos horas a las cinco de la tarde, con quince
 * perros adentro, es una planilla que no sirvió para nada.
 *
 * Las franjas contiguas se juntan: seis huecos de 30 minutos seguidos son
 * un hueco de tres horas, y leerlos sueltos los hace parecer menores.
 */
export function huecosDeCobertura(
  franjas: FranjaDeCobertura[],
): HuecoDeCobertura[] {
  const huecos: HuecoDeCobertura[] = [];
  let abierto: { desde: number; hasta: number; perros: number } | null = null;

  for (const f of franjas) {
    const descubierta = f.gente === 0 && f.perros > 0;
    if (descubierta) {
      if (abierto && abierto.hasta === f.minutoDelDia) {
        abierto.hasta = f.minutoDelDia + PASO_MINUTOS;
        abierto.perros = Math.max(abierto.perros, f.perros);
      } else {
        if (abierto) huecos.push(cerrar(abierto));
        abierto = {
          desde: f.minutoDelDia,
          hasta: f.minutoDelDia + PASO_MINUTOS,
          perros: f.perros,
        };
      }
    }
  }
  if (abierto) huecos.push(cerrar(abierto));
  return huecos;
}

function cerrar(h: { desde: number; hasta: number; perros: number }): HuecoDeCobertura {
  return {
    desde: hhmmDesdeMinutos(h.desde),
    // El final del día es "24:00" y no "00:00". `hhmmDesdeMinutos(1440)`
    // da la vuelta al reloj, y un hueco de un día entero terminaba
    // escrito "de 00:00 a 00:00", que se lee como que no dura nada.
    hasta: h.hasta >= 24 * 60 ? "24:00" : hhmmDesdeMinutos(h.hasta),
    perros: h.perros,
  };
}

/* ── Lo planificado contra lo que pasó ──────────────────────────────── */

/** Algo que esa persona hizo durante el día, con su hora. */
export interface Rastro {
  instante: InstanteISO;
  /** "un reporte", "un incidente". Para poder decir de dónde salió. */
  que: string;
}

export type FuenteDeLaHora = "fichaje" | "rastro" | "nada";

export interface LadoObservado {
  /** El instante que mejor conocemos, o null si no hay nada. */
  instante: InstanteISO | null;
  fuente: FuenteDeLaHora;
}

export interface ComparacionDeTurno {
  turnoId: ID;
  fecha: FechaISO;
  entrada: LadoObservado;
  salida: LadoObservado;
  /** Cuántos rastros dejó en total. Cero con fichaje sigue siendo raro. */
  rastros: number;
}

/**
 * Qué se sabe del turno, y con qué grado de certeza.
 *
 * El fichaje gana siempre sobre el rastro: es la hora que la persona
 * declaró, no una deducida de su trabajo. Y cuando no hay ninguno de los
 * dos, la respuesta es "no se sabe" y no una hora inventada — que es el
 * mismo criterio con el que una estadía en curso no cuenta como "retiro a
 * las 00:00".
 */
export function compararTurno(turno: Turno, rastros: Rastro[]): ComparacionDeTurno {
  const ordenados = [...rastros].sort((a, b) =>
    a.instante < b.instante ? -1 : a.instante > b.instante ? 1 : 0,
  );

  return {
    turnoId: turno.id,
    fecha: turno.fecha,
    entrada: lado(turno.entradaReal, ordenados[0]?.instante),
    salida: lado(turno.salidaReal, ordenados[ordenados.length - 1]?.instante),
    rastros: ordenados.length,
  };
}

function lado(fichaje?: InstanteISO, rastro?: InstanteISO): LadoObservado {
  if (fichaje) return { instante: fichaje, fuente: "fichaje" };
  if (rastro) return { instante: rastro, fuente: "rastro" };
  return { instante: null, fuente: "nada" };
}
