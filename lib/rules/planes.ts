/**
 * Planes de jardín.
 *
 * Son MENSUALES y se pagan por adelantado: valen hasta el último día del mes
 * en que se compran y los días no usados no pasan al mes siguiente. Se cobran
 * por día, y el precio por día baja según cuántos se contraten.
 *
 * Los días se usan de lunes a viernes.
 *
 * El pase libre se modela con `diasTotales` igual a los días hábiles que le
 * quedan al mes: es el máximo que se puede usar de verdad, y así el saldo, el
 * consumo y los avisos de vencimiento funcionan igual que en cualquier plan.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { construirCotizacion } from "@/lib/rules/descuentos";
import {
  diaDeSemana,
  diasEntre,
  fechaISO,
  rangoFechas,
  sumarDias,
} from "@/lib/utils/fecha";
import type {
  Cotizacion,
  FechaISO,
  ID,
  InstanteISO,
  PlanComprado,
  TipoPlan,
} from "@/lib/types";

/** "2026-06" → "2026-06-30" */
export function ultimoDiaDelMes(mes: string): FechaISO {
  const [a, m] = mes.split("-").map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return sumarDias(siguiente, -1);
}

export function esDiaHabil(fecha: FechaISO): boolean {
  const dia = diaDeSemana(fecha);
  return dia >= 1 && dia <= 5;
}

/** Días hábiles entre dos fechas, ambas incluidas. */
export function diasHabilesEntre(desde: FechaISO, hasta: FechaISO): number {
  if (diasEntre(desde, hasta) < 0) return 0;
  return rangoFechas(desde, hasta).filter(esDiaHabil).length;
}

/** Precio por día según el tramo en que cae la cantidad contratada. */
export function precioPorDia(dias: number): number {
  const tramos = PRECIOS.planes.tramosPorDia;
  const tramo =
    tramos.find(
      (t) => dias >= t.desdeDias && (t.hastaDias === null || dias <= t.hastaDias),
    ) ?? tramos.at(-1)!;
  return tramo.precioPorDia;
}

export function precioDePlan(tipo: TipoPlan, dias: number): number {
  return tipo === "pase_libre"
    ? PRECIOS.planes.paseLibre
    : dias * precioPorDia(dias);
}

export function nombreDePlan(plan: Pick<PlanComprado, "tipo" | "diasTotales">): string {
  return plan.tipo === "pase_libre"
    ? "Pase libre del mes"
    : `Plan de ${plan.diasTotales} días`;
}

export function saldoPlan(plan: PlanComprado): number {
  return Math.max(0, plan.diasTotales - plan.diasUsados);
}

export function planVigente(plan: PlanComprado, fecha: FechaISO): boolean {
  if (plan.cerradoEn) return false;
  if (saldoPlan(plan) <= 0) return false;
  return diasEntre(fecha, plan.venceEn) >= 0;
}

export function planesVigentes(
  planes: PlanComprado[],
  fecha: FechaISO,
): PlanComprado[] {
  return planes.filter((p) => planVigente(p, fecha));
}

/**
 * De los planes vigentes del perro, el que vence antes. En fin de semana no
 * hay ninguno usable: los días del plan son de lunes a viernes.
 */
export function elegirPlanParaUsar(
  planes: PlanComprado[],
  perroId: ID,
  fecha: FechaISO,
): PlanComprado | null {
  if (NEGOCIO.planes.soloDiasHabiles && !esDiaHabil(fecha)) return null;

  const candidatos = planesVigentes(planes, fecha)
    .filter((p) => p.perroId === perroId)
    .sort((a, b) => a.venceEn.localeCompare(b.venceEn));
  return candidatos[0] ?? null;
}

export function consumirDiaDePlan(plan: PlanComprado): PlanComprado {
  return { ...plan, diasUsados: Math.min(plan.diasTotales, plan.diasUsados + 1) };
}

export function devolverDiaAlPlan(plan: PlanComprado): PlanComprado {
  return { ...plan, diasUsados: Math.max(0, plan.diasUsados - 1) };
}

/** Días pagados que se perdieron porque venció el mes. */
export function diasPerdidos(plan: PlanComprado, fecha: FechaISO): number {
  const vencido = diasEntre(fecha, plan.venceEn) < 0;
  return vencido || plan.cerradoEn ? saldoPlan(plan) : 0;
}

export interface DatosNuevoPlan {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
  /** Días contratados. Se ignora en el pase libre. */
  dias?: number;
  compradoEn: InstanteISO;
  suscripcionId?: ID;
}

export function crearPlanComprado(args: DatosNuevoPlan): PlanComprado {
  const fechaCompra = fechaISO(args.compradoEn);
  const venceEn = ultimoDiaDelMes(fechaCompra.slice(0, 7));

  // El pase libre cubre los días hábiles que le quedan al mes: ese es el
  // máximo que el cliente puede aprovechar de verdad.
  const diasTotales =
    args.tipo === "pase_libre"
      ? diasHabilesEntre(fechaCompra, venceEn)
      : Math.max(NEGOCIO.planes.minimoDias, args.dias ?? NEGOCIO.planes.minimoDias);

  return {
    id: args.id,
    clienteId: args.clienteId,
    perroId: args.perroId,
    tipo: args.tipo,
    diasTotales,
    diasUsados: 0,
    compradoEn: args.compradoEn,
    venceEn,
    precio: precioDePlan(args.tipo, diasTotales),
    suscripcionId: args.suscripcionId,
  };
}

export interface CompraDePlan {
  plan: PlanComprado;
  /** Planes del mismo perro que quedaron cerrados por la compra. */
  cerrados: PlanComprado[];
  cotizacion: Cotizacion;
}

/**
 * Compra un plan y cierra los anteriores del mismo perro. Devuelve también los
 * cerrados para que quien llame persista el cambio: si no, quedan dos planes
 * vigentes y los días sí se acumularían.
 */
export function comprarPlan(
  args: DatosNuevoPlan & { planesActuales: PlanComprado[] },
): CompraDePlan {
  const plan = crearPlanComprado(args);
  const fecha = fechaISO(args.compradoEn);

  const cerrados = args.planesActuales
    .filter((p) => p.perroId === args.perroId && planVigente(p, fecha))
    .map((p) => ({ ...p, cerradoEn: args.compradoEn }));

  const cotizacion = construirCotizacion([
    {
      concepto: nombreDePlan(plan),
      detalle:
        plan.tipo === "pase_libre"
          ? `Todos los días hábiles hasta el ${plan.venceEn}`
          : `${plan.diasTotales} días a ${precioPorDia(plan.diasTotales).toLocaleString("es-CL")} c/u, hasta el ${plan.venceEn}`,
      monto: plan.precio,
    },
  ]);

  return { plan, cerrados, cotizacion };
}
