"use client";

import { toast } from "sonner";
import { Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrecioCLP } from "@/components/shared/precio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  cobrarPendiente,
  cobrosPendientesPorCliente,
  perdonarRecargo,
  type ClienteConPendientes,
  type Pendiente,
} from "@/lib/servicios/cobros-pendientes";
import { crearCanalMensajeria } from "@/lib/integraciones/mensajeria";
import { formatearFechaCorta } from "@/lib/utils/fecha";

/**
 * Lo que el turno del cuidador dejó esperando, agrupado por dueño.
 *
 * Por dueño y no por perro porque el cobro se le hace a una persona: dos
 * perros de la misma casa que salieron tarde el mismo día son UNA
 * conversación y una transferencia. Con las filas sueltas por perro, quien
 * cobra tiene que ir juntando mentalmente cuáles son del mismo dueño antes de
 * poder escribirle.
 *
 * Los dueños salen ordenados por lo que lleva más tiempo esperando, no por
 * monto: lo que se añeja es lo que se termina no cobrando.
 */
export function CobrosPendientes() {
  const { ocupado, ejecutar } = useAccion();

  const grupos = useConsulta((repo) => cobrosPendientesPorCliente(repo));
  const perros = useConsulta((repo) => repo.perros.listar());

  const lista = grupos.datos ?? [];
  // Nada esperando es el caso normal y no merece una tarjeta vacía ocupando
  // la pantalla todos los días.
  if (lista.length === 0) return null;

  const nombrePerro = (perroId: string) =>
    perros.datos?.find((p) => p.id === perroId)?.nombre ?? "El perro";
  const cobros = lista.reduce((n, g) => n + g.pendientes.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5" />
          Esperando tu decisión
          <span className="bg-primary text-primary-foreground ml-auto rounded-full px-2.5 py-0.5 text-sm font-bold">
            {cobros}
          </span>
        </CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          El equipo registra las salidas; cobrarlas es decisión tuya. El pack
          cubre el día, no que lo pasen a buscar tarde — pero si el dueño avisó,
          puedes perdonarlo.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {lista.slice(0, DUENOS_VISIBLES).map((grupo) => (
          <Dueno
            key={grupo.cliente.id}
            grupo={grupo}
            nombrePerro={nombrePerro}
            ocupado={ocupado}
            ejecutar={ejecutar}
          />
        ))}

        {lista.length > DUENOS_VISIBLES && (
          <p className="text-muted-foreground text-xs">
            Y {lista.length - DUENOS_VISIBLES} dueños más. Resuelve estos y
            aparecen los siguientes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cuántos dueños se muestran antes de resumir el resto. Un fin de semana
 * largo puede dejar quince, y quince bloques con botones no se leen: se
 * barren.
 */
const DUENOS_VISIBLES = 5;

const QUE_ES: Record<Pendiente["tipo"], (p: Pendiente) => string> = {
  recargo: (p) => `Retiro ${p.horas} h fuera de horario`,
  saldo_hotel: () => "Saldo de hotel",
  dia: () => "Día de jardín sin cobrar",
};

function Dueno({
  grupo,
  nombrePerro,
  ocupado,
  ejecutar,
}: {
  grupo: ClienteConPendientes;
  nombrePerro: (perroId: string) => string;
  ocupado: boolean;
  ejecutar: ReturnType<typeof useAccion>["ejecutar"];
}) {
  const { cliente, pendientes, total } = grupo;

  async function cobrarTodo() {
    for (const pendiente of pendientes) {
      await ejecutar((repo) => cobrarPendiente(repo, pendiente, new Date().toISOString(), crearCanalMensajeria()));
    }
    toast.success(`Cobrado a ${cliente.nombre}`, {
      description: `${pendientes.length} ${pendientes.length === 1 ? "cobro emitido" : "cobros emitidos"}.`,
    });
  }

  return (
    <section className="bg-secondary/40 rounded-xl p-3">
      {/* `grid-cols-1` explícito: sin él la columna implícita queda en
          max-content y el `truncate` del nombre desborda la tarjeta. */}
      <header className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {cliente.nombre} {cliente.apellido}
          </p>
          <p className="text-muted-foreground text-xs">
            {pendientes.length}{" "}
            {pendientes.length === 1 ? "cobro" : "cobros"} ·{" "}
            <PrecioCLP monto={total} className="font-semibold" />
          </p>
        </div>
        {pendientes.length > 1 && (
          <Button size="sm" disabled={ocupado} onClick={cobrarTodo}>
            <Check /> Cobrar todo
          </Button>
        )}
      </header>

      <ul className="divide-border/60 mt-2 divide-y border-t border-border/60">
        {pendientes.map((pendiente) => (
          <li
            key={`${pendiente.tipo}-${pendiente.referenciaId}`}
            className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">
                <span className="font-medium">
                  {nombrePerro(pendiente.perroId)}
                </span>{" "}
                · {QUE_ES[pendiente.tipo](pendiente)}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatearFechaCorta(pendiente.fecha)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PrecioCLP monto={pendiente.monto} className="mr-1 font-bold" />
              <Button
                size="sm"
                variant={pendientes.length > 1 ? "outline" : "default"}
                disabled={ocupado}
                onClick={async () => {
                  await ejecutar((repo) => cobrarPendiente(repo, pendiente, new Date().toISOString(), crearCanalMensajeria()));
                  toast.success("Cobro emitido");
                }}
              >
                <Check /> Cobrar
              </Button>
              {/* Perdonar es solo del recargo: un saldo de hotel o un día ya
                  usado no son una decisión, son una deuda. */}
              {pendiente.tipo === "recargo" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  onClick={async () => {
                    await ejecutar((repo) =>
                      perdonarRecargo(repo, pendiente.referenciaId),
                    );
                    toast("Recargo perdonado", {
                      description:
                        "Queda anotado en cero, para poder explicar el mes.",
                    });
                  }}
                >
                  <X /> Perdonar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
