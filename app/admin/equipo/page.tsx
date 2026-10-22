"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Mail,
  MessageCircle,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { EstadoVacio } from "@/components/shared/estado-vacio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { hayAuthReal } from "@/lib/auth";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { useSesion } from "@/lib/store/sesion";
import type { Rol } from "@/lib/types";
import { formatearFechaCorta } from "@/lib/utils/fecha";

const NOMBRE_DEL_ROL: Record<Rol, string> = {
  cliente: "Dueño",
  staff: "Cuidador",
  admin: "Administración",
};

/**
 * Quién puede entrar, y con qué permisos.
 *
 * La invitación va al revés que el alta de un dueño, y tiene que ser así: el
 * formulario del portal exige un perro, así que una cuidadora no entra por
 * ahí; y el rol no se puede pedir al registrarse, porque entonces cualquiera
 * se haría administración en el primer formulario.
 *
 * Entonces se anota el correo ANTES y la base le pone el rol cuando esa
 * persona se registre. Quien llegue por su cuenta, sin estar anotado, nace
 * dueño.
 *
 * **La app no manda ningún correo.** Mandarlo desde acá exigiría la llave
 * `service_role` de Supabase viviendo en un servidor, que es justo lo que este
 * diseño evita. Por eso, en vez de prometer un correo que no sale, la pantalla
 * deja el mensaje con el enlace listo para que Administración lo mande por
 * WhatsApp o desde su propio correo. Una invitación que nadie recibe es una
 * persona esperando algo que no va a llegar.
 */

/** Dónde se registra el equipo: el alta normal del portal pide un perro. */
function enlaceDeRegistro(): string {
  return `${window.location.origin}/crear-cuenta/equipo`;
}

function mensajeDeInvitacion(rol: Rol, email: string): string {
  return [
    `¡Hola! Te invitamos al equipo de La Patoteca como ${NOMBRE_DEL_ROL[rol].toLowerCase()}.`,
    `Crea tu cuenta acá, con este mismo correo (${email}):`,
    enlaceDeRegistro(),
  ].join("\n\n");
}

function mandarPorWhatsapp(rol: Rol, email: string) {
  // Sin número: WhatsApp abre el selector de contactos con el mensaje escrito.
  window.open(
    `https://wa.me/?text=${encodeURIComponent(mensajeDeInvitacion(rol, email))}`,
    "_blank",
    "noreferrer",
  );
}

function mandarPorCorreo(rol: Rol, email: string) {
  const asunto = encodeURIComponent("Tu cuenta en La Patoteca");
  const cuerpo = encodeURIComponent(mensajeDeInvitacion(rol, email));
  window.location.href = `mailto:${email}?subject=${asunto}&body=${cuerpo}`;
}

async function copiarEnlace() {
  try {
    await navigator.clipboard.writeText(enlaceDeRegistro());
    toast.success("Copiamos el enlace");
  } catch {
    toast.error("No pudimos copiarlo", { description: enlaceDeRegistro() });
  }
}
export default function Equipo() {
  const idCorreo = useId();
  const yo = useSesion((s) => s.usuarioId);
  const { ocupado, ejecutar } = useAccion();

  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<Rol>("staff");

  const miembros = useConsulta((repo) => repo.equipo.miembros(), []);
  const invitaciones = useConsulta((repo) => repo.equipo.invitaciones(), []);

  if (!hayAuthReal()) {
    return (
      <EstadoVacio
        titulo="Esto funciona con cuentas de verdad"
        descripcion="En el prototipo el rol se elige al ingresar, así que no hay a quién invitar: cualquiera entra como cuidador o como administración desde el selector. Con la base en la nube, acá se anota el correo de quien va a trabajar contigo y la cuenta le nace con el rol puesto."
      />
    );
  }

  async function invitar(evento: React.FormEvent) {
    evento.preventDefault();
    try {
      await ejecutar((repo) => repo.equipo.invitar(correo, rol));
      toast.success(`Anotamos a ${correo.trim().toLowerCase()}`, {
        description:
          "Ahora mándale el enlace para crear su cuenta: está abajo, en Invitaciones sin usar.",
      });
      setCorreo("");
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos invitar.",
      );
    }
  }

  async function cancelar(email: string) {
    try {
      await ejecutar((repo) => repo.equipo.cancelarInvitacion(email));
      toast.success("Invitación cancelada");
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos cancelar.",
      );
    }
  }

  async function cambiar(id: string, nuevo: Rol) {
    try {
      await ejecutar((repo) => repo.equipo.cambiarRol(id, nuevo));
      toast.success(`Ahora es ${NOMBRE_DEL_ROL[nuevo].toLowerCase()}`);
    } catch (problema) {
      toast.error(
        problema instanceof Error
          ? problema.message
          : "No pudimos cambiar el rol.",
      );
    }
  }

  const sinUsar = (invitaciones.datos ?? []).filter((i) => !i.usadaEn);
  const delEquipo = (miembros.datos ?? []).filter((m) => m.rol !== "cliente");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Equipo</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Anota el correo de quien va a trabajar contigo y mándale el enlace
          para crear su cuenta. Cuando se registre con ese mismo correo, su
          cuenta nace con el rol que le pusiste.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <UserPlus className="size-5" />
            Invitar
          </h2>

          <form onSubmit={invitar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={idCorreo}>Su correo</Label>
              <Input
                id={idCorreo}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="maria@lapatoteca.cl"
              />
              <p className="text-muted-foreground text-xs text-pretty">
                Tiene que ser el mismo con el que se va a registrar. No le
                llega ningún correo nuestro: después de anotarlo te dejamos el
                mensaje con el enlace listo para que se lo mandes.
              </p>
            </div>

            {/* `select` nativo: en el celular abre la rueda del sistema. */}
            <div className="space-y-1.5">
              <Label htmlFor={`${idCorreo}-rol`}>Qué va a poder hacer</Label>
              <select
                id={`${idCorreo}-rol`}
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
                className="border-input bg-card h-11 w-full rounded-xl border px-3 text-base"
              >
                <option value="staff">
                  Cuidador — marcar llegadas y salidas, reportes, fichas
                </option>
                <option value="admin">
                  Administración — todo, incluida la plata
                </option>
              </select>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={ocupado}>
              <UserPlus />
              Anotar invitación
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <Mail className="size-5" />
            Invitaciones sin usar
          </h2>

          {invitaciones.cargando ? (
            <Skeleton className="h-16 w-full" />
          ) : sinUsar.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay ninguna esperando.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm text-pretty">
                Mándale el enlace a cada persona para que cree su cuenta. Puedes
                volver a mandarlo las veces que haga falta.
              </p>
              <ul className="space-y-2">
                {sinUsar.map((invitacion) => (
                  <li
                    key={invitacion.email}
                    className="bg-secondary/40 space-y-3 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {invitacion.email}
                        </span>
                        <span className="text-muted-foreground block text-sm">
                          {NOMBRE_DEL_ROL[invitacion.rol]} · anotada el{" "}
                          {formatearFechaCorta(invitacion.creadaEn)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Cancelar la invitación de ${invitacion.email}`}
                        disabled={ocupado}
                        onClick={() => cancelar(invitacion.email)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          mandarPorWhatsapp(invitacion.rol, invitacion.email)
                        }
                      >
                        <MessageCircle />
                        Mandar por WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mandarPorCorreo(invitacion.rol, invitacion.email)
                        }
                      >
                        <Mail />
                        Por correo
                      </Button>
                      <Button size="sm" variant="ghost" onClick={copiarEnlace}>
                        <Copy />
                        Copiar enlace
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <Users className="size-5" />
            Quién trabaja acá
          </h2>

          {miembros.cargando ? (
            <Skeleton className="h-20 w-full" />
          ) : delEquipo.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía nadie más que tú.
            </p>
          ) : (
            <ul className="space-y-2">
              {delEquipo.map((miembro) => (
                <li
                  key={miembro.id}
                  className="bg-secondary/40 flex flex-wrap items-center gap-3 rounded-xl p-3"
                >
                  <span className="min-w-40 flex-1">
                    <span className="block truncate font-semibold">
                      {miembro.nombre || "Sin nombre"}
                      {miembro.id === yo && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · eres tú
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      Desde el {formatearFechaCorta(miembro.creadoEn)}
                    </span>
                  </span>

                  {/* Nadie se puede bajar a sí mismo el rol: quedarías sin
                      ninguna administración y no habría cómo volver a
                      subirse, porque para eso hace falta ser admin. */}
                  {miembro.id === yo ? (
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldCheck className="size-4" />
                      {NOMBRE_DEL_ROL[miembro.rol]}
                    </span>
                  ) : (
                    <select
                      aria-label={`Rol de ${miembro.nombre || miembro.id}`}
                      value={miembro.rol}
                      disabled={ocupado}
                      onChange={(e) => cambiar(miembro.id, e.target.value as Rol)}
                      className="border-input bg-card h-10 rounded-xl border px-2 text-sm"
                    >
                      <option value="staff">Cuidador</option>
                      <option value="admin">Administración</option>
                      <option value="cliente">Dueño (sacar del equipo)</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
