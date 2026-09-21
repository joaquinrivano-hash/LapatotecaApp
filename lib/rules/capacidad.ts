/**
 * Capacidad: el corazón del sistema.
 *
 * Hay 25 cupos SIMULTÁNEOS compartidos entre hotel y jardín, y se validan por
 * franja de 30 minutos. Un perro de jardín que se va a las 13:00 libera el
 * cupo para otro que entra a las 13:30.
 *
 * Consecuencia importante: el "cupo usado" de un día es el PICO de las
 * franjas, no la cantidad de perros que pasaron. Si en el día pasaron 22 pero
 * nunca hubo más de 17 juntos, el cupo usado es 17. No mezclar los dos
 * números: `OcupacionDia` los expone por separado a propósito.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  fechaISO,
  formatearFechaLarga,
  hhmmDesdeMinutos,
  instanteEn,
  minutosDelDia,
  rangoFechas,
  sumarDias,
} from "@/lib/utils/fecha";
import type {
  EstadiaJardin,
  EstadoEstadia,
  EstadoReserva,
  FechaISO,
  ID,
  InstanteISO,
  Linea,
  OcupacionDia,
  ReservaHotel,
  SlotOcupacion,
} from "@/lib/types";

/** Un perro ocupando espacio entre dos instantes. */
export interface OcupanteRango {
  perroId: ID;
  linea: Linea;
  inicio: InstanteISO;
  fin: InstanteISO;
  /** Id de la reserva o estadía que lo originó. */
  referenciaId?: ID;
}

/** Estados que efectivamente ocupan un cupo. Canceladas y no-shows no cuentan. */
const ESTADOS_RESERVA_OCUPAN: readonly EstadoReserva[] = [
  "pendiente",
  "confirmada",
  "en_curso",
  "finalizada",
];

const ESTADOS_ESTADIA_OCUPAN: readonly EstadoEstadia[] = [
  "esperada",
  "presente",
  "finalizada",
];

export function ocupantesDeReservas(
  reservas: ReservaHotel[],
): OcupanteRango[] {
  return reservas
    .filter((r) => ESTADOS_RESERVA_OCUPAN.includes(r.estado))
    .map((r) => ({
      perroId: r.perroId,
      linea: "hotel" as const,
      inicio: r.inicioReal ?? r.inicioProgramado,
      fin: r.finReal ?? r.finProgramado,
      referenciaId: r.id,
    }));
}

export function ocupantesDeEstadias(
  estadias: EstadiaJardin[],
): OcupanteRango[] {
  return estadias
    .filter((e) => ESTADOS_ESTADIA_OCUPAN.includes(e.estado))
    .map((e) => ({
      perroId: e.perroId,
      linea: "jardin" as const,
      inicio: e.inicioReal ?? e.inicioProgramado,
      fin: e.finReal ?? e.finProgramado,
      referenciaId: e.id,
    }));
}

interface RangoEnMs {
  perroId: ID;
  linea: Linea;
  inicio: number;
  fin: number;
}

function aMs(ocupantes: OcupanteRango[]): RangoEnMs[] {
  return ocupantes.map((o) => ({
    perroId: o.perroId,
    linea: o.linea,
    inicio: new Date(o.inicio).getTime(),
    fin: new Date(o.fin).getTime(),
  }));
}

/**
 * Ocupación franja por franja de un día.
 *
 * El traslape usa comparación estricta: un perro que se va a las 13:00 y otro
 * que llega a las 13:00 NO se pisan.
 */
export function calcularOcupacionDia(
  fecha: FechaISO,
  ocupantes: OcupanteRango[],
): OcupacionDia {
  const inicioDia = new Date(instanteEn(fecha, 0)).getTime();
  const finDia = new Date(instanteEn(sumarDias(fecha, 1), 0)).getTime();
  const paso = NEGOCIO.capacidad.minutosPorSlot * 60_000;

  const relevantes = aMs(ocupantes).filter(
    (o) => o.inicio < finDia && o.fin > inicioDia,
  );

  const slots: SlotOcupacion[] = [];
  let pico = 0;
  let picoMinutoDelDia = 0;

  for (let t = inicioDia; t < finDia; t += paso) {
    const finSlot = t + paso;
    let hotel = 0;
    let jardin = 0;

    for (const o of relevantes) {
      if (o.inicio < finSlot && o.fin > t) {
        if (o.linea === "hotel") hotel += 1;
        else jardin += 1;
      }
    }

    const total = hotel + jardin;
    // La hora de pared: en los días de cambio de hora no coincide con el
    // desplazamiento desde medianoche, y lo que el staff lee es la hora.
    const minuto = minutosDelDia(new Date(t));
    slots.push({ minutoDelDia: minuto, hotel, jardin, total });

    if (total > pico) {
      pico = total;
      picoMinutoDelDia = minuto;
    }
  }

  const unicos = (linea?: Linea) =>
    new Set(
      relevantes.filter((o) => !linea || o.linea === linea).map((o) => o.perroId),
    ).size;

  return {
    fecha,
    slots,
    pico,
    picoMinutoDelDia,
    perrosDistintos: unicos(),
    perrosHotel: unicos("hotel"),
    perrosJardin: unicos("jardin"),
  };
}

export function cuposDisponibles(
  fecha: FechaISO,
  ocupantes: OcupanteRango[],
  maximo: number = NEGOCIO.capacidad.maximoSimultaneo,
): number {
  return Math.max(0, maximo - calcularOcupacionDia(fecha, ocupantes).pico);
}

export interface ConflictoCapacidad {
  fecha: FechaISO;
  minutoDelDia: number;
  ocupados: number;
  maximo: number;
}

export interface ResultadoCapacidad {
  hayCupo: boolean;
  conflictos: ConflictoCapacidad[];
  /** Pico que alcanzaría cada día afectado si se aceptara la reserva. */
  picoPorDia: { fecha: FechaISO; pico: number }[];
}

/** Días de Santiago que toca un conjunto de rangos. */
function diasAfectados(ocupantes: OcupanteRango[]): FechaISO[] {
  if (ocupantes.length === 0) return [];
  const inicios = ocupantes.map((o) => new Date(o.inicio).getTime());
  const fines = ocupantes.map((o) => new Date(o.fin).getTime());
  return rangoFechas(
    fechaISO(new Date(Math.min(...inicios))),
    fechaISO(new Date(Math.max(...fines))),
  );
}

/**
 * ¿Cabe esta reserva? Revisa todas las franjas de todos los días que toca.
 *
 * Devuelve los conflictos con día y hora, no un "no hay cupo" pelado: el staff
 * necesita saber si el problema es el martes a las 10:00 para ofrecer otra
 * hora.
 */
export function verificarCapacidad(
  nuevos: OcupanteRango[],
  existentes: OcupanteRango[],
  maximo: number = NEGOCIO.capacidad.maximoSimultaneo,
): ResultadoCapacidad {
  const conflictos: ConflictoCapacidad[] = [];
  const picoPorDia: { fecha: FechaISO; pico: number }[] = [];
  const todos = [...existentes, ...nuevos];

  for (const fecha of diasAfectados(nuevos)) {
    const ocupacion = calcularOcupacionDia(fecha, todos);
    picoPorDia.push({ fecha, pico: ocupacion.pico });

    for (const slot of ocupacion.slots) {
      if (slot.total > maximo) {
        conflictos.push({
          fecha,
          minutoDelDia: slot.minutoDelDia,
          ocupados: slot.total,
          maximo,
        });
      }
    }
  }

  return { hayCupo: conflictos.length === 0, conflictos, picoPorDia };
}

/** Mensaje para mostrarle a una persona, no un código de error. */
export function describirConflicto(conflicto: ConflictoCapacidad): string {
  const dia = formatearFechaLarga(instanteEn(conflicto.fecha, 12 * 60));
  const hora = hhmmDesdeMinutos(conflicto.minutoDelDia);
  return `El ${dia} a las ${hora} ya hay ${conflicto.maximo} perros: no queda cupo.`;
}

/** Resume varios conflictos en una sola frase, agrupando por día. */
export function describirConflictos(
  conflictos: ConflictoCapacidad[],
): string[] {
  const porDia = new Map<FechaISO, ConflictoCapacidad[]>();
  for (const c of conflictos) {
    porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);
  }

  return [...porDia.entries()].map(([fecha, lista]) => {
    const dia = formatearFechaLarga(instanteEn(fecha, 12 * 60));
    const desde = hhmmDesdeMinutos(Math.min(...lista.map((c) => c.minutoDelDia)));
    const hasta = hhmmDesdeMinutos(
      Math.max(...lista.map((c) => c.minutoDelDia)) +
        NEGOCIO.capacidad.minutosPorSlot,
    );
    return `El ${dia} no queda cupo entre las ${desde} y las ${hasta}.`;
  });
}
