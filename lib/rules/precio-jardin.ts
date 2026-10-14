/**
 * Precio del jardín.
 *
 * Día suelto: hasta 6 horas inclusive $10.000, más de 6 horas $18.000.
 * Si el perro viene con plan, la jornada ya está pagada y solo consume un día
 * del pack. El recargo fuera de horario se cobra igual, con plan o sin plan:
 * el pack cubre el día, no que lo pasen a buscar tarde.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import {
  construirCotizacion,
  descuentoSegundoPerro,
  soloAplicables,
} from "@/lib/rules/descuentos";
import {
  fechaISO,
  formatearHora,
  horasEntre,
  instanteEn,
  minutosEntre,
} from "@/lib/utils/fecha";
import type {
  Cotizacion,
  InstanteISO,
  LineaCotizacion,
  OrigenEstadia,
} from "@/lib/types";

export interface EntradaPrecioJardin {
  inicio: InstanteISO;
  /** Programado al cotizar, real al cerrar la jornada. */
  fin: InstanteISO;
  origen: OrigenEstadia;
  /** Posición del perro en la reserva del dueño: 0 = primero, sin descuento. */
  indicePerro?: number;
}

export type TipoJornada = "corta" | "media" | "larga";

/**
 * Tres tramos por tiempo, según el folleto:
 *   menos de 4 h            → corta
 *   entre 4 y 8 h inclusive → media
 *   más de 8 h              → larga
 */
export function clasificarJornada(
  inicio: InstanteISO,
  fin: InstanteISO,
): TipoJornada {
  const horas = Math.max(0, horasEntre(inicio, fin));
  if (horas < NEGOCIO.jardin.horasJornadaCorta) return "corta";
  if (horas <= NEGOCIO.jardin.horasJornadaMedia) return "media";
  return "larga";
}

const PRECIO_JORNADA: Record<TipoJornada, number> = {
  corta: PRECIOS.jardin.jornadaCorta,
  media: PRECIOS.jardin.jornadaMedia,
  larga: PRECIOS.jardin.jornadaLarga,
};

const DETALLE_JORNADA: Record<TipoJornada, string> = {
  corta: `Menos de ${NEGOCIO.jardin.horasJornadaCorta} h`,
  media: `Entre ${NEGOCIO.jardin.horasJornadaCorta} y ${NEGOCIO.jardin.horasJornadaMedia} h`,
  larga: `Más de ${NEGOCIO.jardin.horasJornadaMedia} h`,
};

export interface RecargoFueraDeHorario {
  horas: number;
  monto: number;
  /** Minutos pasados del cierre, incluyendo los de gracia. */
  minutosPasados: number;
}

/**
 * Recargo por retiro tarde, medido contra el cierre del jardín y calculado
 * desde el check-out REAL. Los primeros 15 minutos son de gracia; después se
 * cobra cada hora iniciada.
 */
export function calcularRecargoFueraDeHorario(
  inicio: InstanteISO,
  finReal: InstanteISO,
): RecargoFueraDeHorario {
  const cierre = instanteEn(
    fechaISO(inicio),
    NEGOCIO.jardin.horaCierre * 60,
  );
  const minutosPasados = minutosEntre(cierre, finReal);

  if (minutosPasados <= NEGOCIO.jardin.minutosGracia) {
    return { horas: 0, monto: 0, minutosPasados: Math.max(0, minutosPasados) };
  }

  const horas = Math.ceil(minutosPasados / 60);
  return {
    horas,
    monto: horas * PRECIOS.jardin.horaFueraDeHorario,
    minutosPasados,
  };
}

export function calcularPrecioJardin(
  entrada: EntradaPrecioJardin,
): Cotizacion {
  const lineas: LineaCotizacion[] = [];
  const jornada = clasificarJornada(entrada.inicio, entrada.fin);

  if (entrada.origen === "dia_de_prueba") {
    lineas.push({
      concepto: "Día de prueba",
      detalle: "Evaluación previa a la primera reserva",
      monto: PRECIOS.diaDePrueba,
    });
  } else if (entrada.origen === "plan") {
    lineas.push({
      concepto: "Jardín con plan",
      detalle: "Consume 1 día del pack",
      monto: 0,
    });
  } else {
    lineas.push({
      concepto: "Jardín día suelto",
      detalle: DETALLE_JORNADA[jornada],
      monto: PRECIO_JORNADA[jornada],
    });
  }

  const recargo = calcularRecargoFueraDeHorario(entrada.inicio, entrada.fin);
  if (recargo.monto > 0) {
    lineas.push({
      concepto: "Fuera de horario",
      detalle: `${recargo.horas} h después del cierre (retiro ${formatearHora(entrada.fin)})`,
      monto: recargo.monto,
    });
  }

  return construirCotizacion(
    lineas,
    soloAplicables([descuentoSegundoPerro(entrada.indicePerro)]),
  );
}

/* ── Cancelar un día ───────────────────────────────────────────────── */

export interface DevolucionJardin {
  devuelve: boolean;
  /** Horas que faltaban para la llegada. Negativo si el día ya empezó. */
  horasDeAviso: number;
  motivo: string;
}

/**
 * Cancelar un día de jardín.
 *
 * Misma forma que el hotel y el día de prueba —un corte en horas y después
 * no se devuelve nada—, con el corte del día de prueba y no el del hotel: es
 * un solo día. Pedir 48 horas de aviso para cancelar una jornada suelta
 * dejaría sin salida a cualquiera que se enferme la noche antes.
 *
 * Pasado el corte el día se pierde, y no por castigar: el cupo quedó tomado
 * y a esa altura ya no se alcanza a revender.
 */
export function calcularDevolucionJardin(
  inicioProgramado: InstanteISO,
  momentoCancelacion: InstanteISO,
): DevolucionJardin {
  const horasDeAviso = horasEntre(momentoCancelacion, inicioProgramado);
  const minimo = NEGOCIO.jardin.horasParaCancelarSinCosto;

  if (horasDeAviso >= minimo) {
    return {
      devuelve: true,
      horasDeAviso,
      motivo: `Cancelado con ${Math.floor(horasDeAviso)} h de aviso: no se cobra.`,
    };
  }

  return {
    devuelve: false,
    horasDeAviso,
    motivo:
      horasDeAviso < 0
        ? "El día ya empezó: se cobra completo."
        : `Cancelado con ${Math.floor(horasDeAviso)} h de aviso, menos de las ${minimo} necesarias: se cobra completo.`,
  };
}
