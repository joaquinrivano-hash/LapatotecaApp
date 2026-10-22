"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { KeyRound, LogIn, Mail, UserPlus } from "lucide-react";

import { LogoPatoteca } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputClave } from "@/components/shared/input-clave";
import { Label } from "@/components/ui/label";
import { autenticacion } from "@/lib/auth";
import { puertaDe } from "@/lib/auth/puertas";
import type { Rol } from "@/lib/types";

/** A dónde va cada rol cuando no venía de ninguna parte en particular. */
const SU_CASA: Record<Rol, string> = {
  cliente: "/mi-cuenta",
  staff: "/staff",
  admin: "/admin",
};

/**
 * Entrar con correo y contraseña.
 *
 * Una sola pantalla para los tres roles: no hay un login de admin aparte.
 * Quién es cada uno lo dice la tabla `perfiles`, y preguntarlo en el
 * formulario sería dejar que cualquiera se declare administrador.
 */
export function FormularioDeIngreso() {
  const router = useRouter();
  const parametros = useSearchParams();
  const idCorreo = useId();
  const idClave = useId();

  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * A dónde ir después de entrar.
   *
   * El proxy guarda en `volver` la ruta a la que la persona iba. Se acepta
   * solo si empieza con `/` y es una de las ramas que conocemos: con un
   * destino libre, un enlace con `?volver=https://otro-sitio` convertiría
   * esta pantalla en un trampolín hacia cualquier parte.
   */
  function destinoDe(rol: Rol): string {
    const volver = parametros.get("volver");
    const legitimo =
      volver && volver.startsWith("/") && !volver.startsWith("//")
        ? puertaDe(volver)
        : null;
    return legitimo ? volver! : SU_CASA[rol];
  }

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    setEntrando(true);
    try {
      const identidad = await autenticacion().entrar(correo, clave);
      router.replace(destinoDe(identidad.rol));
      // Para que el proxy vuelva a evaluar con la cookie nueva.
      router.refresh();
    } catch (problema) {
      setError(
        problema instanceof Error ? problema.message : "No pudimos entrar.",
      );
      setEntrando(false);
    }
  }

  async function recuperar() {
    setError(null);
    setAviso(null);
    if (!correo.trim()) {
      setError("Escribe tu correo y volvemos a darte una contraseña.");
      return;
    }
    setRecuperando(true);
    try {
      await autenticacion().recuperar(correo);
      // El aviso no confirma que el correo exista: decir "ese correo no
      // está registrado" le serviría a cualquiera para averiguar quién es
      // cliente de la casa.
      setAviso(
        "Si ese correo tiene cuenta, le acabamos de mandar un enlace para " +
          "elegir una contraseña nueva.",
      );
    } catch (problema) {
      setError(
        problema instanceof Error
          ? problema.message
          : "No pudimos mandar el correo.",
      );
    } finally {
      setRecuperando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        {/* El logo vuelve al inicio. Acá no hay cabecera ni menú, así que
            sin esto la pantalla es un callejón sin salida para quien entró
            a mirar y todavía no tiene cuenta. */}
        <Link href="/" aria-label="Volver al inicio">
          <LogoPatoteca tamano={96} prioridad />
        </Link>
        <p className="text-muted-foreground text-pretty">
          Entra para ver las reservas de tu perrito, sus reportes y tus cobros.
        </p>
      </header>

      <Card className="p-5">
        <form onSubmit={entrar} className="space-y-4">
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
              placeholder="javiera@ejemplo.cl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={idClave}>Tu contraseña</Label>
            <InputClave
              id={idClave}
              autoComplete="current-password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
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

          {aviso && (
            <p
              role="status"
              className="bg-secondary rounded-xl px-3 py-2 text-sm font-semibold"
            >
              {aviso}
            </p>
          )}

          <Button type="submit" size="xl" className="w-full" disabled={entrando}>
            <LogIn />
            {entrando ? "Entrando…" : "Entrar"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={recuperar}
            disabled={recuperando}
          >
            <KeyRound />
            {recuperando ? "Mandando…" : "Olvidé mi contraseña"}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3 p-5 text-center">
        <p className="font-display text-lg font-bold">
          ¿Todavía no tienes cuenta?
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          Inscribe a tu perrito y agenda su día de prueba. Son $10.000 y es
          media jornada en la casa, para que se conozcan.
        </p>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/crear-cuenta">
            <UserPlus />
            Crear mi cuenta
          </Link>
        </Button>
      </Card>

      {/* La gente del equipo no entra por el alta del portal: esa exige un
          perro. Esta es su puerta, y conviene que esté a la vista — si no,
          la cuidadora recién invitada no tiene cómo llegar. */}
      <p className="text-muted-foreground text-center text-xs text-pretty">
        <Mail className="mr-1.5 inline size-3.5 shrink-0 align-text-bottom" />
        ¿Trabajas acá y todavía no tienes cuenta?{" "}
        <Link
          href="/crear-cuenta/equipo"
          className="text-primary font-semibold underline underline-offset-2"
        >
          Créala con el correo con que te invitaron
        </Link>
        .
      </p>
    </main>
  );
}
