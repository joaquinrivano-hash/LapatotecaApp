"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MailCheck, PawPrint, UserPlus } from "lucide-react";

import { CabeceraPublica } from "@/components/shared/cabecera-publica";
import { LogoPatoteca } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autenticacion, hayAuthReal } from "@/lib/auth";
import { EstadoVacio } from "@/components/shared/estado-vacio";

const LARGO_MINIMO_CLAVE = 6;

/**
 * La cuenta de quien trabaja acá.
 *
 * Existe porque el alta del portal **exige un perro**: es el alta de un
 * dueño. Una cuidadora no tiene perro que inscribir y la dueña de la casa
 * tampoco tiene por qué tenerlo, así que por esa puerta no entran. Esta
 * pantalla pide lo mínimo —nombre, correo y contraseña— y nada más.
 *
 * **El rol no se pregunta acá a propósito.** Si el formulario dejara elegir
 * "administración", cualquiera que llegue a esta URL se haría admin en el
 * primer intento. El rol lo pone la base: si el correo está anotado en
 * `invitaciones`, la cuenta nace con el rol que Administración dejó escrito;
 * si no está anotado, nace como dueño y no ve nada reservado.
 *
 * Esa es también la salida del problema del huevo y la gallina: el primer
 * admin se registra acá —queda como dueño, porque todavía no hay nadie que
 * pueda invitarlo— y se asciende una sola vez desde el editor SQL. De ahí en
 * adelante invita él.
 */
export default function CrearCuentaDeEquipo() {
  const router = useRouter();
  const idNombre = useId();
  const idCorreo = useId();
  const idClave = useId();

  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);

  if (!hayAuthReal()) {
    return (
      <>
        <CabeceraPublica />
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4">
          <EstadoVacio
            titulo="Esto funciona con cuentas de verdad"
            descripcion="En el prototipo no hay cuentas: entras como cuidador o como administración desde el selector de ingreso, sin registrarte."
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

  if (porConfirmar) {
    return (
      <>
        <CabeceraPublica />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <MailCheck className="text-primary mx-auto size-12" />
              <h1 className="font-display text-2xl font-bold text-balance">
                Revisa tu correo
              </h1>
              <p className="text-muted-foreground text-pretty">
                Le mandamos un enlace para confirmar que este correo es tuyo:
              </p>
              <p className="bg-secondary rounded-xl px-3 py-2 font-semibold break-all">
                {porConfirmar}
              </p>
              <p className="text-muted-foreground text-pretty">
                Ábrelo en este mismo teléfono o computador y ya puedes entrar.
              </p>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link href="/ingresar">Ir a ingresar</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (clave.length < LARGO_MINIMO_CLAVE) {
      setError(`La contraseña necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      return;
    }

    setCreando(true);
    try {
      const { faltaConfirmar } = await autenticacion().registrar({
        email: correo,
        password: clave,
        nombre,
      });

      if (faltaConfirmar) {
        setPorConfirmar(correo.trim().toLowerCase());
        return;
      }

      // Con sesión abierta el rol ya está puesto por la base. No se decide
      // acá a dónde mandarlo según lo que creemos que es: se recarga y el
      // proxy, que lee el rol de la tabla, lo deja donde corresponde.
      router.replace("/ingresar");
      router.refresh();
    } catch (problema) {
      setError(
        problema instanceof Error
          ? problema.message
          : "No pudimos crear la cuenta.",
      );
      setCreando(false);
    }
  }

  return (
    <>
      <CabeceraPublica />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <LogoPatoteca tamano={88} prioridad />
          <h1 className="font-display text-2xl font-bold text-balance">
            Crea tu cuenta de trabajo
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Esta es la cuenta para quienes trabajamos en la casa. Usa el mismo
            correo con el que te invitaron.
          </p>
        </header>

        <Card>
          <CardContent className="p-5">
            <form onSubmit={crear} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={idNombre}>Tu nombre</Label>
                <Input
                  id={idNombre}
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="name"
                  placeholder="María"
                />
                <p className="text-muted-foreground text-xs text-pretty">
                  Con este firmas los reportes que les llegan a los dueños.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={idCorreo}>Tu correo</Label>
                <Input
                  id={idCorreo}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="maria@lapatoteca.cl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={idClave}>Elige una contraseña</Label>
                <Input
                  id={idClave}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Al menos {LARGO_MINIMO_CLAVE} caracteres.
                </p>
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
                disabled={creando}
              >
                <UserPlus />
                {creando ? "Creando…" : "Crear mi cuenta"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Se dice antes y no después: enterarse de que no quedaste con los
            permisos recién al no ver nada es la peor manera de enterarse. */}
        <p className="text-muted-foreground text-center text-xs text-pretty">
          Si tu correo no está anotado por Administración, la cuenta se crea
          igual pero sin permisos de equipo. Pídele que te invite y vuelve a
          entrar.
        </p>

        <Card>
          <CardContent className="space-y-3 p-5 text-center">
            <PawPrint className="text-primary mx-auto size-6" />
            <p className="text-sm text-pretty">
              ¿Vienes a inscribir a tu perrito? Esa es otra puerta.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/crear-cuenta">Crear mi cuenta de cliente</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
