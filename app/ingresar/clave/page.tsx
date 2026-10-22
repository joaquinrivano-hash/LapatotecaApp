"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { KeyRound } from "lucide-react";

import { LogoPatoteca } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputClave } from "@/components/shared/input-clave";
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
 *
 * **Y la sesión tiene que ser la del enlace, no cualquiera.** La primera
 * versión aceptaba la que hubiera abierta. Pero el enlace casi siempre se
 * abre en otro aparato que el que lo pidió —se pide en el computador, se
 * abre desde el correo del teléfono—, ahí Supabase no lo puede usar y deja
 * la sesión que había: la pantalla mostraba el formulario igual y le cambiaba
 * la contraseña a la cuenta abierta en ese navegador, no a la del correo.
 * Se vio probándolo. Por eso se pregunta `sesionDelEnlaceDeClave`, y la
 * pantalla dice de qué cuenta es la contraseña antes de guardarla.
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
  // La dirección tal como llegó, leída en el render: la librería le borra
  // el `code` apenas lo usa, y es justamente lo que dice si lo pudo usar.
  const [direccionAlLlegar] = useState(() =>
    typeof window === "undefined" ? "" : window.location.href,
  );
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!hayAuthReal() || !direccionAlLlegar) return;

    let vigente = true;
    // Espera a que la librería termine de leer el enlace: no hace falta
    // escuchar cambios, y escucharlos era lo que dejaba pasar una sesión
    // ajena.
    autenticacion()
      .sesionDelEnlaceDeClave(direccionAlLlegar)
      .then(
        (identidad) => {
          if (!vigente) return;
          setCuenta(identidad?.email ?? null);
          setEstado(identidad ? "lista" : "sin_sesion");
        },
        () => {
          if (vigente) setEstado("sin_sesion");
        },
      );

    return () => {
      vigente = false;
    };
  }, [direccionAlLlegar]);

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
        <Link href="/" aria-label="Volver al inicio">
          <LogoPatoteca tamano={88} prioridad />
        </Link>
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
            El enlace se abre solo en el mismo teléfono o computador, y en el
            mismo navegador, donde lo pediste. También dura un rato y se usa
            una sola vez. Pide otro desde la pantalla de ingreso y ábrelo
            ahí mismo.
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
              {cuenta && (
                <p className="bg-secondary/50 rounded-xl px-3 py-2 text-sm text-pretty">
                  Es la contraseña de{" "}
                  <span className="font-semibold break-all">{cuenta}</span>.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={idClave}>Contraseña nueva</Label>
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
                <Label htmlFor={idRepetida}>Escríbela otra vez</Label>
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
                {guardando ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </Card>
      )}
    </main>
  );
}
