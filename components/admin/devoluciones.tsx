"use client";

import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrecioCLP } from "@/components/shared/precio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { etiquetaConcepto } from "@/lib/rules/cobro-mensual";
import {
  devolucionesPorTransferir,
  marcarDevolucionTransferida,
} from "@/lib/servicios/cobros-pendientes";
import { formatearFechaCorta } from "@/lib/utils/fecha";

/**
 * La plata que tiene que salir de la casa.
 *
 * Va en su propia tarjeta y no mezclada con los cobros pendientes porque es
 * al revés: ahí entra plata, acá sale. Juntarlas en una lista con un botón
 * "Listo" en cada fila haría fácil confundir cobrarle a alguien con
 * devolverle.
 *
 * Al cancelar le prometemos al dueño una transferencia. Una promesa que no
 * aparece en ninguna pantalla es una promesa que no se cumple.
 */
export function Devoluciones() {
  const { ocupado, ejecutar } = useAccion();
  const pendientes = useConsulta((repo) => devolucionesPorTransferir(repo));

  const lista = pendientes.datos ?? [];
  if (lista.length === 0) return null;

  const total = lista.reduce((suma, d) => suma + d.pago.monto, 0);

  return (
    <Card className="border-accent/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="size-5" />
          Por devolver
          <span className="bg-accent text-foreground ml-auto rounded-full px-2.5 py-0.5 text-sm font-bold">
            <PrecioCLP monto={total} />
          </span>
        </CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          Cancelaciones dentro de plazo de algo que el dueño ya había pagado.
          Le dijimos que le transferimos.
        </p>
      </CardHeader>

      <CardContent className="space-y-2">
        {lista.map(({ pago, cliente, cuenta }) => (
          <div
            key={pago.id}
            className="bg-secondary/40 grid grid-cols-1 gap-2 rounded-xl p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {cliente.nombre} {cliente.apellido}
              </p>
              <p className="text-muted-foreground text-xs">
                {etiquetaConcepto(pago.concepto)} ·{" "}
                {formatearFechaCorta(pago.emitidoEn)}
              </p>
            </div>

            {cuenta ? (
              // Los datos van completos y a la vista: quien transfiere los
              // copia de acá, no los anda buscando en otra pantalla.
              <dl className="bg-card grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg p-2.5 text-xs sm:grid-cols-2">
                <Dato etiqueta="Titular" valor={cuenta.titular} />
                <Dato etiqueta="RUT" valor={cuenta.rut} />
                <Dato etiqueta="Banco" valor={cuenta.banco} />
                <Dato etiqueta="Tipo" valor={cuenta.tipoDeCuenta} />
                <div className="sm:col-span-2">
                  <Dato etiqueta="Cuenta" valor={cuenta.numero} />
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-xs text-pretty">
                No dejó datos de cuenta. Hay que escribirle para pedírselos.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <PrecioCLP monto={pago.monto} className="mr-1 font-bold" />
              <Button
                size="sm"
                disabled={ocupado}
                onClick={async () => {
                  await ejecutar((repo) =>
                    marcarDevolucionTransferida(repo, pago.id),
                  );
                  toast.success(`Devolución a ${cliente.nombre} registrada`);
                }}
              >
                <Check /> Ya la transferí
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground shrink-0">{etiqueta}:</dt>
      <dd className="min-w-0 truncate font-medium">{valor || "—"}</dd>
    </div>
  );
}
