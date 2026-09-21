/**
 * La cuenta del día 1.
 *
 * Cada día 1 se emite UN solo documento por cliente que junta dos cosas:
 *   1. la renovación de las suscripciones activas (se recarga el pack y se cobra)
 *   2. el consolidado de los consumos sueltos del mes anterior
 *
 * Los packs comprados de una vez se pagan al comprarlos y no entran acá.
 */

import { nombreDePlan, precioDePlan } from "@/lib/rules/planes";
import { fechaISO, instanteEn, mesISO } from "@/lib/utils/fecha";
import { redondearCLP } from "@/lib/utils/moneda";
import type {
  ConceptoPago,
  CuentaMensual,
  FechaISO,
  ID,
  LineaCotizacion,
  Pago,
  Suscripcion,
} from "@/lib/types";

/** "2026-08" → "2026-09" */
export function mesSiguiente(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 12
    ? `${a + 1}-01`
    : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** "2026-08" → "2026-07" */
export function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1
    ? `${a - 1}-12`
    : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** "2026-09" → "2026-09-01" */
export function primerDiaDelMes(periodo: string): FechaISO {
  return `${periodo}-01`;
}

const ETIQUETA_CONCEPTO: Record<ConceptoPago, string> = {
  dia_de_prueba: "Día de prueba",
  abono_hotel: "Abono de hotel",
  saldo_hotel: "Saldo de hotel",
  dia_suelto: "Jardín día suelto",
  plan: "Plan de jardín",
  servicio: "Servicio",
  tienda: "Compra en tienda",
  cuenta_mensual: "Cuenta mensual",
};

export function etiquetaConcepto(concepto: ConceptoPago): string {
  return ETIQUETA_CONCEPTO[concepto];
}

/** Cobros sueltos emitidos dentro del periodo y todavía impagos. */
export function consumosDelPeriodo(pagos: Pago[], periodo: string): Pago[] {
  return pagos.filter(
    (p) =>
      p.concepto !== "cuenta_mensual" &&
      (p.estado === "pendiente" || p.estado === "vencido") &&
      mesISO(p.emitidoEn) === periodo,
  );
}

/** Suscripciones que toca cobrar en esta emisión. */
export function suscripcionesACobrar(
  suscripciones: Suscripcion[],
  fechaEmision: FechaISO,
): Suscripcion[] {
  return suscripciones.filter(
    (s) => s.estado === "activa" && s.proximoCobro <= fechaEmision,
  );
}

export interface EntradaCuentaMensual {
  id: ID;
  clienteId: ID;
  /** Mes consumido. La cuenta se emite el día 1 del mes siguiente. */
  periodo: string;
  suscripciones: Suscripcion[];
  pagosPendientes: Pago[];
  /** Para que la línea diga de qué perro es la renovación. */
  nombrePerro?: (perroId: ID) => string | undefined;
}

export function generarCuentaMensual(
  entrada: EntradaCuentaMensual,
): CuentaMensual {
  const periodoEmision = mesSiguiente(entrada.periodo);
  const fechaEmision = primerDiaDelMes(periodoEmision);
  const emitidaEn = instanteEn(fechaEmision, 0);

  const renovaciones: LineaCotizacion[] = suscripcionesACobrar(
    entrada.suscripciones,
    fechaEmision,
  )
    .filter((s) => s.clienteId === entrada.clienteId)
    .map((s) => {
      const perro = entrada.nombrePerro?.(s.perroId);
      const dias = s.diasContratados ?? 0;
      return {
        concepto: `Renovación ${nombreDePlan({ tipo: s.tipo, diasTotales: dias })}`,
        detalle: perro ? `Para ${perro}` : undefined,
        monto: precioDePlan(s.tipo, dias),
      };
    });

  const consumos: LineaCotizacion[] = consumosDelPeriodo(
    entrada.pagosPendientes.filter((p) => p.clienteId === entrada.clienteId),
    entrada.periodo,
  ).map((p) => ({
    concepto: etiquetaConcepto(p.concepto),
    detalle: fechaISO(p.emitidoEn),
    monto: p.monto,
  }));

  const total = redondearCLP(
    [...renovaciones, ...consumos].reduce((s, l) => s + l.monto, 0),
  );

  return {
    id: entrada.id,
    clienteId: entrada.clienteId,
    periodo: entrada.periodo,
    emitidaEn,
    renovaciones,
    consumos,
    total,
    estado: "pendiente",
  };
}
