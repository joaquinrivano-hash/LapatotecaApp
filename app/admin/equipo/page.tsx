"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Mail,
  MailCheck,
  MessageCircle,
  RotateCw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
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
import { PlanillaDeTurnos } from "@/components/admin/planilla-turnos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  estadoDeCorreos,
  mandarCorreoDeInvitacion,
} from "@/lib/integraciones/equipo/cliente";
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
 * **El correo lo manda Supabase**, desde `/api/equipo/invitaciones`, que
 * usa la llave `service_role` y por eso revisa antes que quien pide sea
 * Administración. La persona recibe un enlace que la lleva a elegir su
 * contraseña (`/crear-cuenta/equipo/bienvenida`).
 *
 * Si el correo no sale —falta la llave, o el remitente de Supabase no
 * alcanza— la invitación queda anotada igual y la pantalla lo dice, con el
 * enlace para crear la cuenta listo para mandarlo por WhatsApp. Una
 * invitación que nadie recibe es una persona esperando algo que no llega.
 */

/**
 * Dónde se registra el equipo, para cuando el correo no sale y hay que
 * mandar el enlace a mano. El alta normal del portal pide un perro.
 */
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
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("staff");
  const [mandando, setMandando] = useState<string | null>(null);
  // Los correos no son del repositorio: se vuelven a preguntar a mano
  // después de mandar uno.
  const [vuelta, setVuelta] = useState(0);

  const miembros = useConsulta((repo) => repo.equipo.miembros(), []);
  const invitaciones = useConsulta((repo) => repo.equipo.invitaciones(), []);
  const correos = useConsulta(
    () => (hayAuthReal() ? estadoDeCorreos() : Promise.resolve(null)),
    [vuelta],
  );

  /** Manda (o reenvía) el correo y dice cómo le fue. */
  async function mandarCorreo(email: string, suNombre?: string) {
    setMandando(email);
    const resultado = await mandarCorreoDeInvitacion(email, suNombre);
    setMandando(null);
    setVuelta((v) => v + 1);

    if (resultado.ok) {
      toast.success(`Le mandamos el correo a ${email}`, {
        description:
          "Tiene que abrirlo para elegir su contraseña. Si no lo ve, que revise spam.",
      });
    } else {
      toast.error("El correo no salió", {
        description: `${resultado.motivo} Mientras, puedes mandarle el enlace por WhatsApp.`,
        duration: 12_000,
      });
    }
    return resultado.ok;
  }

  async function invitar(evento: React.FormEvent) {
    evento.preventDefault();
    const email = correo.trim().toLowerCase();
    try {
      // Primero se anota: el rol lo pone la base leyendo esta fila cuando
      // el correo crea la cuenta, así que tiene que existir antes.
      await ejecutar((repo) => repo.equipo.invitar(email, rol));
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos invitar.",
      );
      return;
    }
    setCorreo("");
    setNombre("");
    await mandarCorreo(email, nombre.trim() || undefined);
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
  const porAbrir = new Set(correos.datos?.esperando ?? []);
  const esperando = (invitaciones.datos ?? []).filter(
    (i) => i.usadaEn && porAbrir.has(i.email),
  );
  const delEquipo = (miembros.datos ?? []).filter((m) => m.rol !== "cliente");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Equipo</h1>

      {/* Dos trabajos distintos con la misma gente: quién PUEDE entrar, y
          quién ESTÁ cuando hay perros. Separarlos en pestañas evita que la
          pantalla de invitaciones crezca hasta no poder mirarse. */}
      <Tabs defaultValue="turnos">
        <TabsList>
          <TabsTrigger value="turnos">Turnos</TabsTrigger>
          <TabsTrigger value="accesos">Accesos</TabsTrigger>
        </TabsList>

        <TabsContent value="turnos" className="mt-4">
          <PlanillaDeTurnos />
        </TabsContent>

        <TabsContent value="accesos" className="mt-4 space-y-4">
          {!hayAuthReal() ? (
            <EstadoVacio
              titulo="Esto funciona con cuentas de verdad"
              descripcion="En el prototipo el rol se elige al ingresar, así que no hay a quién invitar: cualquiera entra como cuidador o como administración desde el selector. Con la base en la nube, acá se invita a quien va a trabajar contigo y la cuenta le nace con el rol puesto."
            />
          ) : (
            <>
              <p className="text-muted-foreground text-sm text-pretty">
                Invita a quien va a trabajar contigo: le llega un correo para
                elegir su contraseña, y su cuenta nace con el rol que le
                pusiste.
              </p>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <h2 className="font-display flex items-center gap-2 text-lg font-bold">
                    <UserPlus className="size-5" />
                    Invitar
                  </h2>

                  {correos.datos && !correos.datos.activos && (
                    <p className="bg-warning/12 text-warning flex items-start gap-2 rounded-xl p-3 text-sm text-pretty">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {correos.datos.motivo} Mientras tanto la invitación
                        queda anotada y le puedes mandar el enlace por WhatsApp.
                      </span>
                    </p>
                  )}

                  <form onSubmit={invitar} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idCorreo}-nombre`}>Su nombre</Label>
                      <Input
                        id={`${idCorreo}-nombre`}
                        autoComplete="off"
                        required
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="María"
                      />
                      <p className="text-muted-foreground text-xs text-pretty">
                        Con este nombre firma los reportes que les llegan a los
                        dueños.
                      </p>
                    </div>

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
                        Ahí le llega la invitación. Es también el correo con el
                        que va a entrar.
                      </p>
                    </div>

                    {/* `select` nativo: en el celular abre la rueda del sistema. */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idCorreo}-rol`}>
                        Qué va a poder hacer
                      </Label>
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

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={ocupado || mandando !== null}
                    >
                      <Send />
                      {mandando ? "Mandando…" : "Invitar y mandar el correo"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="font-display flex items-center gap-2 text-lg font-bold">
                    <Mail className="size-5" />
                    Invitaciones
                  </h2>

                  {invitaciones.cargando ? (
                    <Skeleton className="h-16 w-full" />
                  ) : sinUsar.length === 0 && esperando.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No hay ninguna esperando.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {/* Correo mandado: la cuenta ya existe con su rol y falta que
                  la persona abra el enlace. No se cancela desde acá, porque
                  la cuenta ya nació: se le quita el rol en la lista de abajo. */}
                      {esperando.map((invitacion) => (
                        <li
                          key={invitacion.email}
                          className="bg-secondary/40 flex flex-wrap items-center gap-3 rounded-xl p-3"
                        >
                          <span className="min-w-40 flex-1">
                            <span className="block truncate font-semibold">
                              {invitacion.email}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                              <MailCheck className="size-3.5 shrink-0" />
                              {NOMBRE_DEL_ROL[invitacion.rol]} · le llegó el
                              correo, todavía no lo abre
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mandando !== null}
                            onClick={() => mandarCorreo(invitacion.email)}
                          >
                            <RotateCw />
                            {mandando === invitacion.email
                              ? "Mandando…"
                              : "Reenviar"}
                          </Button>
                        </li>
                      ))}

                      {/* Anotada pero sin correo: o se anotó antes de que existiera
                  el envío, o el correo no salió. */}
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
                                {formatearFechaCorta(invitacion.creadaEn)},
                                todavía no le llega nada
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
                              disabled={mandando !== null}
                              onClick={() => mandarCorreo(invitacion.email)}
                            >
                              <Send />
                              {mandando === invitacion.email
                                ? "Mandando…"
                                : "Mandar el correo"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                mandarPorWhatsapp(
                                  invitacion.rol,
                                  invitacion.email,
                                )
                              }
                            >
                              <MessageCircle />
                              Por WhatsApp
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={copiarEnlace}
                            >
                              <Copy />
                              Copiar enlace
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
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
                              onChange={(e) =>
                                cambiar(miembro.id, e.target.value as Rol)
                              }
                              className="border-input bg-card h-10 rounded-xl border px-2 text-sm"
                            >
                              <option value="staff">Cuidador</option>
                              <option value="admin">Administración</option>
                              <option value="cliente">
                                Dueño (sacar del equipo)
                              </option>
                            </select>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
