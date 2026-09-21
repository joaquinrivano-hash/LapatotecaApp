"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, CameraIcon, Home, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { LogoPatoteca } from "@/components/shared/logo";
import { useMontado } from "@/lib/hooks/use-montado";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import { hoyDelStaff } from "@/lib/servicios/asistencia";

const NAVEGACION = [
  { href: "/staff", etiqueta: "Hoy", icono: Home },
  { href: "/staff/buscar", etiqueta: "Buscar", icono: Search },
  { href: "/staff/reportes", etiqueta: "Reporte", icono: CameraIcon },
  { href: "/staff/incidentes", etiqueta: "Incidentes", icono: AlertTriangle },
];

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const montado = useMontado();
  const { rol, staff, salir } = useSesion();

  if (montado && rol !== "staff") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4">
        <EstadoVacio
          titulo="Esta parte es para el equipo"
          descripcion="Entra con tu nombre para hacer check-in, mandar reportes y anotar incidentes."
          className="w-full"
        >
          <Button asChild size="lg">
            <Link href="/ingresar">Ir a ingresar</Link>
          </Button>
        </EstadoVacio>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/90 sticky top-0 z-30 border-b border-border/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <LogoPatoteca tamano={40} className="shrink-0" prioridad />
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-lg font-bold">
              Hola{staff ? `, ${staff}` : ""}
            </p>
            <p className="text-muted-foreground truncate text-xs first-letter:uppercase">
              {formatearFechaLarga(`${hoyDelStaff()}T12:00:00Z`)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={salir}
            aria-label="Salir"
            asChild
          >
            <Link href="/ingresar">
              <LogOut />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">
        {children}
      </main>

      {/* Navegación abajo: es donde llega el pulgar. */}
      <nav className="bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t border-border/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-2xl items-stretch justify-around px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAVEGACION.map(({ href, etiqueta, icono: Icono }) => {
            const activo =
              href === "/staff" ? ruta === href : ruta.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-18 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors",
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
