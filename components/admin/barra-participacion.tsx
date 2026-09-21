import { cn } from "@/lib/utils";

/**
 * Medidor de una sola magnitud.
 *
 * No es un gráfico categórico: cada fila se identifica por su etiqueta, no por
 * su color. Por eso todas las barras van del mismo tono, y el color no carga
 * ninguna información que el texto no diga ya.
 */
export function BarraParticipacion({
  etiqueta,
  valor,
  fraccion,
  tono = "neutro",
  className,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  /** Entre 0 y 1. */
  fraccion: number;
  tono?: "neutro" | "hotel" | "jardin";
  className?: string;
}) {
  const tonos = {
    neutro: "bg-muted-foreground/55",
    hotel: "bg-hotel",
    jardin: "bg-jardin",
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{etiqueta}</span>
        <span className="text-sm tabular-nums">{valor}</span>
      </div>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={Math.round(fraccion * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta}
      >
        <div
          className={cn("h-full rounded-full transition-all", tonos[tono])}
          style={{ width: `${Math.min(100, Math.max(0, fraccion * 100))}%` }}
        />
      </div>
    </div>
  );
}
