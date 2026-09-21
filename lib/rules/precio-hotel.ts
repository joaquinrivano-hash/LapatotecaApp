/**
 * Precio del hotel.
 *
 * Se cobra por bloques de 24 horas ($24.000). El check-out tiene 2 horas de
 * tolerancia: pasada esa gracia, cada hora INICIADA cuesta $1.000. Las horas
 * extra nunca llegan a costar más que un bloque nuevo (22 < 24), así que
 * alargarse siempre sale más barato que reservar un día de más.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { DESCUENTOS, PRECIOS } from "@/lib/config/precios";
import {
  construirCotizacion,
  descuentoSegundoPerro,
  soloAplicables,
  type DescuentoSolicitado,
} from "@/lib/rules/descuentos";
import { horasEntre } from "@/lib/utils/fecha";
import { redondearCLP } from "@/lib/utils/moneda";
import type { Cotizacion, InstanteISO, LineaCotizacion } from "@/lib/types";

export interface EntradaPrecioHotel {
  inicio: InstanteISO;
  /** Programado al cotizar, real al cerrar la estadía. */
  fin: InstanteISO;
  /** Paseos contratados, a $4.000 cada uno. */
  paseosContratados?: number;
  /** Posición del perro en la reserva del dueño: 0 = primero, sin descuento. */
  indicePerro?: number;
  /** Suma un 10% adicional si el cliente tiene plan de jardín vigente. */
  conPlanDeJardin?: boolean;
}

export interface DesgloseEstadiaHotel {
  horasTotales: number;
  /** Bloques de 24 h cobrados. Toda estadía paga al menos uno. */
  bloques: number;
  /** Horas que sobran por encima de los bloques cobrados. */
  horasSobrantes: number;
  /** Horas efectivamente cobradas, ya descontada la tolerancia. */
  horasExtraCobradas: number;
}

/**
 * Cuántos bloques y horas extra tiene una estadía, sin mirar precios.
 *
 * El mínimo es un bloque: dejar al perro tres horas es una noche de hotel, no
 * tres horas sueltas. El cobro por hora existe solo para el que se pasa de un
 * bloque ya empezado, y por eso las horas sobrantes se miden contra los
 * bloques COBRADOS, no contra la división entera.
 */
export function desglosarEstadiaHotel(
  inicio: InstanteISO,
  fin: InstanteISO,
): DesgloseEstadiaHotel {
  const horasTotales = Math.max(0, horasEntre(inicio, fin));

  if (horasTotales <= 0) {
    return {
      horasTotales: 0,
      bloques: 0,
      horasSobrantes: 0,
      horasExtraCobradas: 0,
    };
  }

  const bloques = Math.max(
    1,
    Math.floor(horasTotales / NEGOCIO.hotel.horasPorBloque),
  );
  const horasSobrantes = Math.max(
    0,
    horasTotales - bloques * NEGOCIO.hotel.horasPorBloque,
  );

  const excedente = horasSobrantes - NEGOCIO.hotel.horasToleranciaCheckout;
  const horasExtraCobradas = excedente > 0 ? Math.ceil(excedente) : 0;

  return { horasTotales, bloques, horasSobrantes, horasExtraCobradas };
}

/**
 * Descuento por duración. Son tramos EXCLUYENTES: el de 14 noches reemplaza al
 * de 7, no se suman entre sí.
 *
 * Los umbrales son INCLUSIVOS: el folleto dice "desde 7 noches", así que 7
 * noches justas ya llevan el 10%.
 */
export function descuentoPorDuracion(
  bloques: number,
): DescuentoSolicitado | null {
  if (bloques >= NEGOCIO.hotel.nochesParaDescuento15) {
    return {
      concepto: `Desde ${NEGOCIO.hotel.nochesParaDescuento15} noches`,
      porcentaje: DESCUENTOS.hotelDesde14Noches,
    };
  }
  if (bloques >= NEGOCIO.hotel.nochesParaDescuento10) {
    return {
      concepto: `Desde ${NEGOCIO.hotel.nochesParaDescuento10} noches`,
      porcentaje: DESCUENTOS.hotelDesde7Noches,
    };
  }
  return null;
}

/** El folleto da un 10% adicional a quien tiene un plan de jardín vigente. */
export function descuentoPorPlanDeJardin(
  tienePlanVigente: boolean,
): DescuentoSolicitado | null {
  if (!tienePlanVigente) return null;
  return {
    concepto: "Con plan de jardín vigente",
    porcentaje: DESCUENTOS.hotelConPlanDeJardin,
  };
}

export function calcularPrecioHotel(entrada: EntradaPrecioHotel): Cotizacion {
  const { bloques, horasExtraCobradas } = desglosarEstadiaHotel(
    entrada.inicio,
    entrada.fin,
  );

  const lineas: LineaCotizacion[] = [];

  if (bloques > 0) {
    lineas.push({
      concepto: "Alojamiento",
      detalle: `${bloques} ${bloques === 1 ? "noche" : "noches"} de 24 h`,
      monto: bloques * PRECIOS.hotel.bloque24h,
    });
  }

  if (horasExtraCobradas > 0) {
    lineas.push({
      concepto: "Horas adicionales",
      detalle: `${horasExtraCobradas} h después de la tolerancia de ${NEGOCIO.hotel.horasToleranciaCheckout} h`,
      monto: horasExtraCobradas * PRECIOS.hotel.horaExtra,
    });
  }

  const paseos = entrada.paseosContratados ?? 0;
  if (paseos > 0) {
    lineas.push({
      concepto: "Paseos",
      detalle: `${paseos} ${paseos === 1 ? "paseo" : "paseos"}`,
      monto: paseos * PRECIOS.hotel.paseo,
    });
  }

  const cotizacion = construirCotizacion(
    lineas,
    soloAplicables([
      descuentoPorDuracion(bloques),
      descuentoPorPlanDeJardin(entrada.conPlanDeJardin ?? false),
      descuentoSegundoPerro(entrada.indicePerro),
    ]),
  );

  return { ...cotizacion, abono: calcularAbono(cotizacion.total) };
}

/** El 30% que se paga al reservar. */
export function calcularAbono(total: number): number {
  return redondearCLP(total * NEGOCIO.hotel.fraccionAbono);
}

export interface ResultadoDevolucion {
  devuelve: boolean;
  monto: number;
  horasDeAviso: number;
  motivo: string;
}

/**
 * Cancelación: con 48 horas o más de aviso se devuelve el abono completo.
 * Con menos, no se devuelve nada.
 */
export function calcularDevolucion(
  inicioReserva: InstanteISO,
  momentoCancelacion: InstanteISO,
  abonoPagado: number,
): ResultadoDevolucion {
  const horasDeAviso = horasEntre(momentoCancelacion, inicioReserva);
  const minimo = NEGOCIO.hotel.horasParaDevolucion;

  if (horasDeAviso >= minimo) {
    return {
      devuelve: true,
      monto: abonoPagado,
      horasDeAviso,
      motivo: `Cancelada con ${Math.floor(horasDeAviso)} h de aviso: se devuelve el abono completo.`,
    };
  }

  return {
    devuelve: false,
    monto: 0,
    horasDeAviso,
    motivo:
      horasDeAviso < 0
        ? "La estadía ya había empezado: el abono no se devuelve."
        : `Cancelada con ${Math.floor(horasDeAviso)} h de aviso, menos de las ${minimo} h requeridas: el abono no se devuelve.`,
  };
}
