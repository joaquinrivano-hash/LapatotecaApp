"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Dog, MailCheck, PawPrint, TriangleAlert, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CabeceraPublica } from "@/components/shared/cabecera-publica";
import {
  aBorrador,
  aDatosDePerro,
  Campo,
  estadoVacio,
  FormularioPerro,
  type EstadoPerro,
} from "@/components/shared/formulario-perro";
import { PRECIOS } from "@/lib/config/precios";
import { NEGOCIO } from "@/lib/config/negocio";
import {
  reparosDeAlta,
  revisarAltaDePerro,
  type FaltanteDeAlta,
} from "@/lib/rules/alta-perro";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { crearCuenta, RegistroRechazado } from "@/lib/servicios/registro";
import { autenticacion, hayAuthReal } from "@/lib/auth";
import { registrarDueno } from "@/lib/servicios/alta-de-cuenta";
import { useSesion } from "@/lib/store/sesion";
import { formatearCLP } from "@/lib/utils/moneda";
import { esTelefonoValido } from "@/lib/utils/telefono";

/** El mínimo que exige Supabase. */
const LARGO_MINIMO_CLAVE = 6;

export default function CrearCuenta() {
  const router = useRouter();
  const hoy = hoyDelStaff();
  const entrar = useSesion((s) => s.entrar);
  const { ocupado, ejecutar } = useAccion();

  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);

  // Con cuentas de verdad el alta pide contraseña; en el prototipo no hay
  // cuentas, así que el campo ni aparece.
  const conCuentaReal = hayAuthReal();
  const [clave, setClave] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);

  const [cuenta, setCuenta] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    comuna: "Providencia",
  });
  const [perro, setPerro] = useState<EstadoPerro>(estadoVacio);
  // Los reparos del formulario se muestran recién cuando intenta guardar: ir
  // marcando en rojo lo que todavía no alcanza a escribir es hostil.
  const [faltantes, setFaltantes] = useState<FaltanteDeAlta[]>([]);

  const borrador = aBorrador(perro);
  const reparos = configuracion.datos
    ? reparosDeAlta(borrador, configuracion.datos, hoy)
    : [];
  const bloqueos = reparos.filter((r) => r.bloquea);

  const datosDelDueno =
    cuenta.nombre.trim() !== "" &&
    cuenta.apellido.trim() !== "" &&
    cuenta.email.trim() !== "" &&
    esTelefonoValido(cuenta.telefono) &&
    cuenta.comuna.trim() !== "" &&
    (!conCuentaReal || clave.length >= LARGO_MINIMO_CLAVE);

  async function crear() {
    if (!configuracion.datos) return;

    const revision = revisarAltaDePerro(borrador, configuracion.datos, hoy);
    setFaltantes(revision);
    if (revision.length > 0) {
      toast.error("Falta completar la ficha.", {
        description: revision[0].mensaje,
      });
      return;
    }

    try {
      const alta = { cuenta, perro: aDatosDePerro(perro) };

      // En el prototipo no hay cuentas de acceso: se crean las dos filas y
      // listo. Pasar por `registrarDueno` ahí fallaría, porque la identidad
      // de mentira no sabe de contraseñas — y eso está bien que falle.
      const resultado = conCuentaReal
        ? await ejecutar((repo) =>
            registrarDueno(repo, autenticacion(), { ...alta, password: clave }),
          )
        : ({
            estado: "lista" as const,
            cuenta: await ejecutar((repo) => crearCuenta(repo, alta)),
          });

      // La casa puede exigir confirmar el correo antes de dar sesión. Ahí la
      // cuenta ya existe y la ficha quedó guardada esperando: no hay nada
      // más que pedirle a esta persona hasta que abra el correo.
      if (resultado.estado === "falta_confirmar") {
        setPorConfirmar(resultado.email);
        return;
      }

      const { cliente, perro: creado } = resultado.cuenta;
      entrar({ rol: "cliente", clienteId: cliente.id });
      // Sin género: "bienvenida" le erraba a la mitad de la gente.
      toast.success(`Tu cuenta está lista, ${cliente.nombre}`, {
        description: `Ahora agenda el día de prueba de ${creado.nombre}.`,
      });
      router.push("/dia-de-prueba");
    } catch (problema: unknown) {
      if (problema instanceof RegistroRechazado) {
        toast.error(problema.message, {
          description: problema.motivos.join(" "),
        });
        return;
      }
      toast.error("No pudimos crear la cuenta.");
    }
  }

  // La casa puede exigir confirmar el correo antes de dar sesión. Ahí no
  // queda nada que llenar: la cuenta existe, la ficha está guardada y lo
  // único que falta pasa en la bandeja de entrada.
  if (porConfirmar) return <RevisaTuCorreo email={porConfirmar} />;

  return (
    <>
      <CabeceraPublica />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Crea tu cuenta</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            ¡Queremos conocerte! Completa la siguiente información para poder
            agendar tu <strong className="text-foreground">día de prueba</strong>{" "}
            con nosotros. El día de prueba consiste en media jornada en La
            Patoteca con un valor de {formatearCLP(PRECIOS.diaDePrueba)} pesos,
            donde confirmaremos que es el lugar perfecto para ti y tu perrito.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold">
              <User className="size-5" />
              Tus datos
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                id="nombre"
                etiqueta="Nombre"
                valor={cuenta.nombre}
                onCambio={(v) => setCuenta({ ...cuenta, nombre: v })}
                autoComplete="given-name"
              />
              <Campo
                id="apellido"
                etiqueta="Apellido"
                valor={cuenta.apellido}
                onCambio={(v) => setCuenta({ ...cuenta, apellido: v })}
                autoComplete="family-name"
              />
            </div>

            <Campo
              id="email"
              etiqueta="Email"
              tipo="email"
              valor={cuenta.email}
              onCambio={(v) => setCuenta({ ...cuenta, email: v })}
              autoComplete="email"
            />

            {conCuentaReal && (
              <Campo
                id="clave"
                etiqueta="Elige una contraseña"
                tipo="password"
                valor={clave}
                onCambio={setClave}
                autoComplete="new-password"
                ayuda={`Con esta entras después a ver las reservas y los reportes. Al menos ${LARGO_MINIMO_CLAVE} caracteres.`}
                error={
                  clave !== "" && clave.length < LARGO_MINIMO_CLAVE
                    ? `Necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`
                    : undefined
                }
              />
            )}

            <Campo
              id="telefono"
              etiqueta="WhatsApp"
              tipo="tel"
              valor={cuenta.telefono}
              onCambio={(v) => setCuenta({ ...cuenta, telefono: v })}
              autoComplete="tel"
              ayuda="Acá te mandaremos los reportes diarios. Ej: 9 8765 4321."
              error={
                cuenta.telefono.trim() !== "" &&
                !esTelefonoValido(cuenta.telefono)
                  ? "Revisa el número: tiene que ser un celular chileno."
                  : undefined
              }
            />

            <Campo
              id="comuna"
              etiqueta="Comuna"
              valor={cuenta.comuna}
              onCambio={(v) => setCuenta({ ...cuenta, comuna: v })}
              autoComplete="address-level2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <h2 className="font-display flex items-center gap-2 text-lg font-bold">
                <Dog className="size-5" />
                Tu perro
              </h2>
              <p className="text-muted-foreground text-sm text-pretty">
                ¡Cuéntanos de tu perrito! Si tiene uno o más hermanos, podrás
                agregarlos luego de crear tu cuenta.
              </p>
            </div>

            {configuracion.datos ? (
              <FormularioPerro
                estado={perro}
                onCambio={setPerro}
                configuracion={configuracion.datos}
                faltantes={faltantes}
                hoy={hoy}
              />
            ) : (
              <Skeleton className="h-96 rounded-2xl" />
            )}
          </CardContent>
        </Card>

        {reparos.map((reparo) => (
          <div
            key={reparo.mensaje}
            className={`space-y-1 rounded-xl p-3 text-sm ${
              reparo.bloquea
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/12 text-warning"
            }`}
          >
            <p className="flex items-start gap-2 text-pretty">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {reparo.mensaje}
            </p>
            {reparo.bloquea && (
              <p className="text-muted-foreground text-xs text-pretty">
                Escríbenos igual: a veces hay vuelta, pero no queremos
                prometerte un cupo que no podemos cumplir.
              </p>
            )}
          </div>
        ))}

        <Button
          size="xl"
          className="w-full"
          disabled={!datosDelDueno || bloqueos.length > 0 || ocupado}
          onClick={crear}
        >
          <PawPrint />
          {ocupado ? "Creando…" : "Crear cuenta y agendar"}
        </Button>

        <p className="text-muted-foreground text-center text-xs text-pretty">
          Recibimos perritos de hasta {NEGOCIO.admision.pesoMaximoKg} kg, con
          las vacunas al día y machos castrados.
        </p>

        <p className="text-muted-foreground text-center text-sm">
          ¿Ya eres cliente?{" "}
          <Link href="/ingresar" className="text-primary font-semibold">
            Entra con tu cuenta
          </Link>
        </p>
      </main>
    </>
  );
}

/**
 * El final del alta cuando hay que confirmar el correo.
 *
 * Dice el correo exacto al que se mandó: la mitad de los "no me llegó" son
 * un dedo que escribió `gmial`, y verlo escrito es más rápido que cualquier
 * explicación. Y avisa de abrir el enlace en este mismo aparato, porque el
 * enlace de confirmación se canjea donde se pidió.
 */
function RevisaTuCorreo({ email }: { email: string }) {
  return (
    <>
      <CabeceraPublica />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-10">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <MailCheck className="text-primary mx-auto size-12" />
            <h1 className="font-display text-2xl font-bold text-balance">
              Revisa tu correo
            </h1>
            <p className="text-muted-foreground text-pretty">
              Le mandamos un enlace para confirmar que este correo es tuyo:
            </p>
            {/* En su propia línea: es el dato que la persona vino a
                verificar, y dentro del párrafo se partía a la mitad del
                dominio. La mitad de los "no me llegó" son un dedo que
                escribió `gmial`. */}
            <p className="bg-secondary rounded-xl px-3 py-2 font-semibold break-all">
              {email}
            </p>
            <p className="text-muted-foreground text-pretty">
              Ábrelo en este mismo teléfono o computador y seguimos con el día
              de prueba.
            </p>
            <p className="text-muted-foreground text-sm text-pretty">
              La ficha de tu perrito ya quedó guardada: no tienes que volver a
              escribirla. Si no llega en unos minutos, mira en spam.
            </p>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/">Volver a la portada</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
