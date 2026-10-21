"use client";

import { useState } from "react";
import {
  enlaceWhatsapp,
  useWhatsappDeLaCasa,
} from "@/components/shared/contacto-casa";
import { DatosTransferencia } from "@/components/shared/datos-transferencia";

/**
 * Cómo se paga, mientras no haya pasarela.
 *
 * "Transferencia" abre los datos ahí mismo: mandar al dueño a buscarlos a
 * otra parte es la manera de que el cobro quede para después. Y el link de
 * pago y el aviso van por WhatsApp, porque es por donde la casa los atiende.
 */
export function ComoPagar() {
  const [verDatos, setVerDatos] = useState(false);
  const { numero } = useWhatsappDeLaCasa();

  const escribenos = (texto: string, mensaje: string) =>
    numero ? (
      <a
        href={enlaceWhatsapp(numero, mensaje)}
        target="_blank"
        rel="noreferrer"
        className="text-primary font-semibold underline underline-offset-2"
      >
        {texto}
      </a>
    ) : (
      texto
    );

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs text-pretty">
        Los cobros se pagan por{" "}
        <button
          type="button"
          aria-expanded={verDatos}
          onClick={() => setVerDatos((v) => !v)}
          className="text-primary font-semibold underline underline-offset-2"
        >
          transferencia
        </button>{" "}
        o{" "}
        {escribenos(
          "escríbenos",
          "Hola, quiero pagar un cobro de La Patoteca. ¿Me mandan un link de pago?",
        )}{" "}
        para solicitar un link de pago. Cuando lo hayas hecho,{" "}
        {escribenos(
          "avísanos",
          "Hola, ya hice el pago de mi cobro en La Patoteca.",
        )}{" "}
        para confirmar tu reserva.
      </p>
      {verDatos && (
        <div className="bg-secondary/50 rounded-xl p-3">
          <DatosTransferencia />
        </div>
      )}
    </div>
  );
}
