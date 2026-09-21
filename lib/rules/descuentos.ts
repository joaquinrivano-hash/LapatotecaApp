/**
 * Armado de cotizaciones y aplicación de descuentos.
 *
 * Los descuentos son ACUMULABLES EN CASCADA: cada uno se calcula sobre lo que
 * quedó del anterior, no sobre el subtotal original. Un hotel de 15 días para
 * el segundo perro queda -15% y después -20%, o sea -32% real.
 *
 * El orden importa y es siempre: duración → segundo perro → cliente activo.
 */

import { DESCUENTOS } from "@/lib/config/precios";
import { redondearCLP } from "@/lib/utils/moneda";
import type {
  Cotizacion,
  DescuentoAplicado,
  LineaCotizacion,
} from "@/lib/types";

export interface DescuentoSolicitado {
  concepto: string;
  /** Fracción: 0.2 = 20%. */
  porcentaje: number;
}

export function aplicarDescuentos(
  subtotal: number,
  solicitados: DescuentoSolicitado[],
): { descuentos: DescuentoAplicado[]; total: number } {
  let restante = subtotal;
  const descuentos: DescuentoAplicado[] = [];

  for (const d of solicitados) {
    if (d.porcentaje <= 0) continue;
    const monto = redondearCLP(restante * d.porcentaje);
    if (monto <= 0) continue;
    descuentos.push({ concepto: d.concepto, porcentaje: d.porcentaje, monto });
    restante -= monto;
  }

  return { descuentos, total: redondearCLP(restante) };
}

export function construirCotizacion(
  lineas: LineaCotizacion[],
  solicitados: DescuentoSolicitado[] = [],
): Cotizacion {
  const subtotal = redondearCLP(
    lineas.reduce((suma, linea) => suma + linea.monto, 0),
  );
  const { descuentos, total } = aplicarDescuentos(subtotal, solicitados);
  return { lineas, subtotal, descuentos, total };
}

/**
 * El descuento aplica desde el SEGUNDO perro del mismo dueño en adelante.
 * `indicePerro` es la posición dentro de la reserva: 0 es el primero y paga
 * tarifa completa.
 */
export function descuentoSegundoPerro(
  indicePerro = 0,
): DescuentoSolicitado | null {
  if (indicePerro < 1) return null;
  return {
    concepto: "Segundo perro del mismo dueño",
    porcentaje: DESCUENTOS.segundoPerro,
  };
}

export function descuentoClienteActivo(
  esClienteActivo: boolean,
): DescuentoSolicitado | null {
  if (!esClienteActivo) return null;
  return {
    concepto: "Cliente activo",
    porcentaje: DESCUENTOS.clienteActivo,
  };
}

/** Filtra los nulos para poder encadenar los helpers de arriba. */
export function soloAplicables(
  candidatos: (DescuentoSolicitado | null)[],
): DescuentoSolicitado[] {
  return candidatos.filter((d): d is DescuentoSolicitado => d !== null);
}
