"use client";

import Link from "next/link";
import { LogIn, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoPatoteca } from "@/components/shared/logo";
import { useCliente } from "@/lib/hooks/use-cliente";
import { useMontado } from "@/lib/hooks/use-montado";
import { useSesion } from "@/lib/store/sesion";

const DESTINO_POR_ROL = {
  cliente: { href: "/mi-cuenta", etiqueta: "Mi cuenta" },
  staff: { href: "/staff", etiqueta: "Ir a Hoy" },
  admin: { href: "/admin", etiqueta: "Backoffice" },
} as const;

/**
 * Barra de la landing. Existe sobre todo para responder una pregunta que la
 * página pública no contestaba: ¿estoy conectado o no? Con sesión saluda por
 * el nombre y lleva a la parte que corresponde al rol.
 */
export function CabeceraPublica() {
  const montado = useMontado();
  const rol = useSesion((s) => s.rol);
  const { datos } = useCliente();

  const destino = rol ? DESTINO_POR_ROL[rol] : null;
  const nombre = datos?.cliente?.nombre;

  return (
    <header className="bg-background/85 sticky top-0 z-30 border-b border-border/60 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <LogoPatoteca tamano={40} prioridad />
          {/* En el celular manda el saludo: el logo ya dice el nombre. */}
          <span className="font-display hidden truncate text-lg font-bold sm:inline">
            La Patoteca
          </span>
        </Link>

        {/* Hasta que monte no se sabe si hay sesión: se muestra el caso
            público, que es el que sirve para el 100% de las visitas nuevas. */}
        {montado && destino ? (
          <div className="flex min-w-0 items-center gap-2">
            {nombre && (
              <span className="text-muted-foreground max-w-40 truncate text-sm font-semibold sm:max-w-none">
                Hola, {nombre}
              </span>
            )}
            <Button asChild size="sm">
              <Link href={destino.href}>
                <PawPrint />
                {destino.etiqueta}
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/ingresar">
              <LogIn />
              Ingresar
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * Los dos botones de la portada. Con sesión de cliente el segundo deja de
 * ofrecer "ya soy cliente" —ya lo es— y lleva derecho a su cuenta.
 */
export function AccionesPortada() {
  const montado = useMontado();
  const rol = useSesion((s) => s.rol);
  const destino = montado && rol ? DESTINO_POR_ROL[rol] : null;

  return (
    <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
      <Button asChild size="xl">
        <Link href="/reservar">Reservar</Link>
      </Button>
      <Button asChild size="xl" variant="outline">
        {destino ? (
          <Link href={destino.href}>{destino.etiqueta}</Link>
        ) : (
          <Link href="/ingresar">Ya soy cliente</Link>
        )}
      </Button>
    </div>
  );
}
