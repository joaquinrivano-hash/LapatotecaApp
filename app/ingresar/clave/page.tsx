"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { KeyRound } from "lucide-react";

import { LogoPatoteca } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { autenticacion, hayAuthReal } from "@/lib/auth";

/** El mínimo que exige Supabase. */
const LARGO_MINIMO = 6;

/**
 * Elegir una contraseña nueva, llegando desde el enlace del correo.
 *
 * El enlace trae consigo una sesión: el cliente de Supabase la detecta en la
 * URL al cargar y la deja abierta. Eso es lo que autoriza el cambio, y por
 * eso no se pide la contraseña anterior —si la persona la supiera, no
 * estaría acá—.
 *
 * Hay que esperar a que esa detección termine antes de dibujar el
 * formulario: si se pregunta demasiado pronto no hay sesión todavía y la
 * pantalla diría que el enlace no sirve justo cuando sí sirve.
 */
export default function CambiarClave() {
  const router = useRouter();
  const idClave = useId();
  const idRepetida = useId();

  // El estado inicial se calcula y no se corrige dentro del efecto:
  // `hayAuthReal()` es una constante de compilación, así que en el
  // prototipo esta pantalla nace sabiendo que no tiene nada que hacer.
  const [estado, setEstado] = useState<"revisando" | "lista" | "sin_sesion">(
    hayAuthReal() ? "revisando" : "sin_sesion",
  );
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!hayAuthReal()) return;

    const auth = autenticacion();
    let vigente = true;

    const revisar = () => {
      auth.actual().then(
        (identidad) => {
          if (vigente) setEstado(identidad ? "lista" : "sin_sesion");
        },
        () => {
          if (vigente) setEstado("sin_sesion");
        },
      );
    };

    revisar();
    // El enlace del correo se procesa al cargar y avisa por acá cuando
    // terminó. Sin escuchar, una detección que tarda un poco dejaría la
    // pantalla diciendo que el enlace venció.
    const dejarDeEscuchar = auth.alCambiar((identidad) => {
      if (vigente && identidad) setEstado("lista");
    });

    return () => {
      vigente = false;
      dejarDeEscuchar();
    };
  }, []);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (clave.length < LARGO_MINIMO) {
      setError(`La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`);
      return;
    }
    // Se comparan las dos antes de ir al servidor: un error de tipeo en una
    // contraseña que no se ve es la manera segura de quedar afuera.
    if (clave !== repetida) {
      setError("Las dos contraseñas no son iguales.");
      return;
    }

    setGuardando(true);
    try {
      await autenticacion().cambiarClave(clave);
      setListo(true);
      // Un momento para que alcance a leer que quedó lista, y después a su
      // cuenta: la sesión del enlace ya sirve para entrar.
      setTimeout(() => router.replace("/mi-cuenta"), 1200);
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <LogoPatoteca tamano={88} prioridad />
        <h1 className="font-display text-2xl font-bold">
          Elige tu contraseña nueva
        </h1>
      </header>

      {estado === "revisando" && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      )}

      {estado === "sin_sesion" && (
        <Card className="space-y-3 p-5 text-center">
          <p className="font-semibold">Este enlace ya no sirve.</p>
          <p className="text-muted-foreground text-sm text-pretty">
            Los enlaces duran un rato y se usan una sola vez. Pide otro desde
            la pantalla de ingreso — y ábrelo en este mismo teléfono o
            computador, porque el enlace se abre donde lo pediste.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/ingresar">Volver a ingresar</Link>
          </Button>
        </Card>
      )}

      {estado === "lista" && (
        <Card className="p-5">
          {listo ? (
            <p role="status" className="text-center font-semibold">
              Listo, ya tienes contraseña nueva. Te estamos llevando a tu
              cuenta…
            </p>
          ) : (
            <form onSubmit={guardar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={idClave}>Contraseña nueva</Label>
                <Input
                  id={idClave}
                  type="password"
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
                <Label htmlFor={idRepetida}>Escríbela otra vez</Label>
                <Input
                  id={idRepetida}
                  type="password"
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
                {guardando ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </Card>
      )}
    </main>
  );
}
