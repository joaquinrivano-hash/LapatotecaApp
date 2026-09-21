import { cn } from "@/lib/utils";
import { formatearCLP } from "@/lib/utils/moneda";

/**
 * Único lugar donde se pinta un monto. Nunca escribas "$" a mano en una
 * pantalla: el formato chileno (punto de miles, sin decimales, signo afuera)
 * vive acá.
 */
export function PrecioCLP({
  monto,
  className,
  tamano = "base",
}: {
  monto: number;
  className?: string;
  tamano?: "sm" | "base" | "lg" | "xl";
}) {
  const tamanos = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "font-display text-3xl",
  };

  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        tamanos[tamano],
        monto < 0 && "text-success",
        className,
      )}
    >
      {formatearCLP(monto)}
    </span>
  );
}
