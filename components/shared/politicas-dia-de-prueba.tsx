"use client";

/**
 * Las condiciones del día de prueba, antes de pagar.
 *
 * Van a la vista y no detrás de un enlace: son las dos frases que definen qué
 * pasa si el dueño se complica, y enterarse después de pagar es la manera
 * segura de que se sienta una letra chica.
 */

import { CalendarX, CreditCard, Landmark } from "lucide-react";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { formatearCLP } from "@/lib/utils/moneda";

export function PoliticasDelDiaDePrueba() {
  const horas = NEGOCIO.diaDePrueba.horasParaCancelarSinCosto;
  const { titular, rut, banco, tipoDeCuenta, numero, email } =
    NEGOCIO.transferencia;
  const hayDatos = titular !== "" && numero !== "";

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
            <strong>Con menos de {horas} horas:</strong> se cobra{" "}
            {formatearCLP(PRECIOS.cancelacionTardiaDiaDePrueba)}. Puedes cambiar
            la fecha, pero no hay devolución: ese cupo ya no alcanza a tomarlo
            otro perrito.
          </span>
        </li>
      </ul>

      <div className="bg-secondary/50 space-y-1 rounded-xl p-3 text-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <CreditCard className="size-4" />
          Cómo se paga
        </h3>
        {hayDatos ? (
          <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-2 text-xs">
            <dt className="font-semibold">Titular</dt>
            <dd>{titular}</dd>
            {rut && (
              <>
                <dt className="font-semibold">RUT</dt>
                <dd>{rut}</dd>
              </>
            )}
            <dt className="font-semibold">Banco</dt>
            <dd>
              {banco}
              {tipoDeCuenta && ` · ${tipoDeCuenta}`}
            </dd>
            <dt className="font-semibold">Cuenta</dt>
            <dd>{numero}</dd>
            {email && (
              <>
                <dt className="font-semibold">Aviso</dt>
                <dd>{email}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground flex items-start gap-2 text-xs text-pretty">
            <Landmark className="mt-0.5 size-3.5 shrink-0" />
            Al agendar te dejamos el cobro pendiente en tu cuenta y te
            escribimos por WhatsApp con los datos para transferir.
          </p>
        )}
      </div>
    </section>
  );
}
