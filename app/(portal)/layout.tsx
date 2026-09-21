"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, LogOut, PawPrint, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { LogoPatoteca } from "@/components/shared/logo";
import { useMontado } from "@/lib/hooks/use-montado";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "/reservar", etiqueta: "Reservar", icono: CalendarPlus },
  { href: "/tienda", etiqueta: "Tienda", icono: ShoppingBag },
  { href: "/mi-cuenta", etiqueta: "Mi cuenta", icono: PawPrint },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const montado = useMontado();
  const { rol, clienteId, salir } = useSesion();

  if (montado && (rol !== "cliente" || !clienteId)) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4">
        <EstadoVacio
          titulo="Entra con tu cuenta"
          descripcion="Para reservar, comprar y ver los reportes de tu perro necesitas iniciar sesión."
          className="w-full"
        >
          <Button asChild size="lg">
            <Link href="/ingresar">Ingresar</Link>
          </Button>
        </EstadoVacio>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/90 sticky top-0 z-30 border-b border-border/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <LogoPatoteca tamano={36} prioridad />
            <span className="font-display truncate text-lg font-bold">
              La Patoteca
            </span>
          </Link>
          <Button variant="ghost" size="icon" aria-label="Salir" asChild>
            <Link href="/ingresar" onClick={salir}>
              <LogOut />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28">
        {children}
      </main>

      <nav className="bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t border-border/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-stretch justify-around px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {SECCIONES.map(({ href, etiqueta, icono: Icono }) => {
            const activo = ruta.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-20 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors",
                  activo
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="size-6" />
                {etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
