"use client";

/**
 * Un campo de contraseña con el ojo para verla.
 *
 * En el celular se escribe con el pulgar y sin ver las letras, y una
 * contraseña mal tecleada se descubre recién cuando el login la rechaza.
 * Mostrarla es decisión de quien escribe: parte oculta, por si hay alguien
 * mirando.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function InputClave({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Sin esto, el teclado corrige y pone mayúscula a la contraseña
        // apenas se ve como texto.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/25 absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg outline-none focus-visible:ring-[3px]"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
