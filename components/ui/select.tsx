"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un `<select>` nativo, no uno dibujado.
 *
 * En el celular el nativo abre la rueda del sistema, que es más rápida de usar
 * con una mano y accesible gratis. Una lista de veinte razas en chips no cabe,
 * y una lista desplegable hecha a mano se pelea con el teclado de iOS.
 */
export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "border-input bg-background flex h-11 w-full appearance-none rounded-xl border px-3 py-2 pr-9 text-base",
          "focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none",
          "aria-invalid:border-destructive disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}
