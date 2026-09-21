"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatearDiaMes, formatearDiaMesCorto } from "@/lib/utils/fecha";
import type { MetricasDia } from "@/lib/servicios/panel";

/**
 * Ocupación día a día contra el tope de 25.
 *
 * Cada barra es el PICO simultáneo de ese día, no los perros que pasaron. La
 * línea de capacidad va dibujada porque es contra ella que se lee todo: una
 * barra al 60% no significa nada sin saber dónde está el techo.
 */
export function OcupacionDiaria({
  dias,
  capacidad,
  className,
}: {
  dias: MetricasDia[];
  capacidad: number;
  className?: string;
}) {
  const [activo, setActivo] = React.useState<number | null>(null);

  if (dias.length === 0) return null;

  const diaActivo = activo !== null ? dias[activo] : null;
  const techo = Math.max(capacidad, ...dias.map((d) => d.pico));
  const porcentaje = (n: number) => `${(n / techo) * 100}%`;
  const posicion = (i: number) => `${((i + 0.5) / dias.length) * 100}%`;

  const paso = Math.max(1, Math.round(dias.length / 5));
  const etiquetas = dias
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % paso === 0);

  return (
    <div className={cn("space-y-3", className)}>
      <Leyenda />

      <div>
        <div className="relative h-7">
          {diaActivo && (
            <div className="bg-foreground text-background absolute top-0 left-1/2 z-20 -translate-x-1/2 rounded-xl px-3 py-1 text-xs font-semibold whitespace-nowrap shadow-lg">
              <span className="first-letter:uppercase">
                {formatearDiaMes(`${diaActivo.fecha}T12:00:00Z`)}
              </span>{" "}
              · {diaActivo.pico} de {capacidad}
              <span className="font-normal opacity-80">
                {" "}
                ({diaActivo.perrosJardin} jardín · {diaActivo.perrosHotel} hotel)
              </span>
            </div>
          )}
        </div>

        <div
          className="relative h-40"
          role="img"
          aria-label={`Ocupación diaria entre el ${dias[0].fecha} y el ${dias.at(-1)!.fecha}, sobre una capacidad de ${capacidad} perros simultáneos.`}
          onPointerLeave={() => setActivo(null)}
        >
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-1"
            style={{ bottom: porcentaje(capacidad) }}
          >
            <span className="text-muted-foreground bg-card shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums">
              {capacidad}
            </span>
            <div className="border-muted-foreground/35 w-full border-t border-dashed" />
          </div>

          <div className="absolute inset-0 flex items-end gap-px">
            {dias.map((dia, i) => (
              <button
                key={dia.fecha}
                type="button"
                className="group relative flex h-full flex-1 cursor-default flex-col justify-end outline-none"
                onPointerEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                onClick={() => setActivo(i)}
                aria-label={`${dia.fecha}: ${dia.pico} perros`}
              >
                <div
                  className={cn(
                    "flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t transition-opacity",
                    activo !== null && activo !== i && "opacity-45",
                  )}
                  style={{ height: porcentaje(dia.pico) }}
                >
                  {dia.perrosHotel > 0 && (
                    <div
                      className="bg-hotel w-full shrink-0 rounded-t-[2px]"
                      // Contra la BARRA, no contra el techo de la escala: la
                      // barra ya está escalada y dividir dos veces achica el
                      // hotel.
                      style={{
                        height: `${(dia.perrosHotel / dia.pico) * 100}%`,
                      }}
                    />
                  )}
                  {dia.perrosJardin > 0 && (
                    <div
                      className="bg-jardin w-full flex-1 rounded-t"
                      style={{ minHeight: 2 }}
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="text-muted-foreground relative mt-1 h-4 text-[10px] font-medium">
          {etiquetas.map(({ d, i }) => (
            <span
              key={d.fecha}
              className="absolute -translate-x-1/2"
              style={{ left: posicion(i) }}
            >
              {formatearDiaMesCorto(`${d.fecha}T12:00:00Z`)}
            </span>
          ))}
        </div>
      </div>
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
