import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * La marca como la usa el folleto: el logotipo blanco sobre el círculo rosa.
 *
 * El archivo ya viene compuesto (`public/marca/icono-512.png`) para que el
 * círculo y el margen interno sean siempre los mismos y nadie los improvise
 * con CSS.
 */
export function LogoPatoteca({
  tamano = 56,
  className,
  prioridad = false,
}: {
  tamano?: number;
  className?: string;
  prioridad?: boolean;
}) {
  return (
    <Image
      src="/marca/icono-512.png"
      alt="La Patoteca"
      width={tamano}
      height={tamano}
      priority={prioridad}
      className={cn("rounded-full", className)}
    />
  );
}

/** El logotipo suelto, en blanco. Solo sobre fondos oscuros o rosa. */
export function LogotipoBlanco({
  ancho = 160,
  className,
}: {
  ancho?: number;
  className?: string;
}) {
  return (
    <Image
      src="/marca/logo-patoteca-blanco.png"
      alt="La Patoteca"
      width={ancho}
      height={Math.round((ancho * 1392) / 1600)}
      className={className}
    />
  );
}
