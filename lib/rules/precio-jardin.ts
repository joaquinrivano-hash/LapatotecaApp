/**
 * Precio del jardín.
 *
 * Día suelto: tres tramos por tiempo (menos de 4 h, entre 4 y 8 h, más de
 * 8 h). Si el perro viene con plan, la jornada ya está pagada y solo consume
 * un día del pack.
 *
 * El retiro tarde NO entra en el precio del día: es un recargo aparte, que
 * no se cobra solo — lo decide Administración (`calcularRecargoFueraDeHorario`).
 * Antes iba como una línea más del día, y un ingreso sin reserva retirado
 * tarde quedaba con el recargo dos veces: dentro del día que se emitía y en
 * su propia cola.
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

export function precioDeJornada(jornada: TipoJornada): number {
  return PRECIO_JORNADA[jornada];
}

/* ── El retiro tarde ───────────────────────────────────────────────── */

export interface RecargoFueraDeHorario {
  monto: number;
  /** Minutos después de la hora desde la que se cobra (ver `desde`). */
  minutosDeAtraso: number;
  /**
   * Desde qué hora corre el atraso, en palabras: "19:00" con plan,
   * "21:00" sin plan. Es lo que se le dice al cuidador.
   */
  desde: string;
  /** Con plan: bloques de 30 min cobrados entre el cierre y el fin de la atención. */
  bloques: number;
  /** Si además se pasó del fin de la atención, que tiene su cargo fijo. */
  despuesDeAtencion: boolean;
}

const hora = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Recargo por retiro tarde, desde la salida REAL. Desde el 06-11:
 *
 * - **Con plan**: entre el cierre del jardín (19:00) y el fin de la
 *   atención (21:00), $500 por cada bloque de 30 minutos o fracción. Pasadas
 *   las 21:00 se suman $5.000 fijos.
 * - **Día suelto** (y día de prueba): entre las 19:00 y las 21:00 no hay
 *   recargo — el día ya se pagó entero. Pasadas las 21:00, $5.000 fijos.
 *
 * Por qué distinto: el plan sale más barato por día, y lo que cubre es el
 * horario del jardín; el día suelto se paga a precio completo y alcanza
 * hasta el fin de la atención. Pasadas las 21:00 ya no se entrega ni se
 * retira, así que cuesta lo mismo para todos.
 *
 * Nunca se cobra solo: queda calculado para que Administración lo cobre o
 * lo perdone. Por eso no hay minutos de gracia automáticos.
 */
export function calcularRecargoFueraDeHorario(
  inicio: InstanteISO,
  finReal: InstanteISO,
  origen: OrigenEstadia,
): RecargoFueraDeHorario {
  const dia = fechaISO(inicio);
  const { horaCierre, horaFinAtencion, minutosBloqueRecargo, minutosGracia } =
    NEGOCIO.jardin;
  const pasadoDelCierre = minutosEntre(instanteEn(dia, horaCierre * 60), finReal);
  const pasadoDeAtencion = minutosEntre(
    instanteEn(dia, horaFinAtencion * 60),
    finReal,
  );
  const despuesDeAtencion = pasadoDeAtencion > minutosGracia;
  const fijo = despuesDeAtencion ? PRECIOS.jardin.recargoDespuesDeAtencion : 0;

  if (origen === "plan") {
    const minutosEnTramo = Math.min(
      pasadoDelCierre,
      (horaFinAtencion - horaCierre) * 60,
    );
    const bloques =
      pasadoDelCierre > minutosGracia
        ? Math.ceil(minutosEnTramo / minutosBloqueRecargo)
        : 0;
    return {
      monto: bloques * PRECIOS.jardin.recargoPlanPorBloque + fijo,
      minutosDeAtraso: bloques > 0 ? pasadoDelCierre : 0,
      desde: hora(horaCierre),
      bloques,
      despuesDeAtencion,
    };
  }

  return {
    monto: fijo,
    minutosDeAtraso: despuesDeAtencion ? pasadoDeAtencion : 0,
    desde: hora(horaFinAtencion),
    bloques: 0,
    despuesDeAtencion,
  };
}

/* ── El precio del día ─────────────────────────────────────────────── */

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

  return construirCotizacion(
    lineas,
    soloAplicables([descuentoSegundoPerro(entrada.indicePerro)]),
  );
}

/* ── Las horas que se pueden elegir ────────────────────────────────── */

/** Cada cuánto se puede elegir la hora de ingreso y de salida. */
export const MINUTOS_ENTRE_HORARIOS = 30;

/** Las horas de ingreso que se ofrecen: de la apertura a media hora antes del cierre. */
export function horariosDeIngreso(): number[] {
  const { horaApertura, horaCierre } = NEGOCIO.jardin;
  const horarios: number[] = [];
  for (
    let m = horaApertura * 60;
    m < horaCierre * 60;
    m += MINUTOS_ENTRE_HORARIOS
  ) {
    horarios.push(m);
  }
  return horarios;
}

/** Las horas de salida para un ingreso dado: desde media hora después, hasta el cierre. */
export function horariosDeSalida(desdeMinuto: number): number[] {
  const horarios: number[] = [];
  for (
    let m = desdeMinuto + MINUTOS_ENTRE_HORARIOS;
    m <= NEGOCIO.jardin.horaCierre * 60;
    m += MINUTOS_ENTRE_HORARIOS
  ) {
    horarios.push(m);
  }
  return horarios;
}

/**
 * Lo que impide reservar ese horario. La pantalla solo ofrece horas que
 * sirven, pero quien no deja pasar una que no sirve es el servicio, que es
 * por donde entra todo el mundo.
 */
export function revisarHorarioJardin(
  desdeMinuto: number,
  hastaMinuto: number,
): string[] {
  const { horaApertura, horaCierre } = NEGOCIO.jardin;
  const problemas: string[] = [];
  if (desdeMinuto < horaApertura * 60 || hastaMinuto > horaCierre * 60) {
    problemas.push(
      `El jardín abre de ${hora(horaApertura)} a ${hora(horaCierre)}: elige un horario dentro de ese rango.`,
    );
  }
  if (hastaMinuto <= desdeMinuto) {
    problemas.push("La hora de salida tiene que ser después de la de ingreso.");
  }
  return problemas;
}

/* ── Las horas de más ──────────────────────────────────────────────── */

export interface HorasDeMas {
  monto: number;
  reservada: TipoJornada;
  real: TipoJornada;
}

/**
 * Lo que falta cuando el perro se quedó más de lo reservado.
 *
 * Mira solo el tramo del día: el retiro tarde es otra cosa y tiene su
 * propio recargo. Si el tramo real no es más caro que el reservado, no
 * falta nada — llegar antes o irse después dentro del mismo tramo es la
 * vida real, no una reserva distinta.
 *
 * La diferencia se cobra en la misma proporción que se cobró lo reservado:
 * si ese día tuvo el descuento del segundo perro, la diferencia también.
 * Por eso recibe lo que se cobró y no lo calcula.
 *
 * Nunca se cobra sola: queda para que Administración la cobre o la
 * perdone, igual que el recargo.
 */
export function calcularHorasDeMas(entrada: {
  inicioProgramado: InstanteISO;
  finProgramado: InstanteISO;
  inicioReal?: InstanteISO;
  finReal: InstanteISO;
  /** Lo que se cobró por el día reservado. */
  cobrado: number;
}): HorasDeMas {
  const reservada = clasificarJornada(entrada.inicioProgramado, entrada.finProgramado);
  const real = clasificarJornada(
    entrada.inicioReal ?? entrada.inicioProgramado,
    entrada.finReal,
  );
  const precioReservado = PRECIO_JORNADA[reservada];
  const diferencia = PRECIO_JORNADA[real] - precioReservado;
  if (diferencia <= 0 || entrada.cobrado <= 0) {
    return { monto: 0, reservada, real };
  }
  return {
    monto: Math.round((diferencia * entrada.cobrado) / precioReservado),
    reservada,
    real,
  };
}

/** "Reservó 09:00 a 12:00 · estuvo 09:10 a 18:00" */
export function describirHorasDeMas(estadia: {
  inicioProgramado: InstanteISO;
  finProgramado: InstanteISO;
  inicioReal?: InstanteISO;
  finReal?: InstanteISO;
}): string {
  const reservado = `${formatearHora(estadia.inicioProgramado)} a ${formatearHora(estadia.finProgramado)}`;
  if (!estadia.finReal) return `Reservó ${reservado}`;
  const llegada = formatearHora(estadia.inicioReal ?? estadia.inicioProgramado);
  return `Reservó ${reservado} · estuvo ${llegada} a ${formatearHora(estadia.finReal)}`;
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
  return devolucionJardinConAviso(
    horasEntre(momentoCancelacion, inicioProgramado),
  );
}

/**
 * La misma regla, dado el aviso en horas.
 *
 * En la nube esas horas las mide la base con su reloj —el del navegador se
 * puede atrasar a mano—, y la pantalla explica lo que la base decidió.
 */
export function devolucionJardinConAviso(
  horasDeAviso: number,
): DevolucionJardin {
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
