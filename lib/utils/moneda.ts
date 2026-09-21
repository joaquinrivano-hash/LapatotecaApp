/** Formato de pesos chilenos: enteros, punto de miles, sin decimales. */

const FORMATO = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * 18000 → "$18.000", -5000 → "-$5.000".
 *
 * Intl deja el signo adentro ("$-5.000"), que se lee pésimo en un desglose
 * de descuentos, así que lo sacamos al frente.
 */
export function formatearCLP(monto: number): string {
  const redondeado = Math.round(monto);
  if (redondeado < 0) return `-${FORMATO.format(Math.abs(redondeado))}`;
  return FORMATO.format(redondeado);
}

/** 18000 → "18.000" (sin signo, para tablas y ejes de gráficos). */
export function formatearMonto(monto: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(
    Math.round(monto),
  );
}

/**
 * Los montos en CLP siempre son enteros. Cualquier descuento o prorrateo
 * pasa por acá antes de guardarse o mostrarse.
 */
export function redondearCLP(monto: number): number {
  return Math.round(monto);
}

/** 0.15 → "15%" */
export function formatearPorcentaje(fraccion: number, decimales = 0): string {
  return `${(fraccion * 100).toFixed(decimales).replace(".", ",")}%`;
}
