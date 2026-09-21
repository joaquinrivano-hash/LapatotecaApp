import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Fondos cálidos para los perros sin foto. Siempre el mismo por perro. */
const FONDOS = [
  "bg-[#f7d9c4] text-[#8a4a24]",
  "bg-[#e9f3e5] text-[#3d6b33]",
  "bg-[#e6eefa] text-[#27508c]",
  "bg-[#fbe8c8] text-[#8a6420]",
  "bg-[#f2e2ef] text-[#7a4a70]",
  "bg-[#dff0ee] text-[#2c6460]",
];

function fondoDe(semilla: string): string {
  let suma = 0;
  for (const caracter of semilla) suma += caracter.charCodeAt(0);
  return FONDOS[suma % FONDOS.length];
}

const TAMANOS = {
  sm: "size-9 text-sm",
  base: "size-12 text-base",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
};

export function PerroAvatar({
  nombre,
  fotoUrl,
  id,
  tamano = "base",
  className,
}: {
  nombre: string;
  fotoUrl?: string;
  id?: string;
  tamano?: keyof typeof TAMANOS;
  className?: string;
}) {
  return (
    <Avatar className={cn(TAMANOS[tamano], className)}>
      {fotoUrl && <AvatarImage src={fotoUrl} alt={nombre} />}
      <AvatarFallback className={fondoDe(id ?? nombre)}>
        {nombre.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
