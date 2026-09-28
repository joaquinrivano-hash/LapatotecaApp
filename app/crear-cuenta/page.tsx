"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Dog, PawPrint, TriangleAlert, User } from "lucide-react";
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
import { revisarAltaDePerro, type FaltanteDeAlta } from "@/lib/rules/alta-perro";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  crearCuenta,
  RegistroRechazado,
  reparosParaEntrar,
} from "@/lib/servicios/registro";
import { useSesion } from "@/lib/store/sesion";
import { formatearCLP } from "@/lib/utils/moneda";
import { esTelefonoValido } from "@/lib/utils/telefono";

export default function CrearCuenta() {
  const router = useRouter();
  const hoy = hoyDelStaff();
  const entrar = useSesion((s) => s.entrar);
  const { ocupado, ejecutar } = useAccion();

  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);

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
  const reparos = borrador.pesoKg
    ? reparosParaEntrar({
        nombre: perro.nombre,
        raza: perro.raza,
        pesoKg: borrador.pesoKg,
        sexo: borrador.sexo ?? "hembra",
        esterilizado: borrador.esterilizado,
      })
    : [];

  const datosDelDueno =
    cuenta.nombre.trim() !== "" &&
    cuenta.apellido.trim() !== "" &&
    cuenta.email.trim() !== "" &&
    esTelefonoValido(cuenta.telefono) &&
    cuenta.comuna.trim() !== "";

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
      const { cliente, perro: creado } = await ejecutar((repo) =>
        crearCuenta(repo, { cuenta, perro: aDatosDePerro(perro) }),
      );

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

  return (
    <>
      <CabeceraPublica />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Crea tu cuenta</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Primero nos conocemos: con la cuenta lista agendas el{" "}
            <strong className="text-foreground">día de prueba</strong> (
            {formatearCLP(PRECIOS.diaDePrueba)}), que es media jornada de
            jardín. Después de eso puedes reservar hotel o días completos.
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

            <Campo
              id="telefono"
              etiqueta="WhatsApp"
              tipo="tel"
              valor={cuenta.telefono}
              onCambio={(v) => setCuenta({ ...cuenta, telefono: v })}
              autoComplete="tel"
              ayuda="Acá te mandamos los reportes del día. Ej: 9 8765 4321."
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
            <h2 className="font-display flex items-center gap-2 text-lg font-bold">
              <Dog className="size-5" />
              Tu perro
            </h2>

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

        {reparos.length > 0 && (
          <div className="bg-warning/12 text-warning space-y-1 rounded-xl p-3 text-sm">
            {reparos.map((reparo) => (
              <p key={reparo} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {reparo}
              </p>
            ))}
            <p className="text-muted-foreground text-xs">
              Escríbenos igual: a veces hay vuelta, pero no queremos prometerte
              un cupo que no podemos cumplir.
            </p>
          </div>
        )}

        <Button
          size="xl"
          className="w-full"
          disabled={!datosDelDueno || reparos.length > 0 || ocupado}
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
