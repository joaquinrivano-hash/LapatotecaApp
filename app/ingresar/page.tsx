"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Dog, ShieldCheck, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoPatoteca } from "@/components/shared/logo";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { STAFF } from "@/lib/data/catalogos";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { useMontado } from "@/lib/hooks/use-montado";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import type { Rol } from "@/lib/types";

/**
 * A dónde va cada rol al entrar. El cliente NO se queda en la landing: esa es
 * la página pública, y ahí no hay forma de saber si la sesión quedó abierta.
 */
const DESTINO: Record<Rol, string> = {
  cliente: "/mi-cuenta",
  staff: "/staff",
  admin: "/admin",
};

export default function Ingresar() {
  const router = useRouter();
  const entrar = useSesion((s) => s.entrar);
  const montado = useMontado();
  const [rol, setRol] = useState<Rol | null>(null);

  const clientes = useConsulta((repo) => repo.clientes.listar());
  const perros = useConsulta((repo) => repo.perros.listar());

  function ir(seleccion: Rol, extra: { clienteId?: string; staff?: string } = {}) {
    entrar({ rol: seleccion, ...extra });
    router.push(DESTINO[seleccion]);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <LogoPatoteca tamano={104} prioridad />
        <p className="text-muted-foreground text-pretty">
          Hotel y guardería para perros en Providencia. Sin jaulas ni caniles,
          como en la casa.
        </p>
      </header>

      <div className="space-y-3">
        <p className="text-muted-foreground text-center text-sm font-semibold">
          Este es un prototipo: elige con qué cara quieres entrar.
        </p>

        <OpcionRol
          titulo="Soy cliente"
          descripcion="Reservar, comprar días y ver los reportes de mi perro"
          icono={User}
          activo={rol === "cliente"}
          onClick={() => setRol(rol === "cliente" ? null : "cliente")}
        />

        {rol === "cliente" && (
          <Card className="p-4">
            <Button asChild size="lg" className="mb-3 w-full">
              <Link href="/crear-cuenta">
                <UserPlus />
                Soy nuevo, crear mi cuenta
              </Link>
            </Button>

            <p className="mb-3 text-sm font-semibold">
              O entra con una cuenta de prueba
            </p>
            {!montado || clientes.cargando ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                {(clientes.datos ?? []).slice(0, 12).map((cliente) => {
                  const suyos = (perros.datos ?? []).filter(
                    (p) => p.clienteId === cliente.id,
                  );
                  return (
                    <li key={cliente.id}>
                      <button
                        type="button"
                        onClick={() => ir("cliente", { clienteId: cliente.id })}
                        className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors"
                      >
                        <div className="flex -space-x-3">
                          {suyos.slice(0, 2).map((perro) => (
                            <PerroAvatar
                              key={perro.id}
                              id={perro.id}
                              nombre={perro.nombre}
                              fotoUrl={perro.fotoUrl}
                              tamano="sm"
                              className="ring-card ring-2"
                            />
                          ))}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {cliente.nombre} {cliente.apellido}
                          </span>
                          <span className="text-muted-foreground block truncate text-sm">
                            {suyos.map((p) => p.nombre).join(", ") || "Sin perros"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        <OpcionRol
          titulo="Trabajo acá"
          descripcion="Check-in, check-out, reportes e incidentes"
          icono={Dog}
          activo={rol === "staff"}
          onClick={() => setRol(rol === "staff" ? null : "staff")}
        />

        {rol === "staff" && (
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">¿Quién eres?</p>
            <div className="grid grid-cols-2 gap-2">
              {STAFF.map((nombre) => (
                <Button
                  key={nombre}
                  variant="outline"
                  size="lg"
                  onClick={() => ir("staff", { staff: nombre })}
                >
                  {nombre}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <OpcionRol
          titulo="Administro La Patoteca"
          descripcion="Clientes, calendario, pagos, planes y números"
          icono={ShieldCheck}
          activo={false}
          onClick={() => ir("admin")}
        />
      </div>

      <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-xs">
        <ClipboardList className="size-3.5 shrink-0" />
        Los datos son de prueba y viven en este navegador.
      </p>
    </main>
  );
}

function OpcionRol({
  titulo,
  descripcion,
  icono: Icono,
  activo,
  onClick,
}: {
  titulo: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-card flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99]",
        activo
          ? "border-primary shadow-sm"
          : "border-border/70 hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "rounded-full p-3 transition-colors",
          activo ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
        )}
      >
        <Icono className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-lg font-bold">{titulo}</span>
        <span className="text-muted-foreground block text-sm text-pretty">
          {descripcion}
        </span>
      </span>
    </button>
  );
}
