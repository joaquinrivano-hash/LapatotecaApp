/**
 * Estado del cliente.
 *
 * "Cliente activo" habilita el -20% de spa y paseos sueltos: es tener un plan
 * vigente con saldo, o haber venido en los últimos 30 días.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { planesVigentes } from "@/lib/rules/planes";
import { diasEntre } from "@/lib/utils/fecha";
import type { FechaISO, PlanComprado } from "@/lib/types";

export interface EntradaClienteActivo {
  planes: PlanComprado[];
  /** Fecha de la última estadía (hotel o jardín) del cliente. */
  ultimaEstadia?: FechaISO;
  fecha: FechaISO;
}

export function esClienteActivo({
  planes,
  ultimaEstadia,
  fecha,
}: EntradaClienteActivo): boolean {
  if (planesVigentes(planes, fecha).length > 0) return true;

  if (ultimaEstadia) {
    const dias = diasEntre(ultimaEstadia, fecha);
    if (dias >= 0 && dias <= NEGOCIO.clienteActivo.diasDesdeUltimaEstadia) {
      return true;
    }
  }

  return false;
}
