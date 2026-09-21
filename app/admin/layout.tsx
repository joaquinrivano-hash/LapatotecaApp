"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Database,
  LogOut,
  Package,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { LogoPatoteca } from "@/components/shared/logo";
import { useMontado } from "@/lib/hooks/use-montado";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "/admin", etiqueta: "Números", icono: ChartNoAxesColumn },
  { href: "/admin/calendario", etiqueta: "Calendario", icono: CalendarDays },
  { href: "/admin/clientes", etiqueta: "Clientes", icono: Users },
  { href: "/admin/pagos", etiqueta: "Pagos", icono: Wallet },
  { href: "/admin/planes", etiqueta: "Planes", icono: Ticket },
  { href: "/admin/inventario", etiqueta: "Tienda", icono: Package },
  { href: "/admin/datos", etiqueta: "Datos", icono: Database },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const montado = useMontado();
  const { rol, salir } = useSesion();

  if (montado && rol !== "admin") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4">
        <EstadoVacio
          titulo="Esta parte es del backoffice"
          descripcion="Entra como administración para ver los números, el calendario y la cobranza."
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
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <LogoPatoteca tamano={36} prioridad />
              <p className="font-display truncate text-lg font-bold">
                Backoffice
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Salir" asChild>
              <Link href="/ingresar" onClick={salir}>
                <LogOut />
              </Link>
            </Button>
          </div>

          {/* En el celular la navegación se desliza; en pantalla grande cabe entera. */}
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SECCIONES.map(({ href, etiqueta, icono: Icono }) => {
              const activo =
                href === "/admin" ? ruta === href : ruta.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                    activo
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <Icono className="size-4" />
                  {etiqueta}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
