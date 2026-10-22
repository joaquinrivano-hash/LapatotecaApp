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
export function minutosDelTurno(turno: { desde: string; hasta: string }): {
  desde: number;
  hasta: number;
} {
  const desde = minutosDesdeHHMM(turno.desde);
  const hasta = minutosDesdeHHMM(turno.hasta);
  return { desde, hasta: hasta > desde ? hasta : 24 * 60 };
}

/** ¿El turno cubre ese minuto del día? */
export function cubre(
  turno: { desde: string; hasta: string },
  minuto: number,
): boolean {
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

function cerrar(h: {
  desde: number;
  hasta: number;
  perros: number;
}): HuecoDeCobertura {
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
export function compararTurno(
  turno: Turno,
  rastros: Rastro[],
): ComparacionDeTurno {
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

/* ── La planilla como grilla ──────────────────────────────────────────
 *
 * La otra manera de mirar lo mismo: una columna por turno —"Turno 1",
 * "Turno 2"— y una fila por bloque horario, con el bloque de cada persona
 * pintado a lo largo de las filas que cubre. Es la forma en que la dueña
 * ya llevaba la planilla en una planilla de cálculo, y sirve para una
 * pregunta que la vista por día contesta mal: **mirar la semana completa
 * y ver dónde queda un hueco**. La vista por día contesta la otra —cómo le
 * fue a cada turno— y por eso las dos siguen existiendo.
 *
 * "Turno 1" y "Turno 2" no son un campo del modelo: son el ORDEN en que
 * empiezan los turnos de ese día. Guardarlo como dato obligaría a elegir
 * la etiqueta al asignar, y a corregirla cuando alguien entra antes.
 */

/** Los turnos de un día en el orden en que empiezan: el primero es "Turno 1". */
export function ordenarTurnosDelDia<T extends { desde: string; hasta: string }>(
  turnos: T[],
): T[] {
  return [...turnos].sort((a, b) => {
    const ra = minutosDelTurno(a);
    const rb = minutosDelTurno(b);
    // A igual hora de entrada, primero el que se va antes: así dos turnos
    // que empiezan juntos no bailan de columna entre una carga y otra.
    return ra.desde - rb.desde || ra.hasta - rb.hasta;
  });
}

/**
 * Cuántas columnas de turno lleva cada día.
 *
 * Siempre al menos `minimo`, aunque la semana esté vacía: una grilla sin
 * columnas no se entiende, y las columnas vacías son justo las que
 * muestran el día que nadie cubre.
 */
export function columnasPorDia(turnosPorDia: number[], minimo = 2): number {
  return Math.max(minimo, ...turnosPorDia, 0);
}

export interface RangoDeLaPlanilla {
  desde: number;
  hasta: number;
}

/**
 * Las horas que la grilla dibuja.
 *
 * Parte de las horas de atención y **se estira** para que entre cualquier
 * turno asignado fuera de ellas. Una planilla que recorta al que entra a
 * las 6 lo deja sin existir en la pantalla donde se revisa la planilla.
 */
export function rangoDeLaPlanilla(
  turnos: { desde: string; hasta: string }[],
  desdeMinuto: number,
  hastaMinuto: number,
): RangoDeLaPlanilla {
  let desde = desdeMinuto;
  let hasta = hastaMinuto;
  for (const turno of turnos) {
    const r = minutosDelTurno(turno);
    if (r.desde < desde) desde = r.desde;
    if (r.hasta > hasta) hasta = r.hasta;
  }
  // A la baja se redondea al bloque, a la alza se completa: si no, un turno
  // que entra a las 6:50 dejaría su primera fila cortada por la mitad.
  desde = Math.floor(desde / PASO_MINUTOS) * PASO_MINUTOS;
  hasta = Math.ceil(hasta / PASO_MINUTOS) * PASO_MINUTOS;
  return { desde, hasta };
}

/** Las filas de la grilla, de arriba abajo. */
export function bloquesDeLaPlanilla(
  rango: RangoDeLaPlanilla,
): { minutoDelDia: number; hora: string }[] {
  const bloques: { minutoDelDia: number; hora: string }[] = [];
  for (let m = rango.desde; m < rango.hasta; m += PASO_MINUTOS) {
    bloques.push({ minutoDelDia: m, hora: hhmmDesdeMinutos(m) });
  }
  return bloques;
}

/**
 * Qué filas ocupa un turno dentro del rango, contadas desde 0.
 *
 * `hasta` es exclusivo, como un `slice`. Null si el turno queda entero
 * fuera del rango, que no debería pasar —`rangoDeLaPlanilla` lo estira—
 * pero pasa si alguien dibuja un rango a mano.
 */
export function filasDelTurno(
  turno: { desde: string; hasta: string },
  rango: RangoDeLaPlanilla,
): { desde: number; hasta: number } | null {
  const r = minutosDelTurno(turno);
  const desde = Math.max(r.desde, rango.desde);
  const hasta = Math.min(r.hasta, rango.hasta);
  if (hasta <= desde) return null;
  return {
    desde: Math.floor((desde - rango.desde) / PASO_MINUTOS),
    hasta: Math.ceil((hasta - rango.desde) / PASO_MINUTOS),
  };
}

/**
 * A cada persona su color, por orden de aparición.
 *
 * Por orden y no por un hash del id: con un hash, dos personas de la misma
 * semana pueden caer en el mismo color, y entonces la grilla —que se lee
 * por color— dice que cubre la misma persona cuando son dos. Repetir recién
 * se vuelve posible pasados los colores que haya.
 */
export function coloresPorPersona(ids: ID[], cuantos: number): Map<ID, number> {
  const mapa = new Map<ID, number>();
  for (const id of ids) {
    if (!mapa.has(id)) mapa.set(id, mapa.size % cuantos);
  }
  return mapa;
}
