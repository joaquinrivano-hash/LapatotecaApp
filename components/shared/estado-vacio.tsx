import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nunca un "No data" pelado: siempre una frase que explique qué pasa. */
export function EstadoVacio({
  titulo,
  descripcion,
  icono: Icono = PawPrint,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  icono?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="rounded-full bg-secondary p-4">
        <Icono className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-bold">{titulo}</p>
        {descripcion && (
          <p className="text-muted-foreground mx-auto max-w-xs text-sm text-pretty">
            {descripcion}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
