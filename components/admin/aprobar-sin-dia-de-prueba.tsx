"use client";

import { toast } from "sonner";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  aprobarSinDiaDePrueba,
  previaDeAprobarSinDiaDePrueba,
} from "@/lib/servicios/evaluacion";
import { describirDia, formatearHora } from "@/lib/utils/fecha";
import { formatearCLP } from "@/lib/utils/moneda";
import type { Perro } from "@/lib/types";

/**
 * "Ya era cliente": aprobar el día de prueba sin que venga.
 *
 * Es para el cliente que viene hace años y entra a la app por primera vez.
 * Antes de confirmar dice qué va a pasar, porque no siempre es solo aprobar:
 * si alcanzó a agendar su día de prueba, se cancela, y si ya lo había
 * pagado, queda plata por devolverle. Enterarse de eso después, en Pagos,
 * es enterarse tarde.
 *
 * Solo el panel: el botón que lo abre lo pone cada pantalla, porque en una
 * fila del tablero y en la ficha del cliente no cabe el mismo botón.
 */
export function AprobarSinDiaDePrueba({
  perro,
  hoy,
  onCerrar,
}: {
  perro: Perro;
  hoy: string;
  onCerrar: () => void;
}) {
  const { ocupado, ejecutar } = useAccion();
  const previa = useConsulta(
    (repo) => previaDeAprobarSinDiaDePrueba(repo, perro.id),
    [perro.id],
  );

  async function aprobar() {
    try {
      const { aDevolver } = await ejecutar((repo) =>
        aprobarSinDiaDePrueba(repo, perro.id),
      );
      onCerrar();
      toast.success(
        `${perro.nombre} quedó ${perro.sexo === "hembra" ? "aprobada" : "aprobado"}`,
        {
          description:
            aDevolver > 0
              ? `Ya puede reservar. Quedan ${formatearCLP(aDevolver)} por devolverle, en Pagos.`
              : "Ya puede reservar jardín y hotel.",
        },
      );
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos aprobarlo.",
      );
    }
  }

  const estadia = previa.datos?.estadia;
  const aDevolver = previa.datos?.aDevolver ?? 0;

  return (
    <div className="bg-background space-y-3 rounded-xl border border-border/70 p-3 text-sm">
      <p className="font-semibold text-pretty">
        ¿Aprobar a {perro.nombre} sin día de prueba?
      </p>

      {previa.cargando ? (
        <Skeleton className="h-10 w-full" />
      ) : previa.error ? (
        <p className="text-destructive text-pretty">{previa.error}</p>
      ) : (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-pretty">
          <li>No se le cobra nada y ya puede reservar jardín y hotel.</li>
          {estadia && (
            <li>
              Se cancela el día de prueba que tenía agendado para{" "}
              {describirDia(estadia.fecha, hoy)} a las{" "}
              {formatearHora(estadia.inicioProgramado)}, sin costo.
            </li>
          )}
          {aDevolver > 0 && (
            <li className="text-foreground font-medium">
              Ya lo había pagado: quedan {formatearCLP(aDevolver)} por
              devolverle, en Pagos.
            </li>
          )}
        </ul>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={ocupado || previa.cargando || Boolean(previa.error)}
          onClick={aprobar}
        >
          <Check />
          Aprobar
        </Button>
        <Button variant="ghost" disabled={ocupado} onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
