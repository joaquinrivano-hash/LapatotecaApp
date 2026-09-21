import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Fondos para los perros sin foto, derivados de los tres colores de marca
 * (rosa, ámbar y azul marino) en distintas profundidades. Siempre el mismo por
 * perro, para que el equipo lo reconozca de lejos.
 */
const FONDOS = [
  "bg-[#fde4ec] text-[#a3204f]",
  "bg-[#fdf0d9] text-[#8a5600]",
  "bg-[#e6ebf7] text-[#24458f]",
  "bg-[#fbd9e4] text-[#8f1c48]",
  "bg-[#fae7cd] text-[#7a4d00]",
  "bg-[#dde4f3] text-[#1b3573]",
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
