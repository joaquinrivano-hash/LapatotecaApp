"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Dog, PawPrint, TriangleAlert, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CabeceraPublica } from "@/components/shared/cabecera-publica";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { nombreVacuna } from "@/lib/rules/admision";
import { useAccion } from "@/lib/hooks/use-consulta";
import {
  crearCuenta,
  RegistroRechazado,
  reparosParaEntrar,
} from "@/lib/servicios/registro";
import { useSesion } from "@/lib/store/sesion";
import { formatearCLP } from "@/lib/utils/moneda";
import { esTelefonoValido } from "@/lib/utils/telefono";
import type { Sexo, TipoVacuna } from "@/lib/types";

const VACUNAS = NEGOCIO.admision.vacunasObligatorias;

export default function CrearCuenta() {
  const router = useRouter();
  const entrar = useSesion((s) => s.entrar);
  const { ocupado, ejecutar } = useAccion();

  const [cuenta, setCuenta] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    comuna: "Providencia",
  });
  const [perro, setPerro] = useState({
    nombre: "",
    raza: "",
    pesoKg: "",
    sexo: "hembra" as Sexo,
    esterilizado: true,
    alimentacion: "",
  });
  const [vencimientos, setVencimientos] = useState<
    Partial<Record<TipoVacuna, string>>
  >({});
  const [desparasitadoHasta, setDesparasitadoHasta] = useState("");

  const peso = Number(perro.pesoKg.replace(",", "."));
  const pesoValido = Number.isFinite(peso) && peso > 0;

  const reparos = pesoValido
    ? reparosParaEntrar({
        nombre: perro.nombre,
        raza: perro.raza,
        pesoKg: peso,
        sexo: perro.sexo,
        esterilizado: perro.esterilizado,
      })
    : [];

  const completo =
    cuenta.nombre.trim() !== "" &&
    cuenta.apellido.trim() !== "" &&
    cuenta.email.trim() !== "" &&
    esTelefonoValido(cuenta.telefono) &&
    cuenta.comuna.trim() !== "" &&
    perro.nombre.trim() !== "" &&
    perro.raza.trim() !== "" &&
    pesoValido;

  const puedeCrear = completo && reparos.length === 0;

  async function crear() {
    try {
      const { cliente, perro: creado } = await ejecutar((repo) =>
        crearCuenta(repo, {
          cuenta,
          perro: {
            nombre: perro.nombre,
            raza: perro.raza,
            pesoKg: peso,
            sexo: perro.sexo,
            esterilizado: perro.esterilizado,
            alimentacion: perro.alimentacion,
            desparasitadoHasta: desparasitadoHasta || undefined,
            vacunas: VACUNAS.filter((tipo) => vencimientos[tipo]).map(
              (tipo) => ({ tipo, fechaVencimiento: vencimientos[tipo]! }),
            ),
          },
        }),
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
            {formatearCLP(PRECIOS.diaDePrueba)}), que es una jornada completa de
            jardín. Después de eso puedes reservar hotel o días de jardín.
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
          <CardContent className="space-y-3 p-5">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold">
              <Dog className="size-5" />
              Tu perro
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                id="perro-nombre"
                etiqueta="Cómo se llama"
                valor={perro.nombre}
                onCambio={(v) => setPerro({ ...perro, nombre: v })}
              />
              <Campo
                id="raza"
                etiqueta="Raza"
                valor={perro.raza}
                onCambio={(v) => setPerro({ ...perro, raza: v })}
                ayuda="Si es quiltro, escribe quiltro."
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                id="peso"
                etiqueta="Cuánto pesa (kg)"
                tipo="number"
                valor={perro.pesoKg}
                onCambio={(v) => setPerro({ ...perro, pesoKg: v })}
                ayuda={`Recibimos hasta ${NEGOCIO.admision.pesoMaximoKg} kg.`}
              />

              <div className="space-y-1.5">
                <Label>Sexo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["hembra", "macho"] as const).map((sexo) => (
                    <Button
                      key={sexo}
                      type="button"
                      variant={perro.sexo === sexo ? "default" : "outline"}
                      onClick={() => setPerro({ ...perro, sexo })}
                      className="capitalize"
                    >
                      {sexo}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <span className="text-sm">
                <span className="font-semibold">Está esterilizado</span>
                <span className="text-muted-foreground block text-xs">
                  Obligatorio en los machos.
                </span>
              </span>
              <Switch
                checked={perro.esterilizado}
                onCheckedChange={(v) => setPerro({ ...perro, esterilizado: v })}
              />
            </label>

            <div className="space-y-2">
              <div>
                <Label>Vacunas: hasta cuándo están vigentes</Label>
                <p className="text-muted-foreground text-xs text-pretty">
                  Míralas en el carnet. Puedes dejarlas para después, pero sin
                  vacunas al día no podemos recibirlo el día de prueba.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {VACUNAS.map((tipo) => (
                  <div key={tipo} className="space-y-1">
                    <Label htmlFor={`vacuna-${tipo}`} className="text-xs">
                      {nombreVacuna(tipo)}
                    </Label>
                    <Input
                      id={`vacuna-${tipo}`}
                      type="date"
                      value={vencimientos[tipo] ?? ""}
                      onChange={(e) =>
                        setVencimientos({
                          ...vencimientos,
                          [tipo]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desparasitacion">
                Desparasitación vigente hasta (opcional)
              </Label>
              <Input
                id="desparasitacion"
                type="date"
                value={desparasitadoHasta}
                onChange={(e) => setDesparasitadoHasta(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Interna y externa. Si no la tienes a mano, la anotamos el día
                de la visita.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alimentacion">Qué come (opcional)</Label>
              <Textarea
                id="alimentacion"
                value={perro.alimentacion}
                onChange={(e) =>
                  setPerro({ ...perro, alimentacion: e.target.value })
                }
                placeholder="Ej: una taza de pellet al almuerzo, la trae en bolsita."
                rows={2}
              />
            </div>
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
          disabled={!puedeCrear || ocupado}
          onClick={crear}
        >
          <PawPrint />
          {ocupado ? "Creando…" : "Crear cuenta y agendar"}
        </Button>

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

function Campo({
  id,
  etiqueta,
  valor,
  onCambio,
  tipo = "text",
  ayuda,
  error,
  autoComplete,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  tipo?: string;
  ayuda?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        type={tipo}
        inputMode={tipo === "number" ? "decimal" : undefined}
        value={valor}
        autoComplete={autoComplete}
        onChange={(e) => onCambio(e.target.value)}
      />
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : ayuda ? (
        <p className="text-muted-foreground text-xs">{ayuda}</p>
      ) : null}
    </div>
  );
}
