import { cn } from "@/lib/utils";

/**
 * Número protagonista. Sin gráfico adentro a propósito: cuando el dato es un
 * solo valor, el gráfico estorba.
 */
export function Tile({
  etiqueta,
  valor,
  detalle,
  acento = "neutro",
  icono: Icono,
  className,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  acento?: "neutro" | "hotel" | "jardin" | "alerta";
  icono?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const acentos = {
    neutro: "text-foreground",
    hotel: "text-hotel",
    jardin: "text-jardin",
    alerta: "text-warning",
  };

  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-0.5 rounded-2xl border border-border/70 p-4 shadow-sm",
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        {Icono && <Icono className="size-3.5" />}
        {etiqueta}
      </div>
      <div
        className={cn(
          "font-display text-3xl leading-none font-bold tabular-nums",
          acentos[acento],
        )}
      >
        {valor}
      </div>
      {detalle && (
        <div className="text-muted-foreground text-sm">{detalle}</div>
      )}
    </div>
  );
}
