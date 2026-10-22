"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";

import { CabeceraPublica } from "@/components/shared/cabecera-publica";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { InputClave } from "@/components/shared/input-clave";
import { LogoPatoteca } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { autenticacion, hayAuthReal, type Identidad } from "@/lib/auth";
import { leerEnlaceDeCorreo, type EnlaceDeCorreo } from "@/lib/auth/enlace";
import type { Rol } from "@/lib/types";

/** El mínimo que exige Supabase. */
const LARGO_MINIMO = 6;

const SU_CASA: Record<Rol, string> = {
  cliente: "/mi-cuenta",
  staff: "/staff",
  admin: "/admin",
};

const COMO_ENTRA: Record<Rol, string> = {
  cliente: "dueño",
  staff: "cuidador",
  admin: "administración",
};

/**
 * Donde llega quien abrió el correo de invitación al equipo.
 *
 * La cuenta ya existe —la creó la invitación, con el rol puesto— y el enlace
 * trae la sesión. Lo único que falta es la contraseña, así que es lo único
 * que se pide: el nombre lo escribió Administración al invitar.
 *
 * El enlace se lee una sola vez y se borra de la barra de direcciones antes
 * de usarlo: trae un token de sesión, y dejarlo ahí lo deja en el historial
 * del navegador y en cualquier captura de pantalla que alguien comparta.
 */
export default function BienvenidaAlEquipo() {
  const router = useRouter();
  const idClave = useId();
  const idRepetida = useId();

  // Se lee en el primer render del navegador, no en el efecto: en desarrollo
  // el efecto corre dos veces, y la segunda ya no encontraría el token
  // porque la primera lo borró de la barra.
  const [enlace] = useState<EnlaceDeCorreo>(() =>
    typeof window === "undefined"
      ? { tipo: "nada" }
      : leerEnlaceDeCorreo(window.location.href),
  );
  const [estado, setEstado] = useState<
    | { tipo: "abriendo" }
    | { tipo: "lista"; identidad: Identidad }
    | { tipo: "fallo"; motivo: string }
  >(hayAuthReal() ? { tipo: "abriendo" } : { tipo: "fallo", motivo: "" });
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!hayAuthReal()) return;
    let vigente = true;

    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    autenticacion()
      .abrirDesdeEnlace(enlace)
      .then(
        (identidad) => {
          if (vigente) setEstado({ tipo: "lista", identidad });
        },
        (problema: unknown) => {
          if (!vigente) return;
          setEstado({
            tipo: "fallo",
            motivo:
              problema instanceof Error
                ? problema.message
                : "No pudimos abrir tu invitación.",
          });
        },
      );

    return () => {
      vigente = false;
    };
  }, [enlace]);

  if (!hayAuthReal()) {
    return (
      <>
        <CabeceraPublica />
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4">
          <EstadoVacio
            titulo="Esto funciona con cuentas de verdad"
            descripcion="En el prototipo no hay invitaciones: entras como cuidador o como administración desde el selector de ingreso."
            className="w-full"
          >
            <Button asChild size="lg">
              <Link href="/ingresar">Ir a ingresar</Link>
            </Button>
          </EstadoVacio>
        </main>
      </>
    );
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (estado.tipo !== "lista") return;
    setError(null);

    if (clave.length < LARGO_MINIMO) {
      setError(`La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`);
      return;
    }
    // Una contraseña que no se ve y se escribe una sola vez es la manera
    // segura de quedar afuera el primer día.
    if (clave !== repetida) {
      setError("Las dos contraseñas no son iguales.");
      return;
    }

    setGuardando(true);
    try {
      await autenticacion().cambiarClave(clave);
      router.replace(SU_CASA[estado.identidad.rol]);
      // Para que el proxy vuelva a evaluar con la sesión nueva.
      router.refresh();
    } catch (problema) {
      setError(
        problema instanceof Error
          ? problema.message
          : "No pudimos guardar la contraseña.",
      );
      setGuardando(false);
    }
  }

  return (
    <>
      <CabeceraPublica />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <LogoPatoteca tamano={88} prioridad />
          <h1 className="font-display text-2xl font-bold text-balance">
            {estado.tipo === "lista"
              ? // Sin género: "bienvenida" le erraría a la mitad del equipo.
                `¡Hola${nombreDe(estado.identidad)}! Ya eres parte del equipo`
              : "Tu invitación a La Patoteca"}
          </h1>
        </header>

        {estado.tipo === "abriendo" && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        )}

        {estado.tipo === "fallo" && (
          <Card>
            <CardContent className="space-y-3 p-5 text-center">
              <p className="font-semibold">{estado.motivo}</p>
              <p className="text-muted-foreground text-sm text-pretty">
                Las invitaciones duran un rato y se abren una sola vez. Pídele a
                Administración que te la reenvíe; si ya elegiste tu contraseña,
                entra directo.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link href="/ingresar">Ir a ingresar</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {estado.tipo === "lista" && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-muted-foreground text-sm text-pretty">
                Entras como{" "}
                <strong className="text-foreground">
                  {COMO_ENTRA[estado.identidad.rol]}
                </strong>{" "}
                con <strong className="text-foreground">{estado.identidad.email}</strong>.
                Elige una contraseña y listo.
              </p>

              {/* Sin invitación anotada la cuenta nace como dueño. Se dice
                  acá, no cuando la persona entre y no vea nada. */}
              {estado.identidad.rol === "cliente" && (
                <p className="bg-warning/12 text-warning flex items-start gap-2 rounded-xl p-3 text-sm text-pretty">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  Tu cuenta quedó sin permisos de equipo. Pídele a
                  Administración que te cambie el rol.
                </p>
              )}

              <form onSubmit={guardar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={idClave}>Tu contraseña</Label>
                  <InputClave
                    id={idClave}
                    autoComplete="new-password"
                    required
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Al menos {LARGO_MINIMO} caracteres.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={idRepetida}>Repítela</Label>
                  <InputClave
                    id={idRepetida}
                    autoComplete="new-password"
                    required
                    value={repetida}
                    onChange={(e) => setRepetida(e.target.value)}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="bg-destructive/10 text-destructive rounded-xl px-3 py-2 text-sm font-semibold"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  size="xl"
                  className="w-full"
                  disabled={guardando}
                >
                  <KeyRound />
                  {guardando ? "Guardando…" : "Guardar y entrar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}

/**
 * ", María" para el saludo, o nada. `staff` trae el nombre del perfil o, si
 * Administración no lo escribió, el correo: saludar a un correo es peor que
 * no saludar a nadie.
 */
function nombreDe(identidad: Identidad): string {
  const nombre = identidad.staff;
  return nombre && nombre !== identidad.email ? `, ${nombre}` : "";
}
