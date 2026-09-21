/**
 * Planes de jardín (packs de días).
 *
 * Los días NO son acumulables: comprar un pack nuevo cierra el que estaba
 * vigente, con los días que le quedaran. Y los packs vencen: 15 días el de 5,
 * 45 días el de 20.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { construirCotizacion } from "@/lib/rules/descuentos";
import { diasEntre, fechaISO, sumarDias } from "@/lib/utils/fecha";
import type {
  Cotizacion,
  FechaISO,
  ID,
  InstanteISO,
  PlanComprado,
  TipoPlan,
} from "@/lib/types";

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
 * De los planes vigentes del perro, usa primero el que vence antes: si no, el
 * cliente pierde días que ya pagó.
 */
export function elegirPlanParaUsar(
  planes: PlanComprado[],
  perroId: ID,
  fecha: FechaISO,
): PlanComprado | null {
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

/** Días pagados que se perdieron por vencimiento. Sirve para el backoffice. */
export function diasPerdidos(plan: PlanComprado, fecha: FechaISO): number {
  const vencido = diasEntre(fecha, plan.venceEn) < 0;
  return vencido || plan.cerradoEn ? saldoPlan(plan) : 0;
}

export function vigenciaDePlan(tipo: TipoPlan): number {
  return NEGOCIO.planes.vigenciaDias[tipo];
}

export interface CompraDePlan {
  plan: PlanComprado;
  /** Planes del mismo perro que quedaron cerrados por la compra. */
  cerrados: PlanComprado[];
  cotizacion: Cotizacion;
}

export function crearPlanComprado(args: {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
  compradoEn: InstanteISO;
  suscripcionId?: ID;
}): PlanComprado {
  const config = PRECIOS.planes[args.tipo];
  const fechaCompra = fechaISO(args.compradoEn);

  return {
    id: args.id,
    clienteId: args.clienteId,
    perroId: args.perroId,
    tipo: args.tipo,
    diasTotales: config.dias,
    diasUsados: 0,
    compradoEn: args.compradoEn,
    venceEn: sumarDias(fechaCompra, vigenciaDePlan(args.tipo)),
    precio: config.precio,
    suscripcionId: args.suscripcionId,
  };
}

/**
 * Compra un pack y cierra los anteriores del mismo perro. Devuelve también los
 * cerrados para que quien llame persista el cambio: si no, quedan dos packs
 * vigentes y los días sí se acumularían.
 */
export function comprarPlan(args: {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
  compradoEn: InstanteISO;
  planesActuales: PlanComprado[];
  suscripcionId?: ID;
}): CompraDePlan {
  const plan = crearPlanComprado(args);
  const fecha = fechaISO(args.compradoEn);

  const cerrados = args.planesActuales
    .filter((p) => p.perroId === args.perroId && planVigente(p, fecha))
    .map((p) => ({ ...p, cerradoEn: args.compradoEn }));

  const config = PRECIOS.planes[args.tipo];
  const cotizacion = construirCotizacion([
    {
      concepto: config.nombre,
      detalle: `${config.dias} días, vence el ${plan.venceEn}`,
      monto: config.precio,
    },
  ]);

  return { plan, cerrados, cotizacion };
}
