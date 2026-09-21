"use client";

import * as React from "react";
import { TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hhmmDesdeMinutos } from "@/lib/utils/fecha";
import type { OcupacionDia } from "@/lib/types";

/**
 * Ocupación franja por franja, con hotel y jardín apilados.
 *
 * Lo que importa de este gráfico es que el cupo de 25 se mide contra el PICO
 * de las franjas, no contra la cantidad de perros del día. Por eso la línea de
 * capacidad está dibujada y el pico va etiquetado: son los dos números que el
 * staff necesita leer de una mirada.
 */
export function OcupacionFranjas({
  ocupacion,
  capacidad,
  desdeMinuto = 6 * 60,
  hastaMinuto = 21 * 60,
  className,
}: {
  ocupacion: OcupacionDia;
  capacidad: number;
  desdeMinuto?: number;
  hastaMinuto?: number;
  className?: string;
}) {
  const [activo, setActivo] = React.useState<number | null>(null);
  const [verTabla, setVerTabla] = React.useState(false);

  const slots = ocupacion.slots.filter(
    (s) => s.minutoDelDia >= desdeMinuto && s.minutoDelDia < hastaMinuto,
  );

  if (slots.length === 0) return null;

  const slotActivo = activo !== null ? slots[activo] : null;
  // El eje llega al tope de capacidad salvo que ya estemos por encima.
  const techo = Math.max(capacidad, ocupacion.pico);
  const alto = (n: number) => `${(n / techo) * 100}%`;

  const horasEtiquetadas = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.minutoDelDia % 180 === 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <Leyenda />
        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors"
        >
          <TableIcon className="size-3.5" />
          {verTabla ? "Ver gráfico" : "Ver horas"}
        </button>
      </div>

      {verTabla ? (
        <TablaFranjas slots={slots} />
      ) : (
        <div className="relative">
          {/* Línea de capacidad: el tope que no se puede pasar. */}
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
            style={{ bottom: `calc(${alto(capacidad)} + 1.25rem)` }}
          >
            <div className="border-muted-foreground/35 w-full border-t border-dashed" />
            <span className="text-muted-foreground bg-card ml-1 shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums">
              {capacidad}
            </span>
          </div>

          {slotActivo && (
            <div className="bg-foreground text-background pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-lg">
              {hhmmDesdeMinutos(slotActivo.minutoDelDia)} · {slotActivo.total}{" "}
              {slotActivo.total === 1 ? "perro" : "perros"}
              <span className="font-normal opacity-80">
                {" "}
                ({slotActivo.hotel} hotel · {slotActivo.jardin} jardín)
              </span>
            </div>
          )}

          <div
            className="flex h-36 items-end gap-px pt-6"
            role="img"
            aria-label={`Ocupación del día. Pico de ${ocupacion.pico} perros simultáneos a las ${hhmmDesdeMinutos(ocupacion.picoMinutoDelDia)}, sobre una capacidad de ${capacidad}.`}
            onPointerLeave={() => setActivo(null)}
          >
            {slots.map((slot, i) => {
              const esPico =
                slot.minutoDelDia === ocupacion.picoMinutoDelDia &&
                ocupacion.pico > 0;

              return (
                <button
                  key={slot.minutoDelDia}
                  type="button"
                  // El área táctil es toda la columna, mucho más ancha que la barra.
                  className="group relative flex h-full flex-1 cursor-default flex-col justify-end outline-none"
                  onPointerEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onClick={() => setActivo(i)}
                  aria-label={`${hhmmDesdeMinutos(slot.minutoDelDia)}: ${slot.total} perros`}
                >
                  <div
                    className={cn(
                      "flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t transition-opacity",
                      activo !== null && activo !== i && "opacity-45",
                    )}
                    style={{ height: alto(slot.total) }}
                  >
                    {slot.hotel > 0 && (
                      <div
                        className="bg-hotel w-full shrink-0 rounded-t-[2px]"
                        style={{ height: alto(slot.hotel) }}
                      />
                    )}
                    {slot.jardin > 0 && (
                      <div
                        className="bg-jardin w-full flex-1 rounded-t"
                        style={{ minHeight: 2 }}
                      />
                    )}
                  </div>
                  {esPico && (
                    <span className="text-muted-foreground absolute -top-0.5 left-1/2 -translate-x-1/2 text-[10px] font-bold tabular-nums">
                      {ocupacion.pico}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-muted-foreground relative mt-1 h-4 text-[10px] font-medium tabular-nums">
            {horasEtiquetadas.map(({ s, i }) => (
              <span
                key={s.minutoDelDia}
                className="absolute -translate-x-1/2"
                style={{ left: `${((i + 0.5) / slots.length) * 100}%` }}
              >
                {hhmmDesdeMinutos(s.minutoDelDia)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs font-semibold">
      <span className="flex items-center gap-1.5">
        <span className="bg-jardin size-2.5 rounded-sm" />
        Jardín
      </span>
      <span className="flex items-center gap-1.5">
        <span className="bg-hotel size-2.5 rounded-sm" />
        Hotel
      </span>
    </div>
  );
}

/** Vista de datos para quien no puede o no quiere leer el gráfico. */
function TablaFranjas({ slots }: { slots: OcupacionDia["slots"] }) {
  const conPerros = slots.filter((s) => s.total > 0);

  if (conPerros.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No hay perros en todo el día.
      </p>
    );
  }

  return (
    <div className="max-h-36 overflow-y-auto rounded-xl border border-border/70">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-secondary/60 text-muted-foreground sticky top-0 text-xs">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">Hora</th>
            <th className="px-3 py-1.5 text-right font-semibold">Jardín</th>
            <th className="px-3 py-1.5 text-right font-semibold">Hotel</th>
            <th className="px-3 py-1.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {conPerros.map((s) => (
            <tr key={s.minutoDelDia} className="border-t border-border/50">
              <td className="px-3 py-1.5">
                {hhmmDesdeMinutos(s.minutoDelDia)}
              </td>
              <td className="px-3 py-1.5 text-right">{s.jardin}</td>
              <td className="px-3 py-1.5 text-right">{s.hotel}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
