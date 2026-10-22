"use client";

/**
 * Las condiciones del día de prueba, antes de pagar.
 *
 * Van a la vista y no detrás de un enlace: son las dos frases que definen qué
 * pasa si el dueño se complica, y enterarse después de pagar es la manera
 * segura de que se sienta una letra chica.
 */

import { CalendarX, CreditCard } from "lucide-react";
import { DatosTransferencia } from "@/components/shared/datos-transferencia";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { formatearCLP } from "@/lib/utils/moneda";

export function PoliticasDelDiaDePrueba() {
  const horas = NEGOCIO.diaDePrueba.horasParaCancelarSinCosto;

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarX className="size-4" />
        Si tienes que cambiarlo o cancelar
      </h2>

      <ul className="space-y-2 text-sm">
        <li className="flex gap-2">
          <span aria-hidden className="text-success font-bold">
            ·
          </span>
          <span className="text-pretty">
            <strong>Con {horas} horas o más de anticipación:</strong> te
            devolvemos el pago completo, o cambias la fecha sin costo.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-warning font-bold">
            ·
          </span>
          <span className="text-pretty">
            <strong>Con menos de {horas} horas:</strong> cancelar o cambiar la
            fecha cuesta{" "}
            {formatearCLP(PRECIOS.cancelacionTardiaDiaDePrueba)}, porque ese
            cupo ya no alcanza a tomarlo otro perrito. Si cancelas y ya habías
            pagado, te devolvemos el resto.
          </span>
        </li>
      </ul>

      <div className="bg-secondary/50 space-y-1 rounded-xl p-3 text-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <CreditCard className="size-4" />
          Cómo se paga
        </h3>
        <DatosTransferencia />
      </div>
    </section>
  );
}
