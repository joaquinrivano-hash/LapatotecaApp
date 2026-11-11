"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bath,
  CalendarCheck,
  Car,
  Check,
  ShoppingBasket,
  Trash2,
  Footprints,
  Minus,
  Moon,
  Plus,
  Sun,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComoPagar } from "@/components/shared/como-pagar";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PrecioCLP } from "@/components/shared/precio";
import { TablaPrecios } from "@/components/shared/tabla-precios";
import { NEGOCIO } from "@/lib/config/negocio";
import { NOMBRE_PELO } from "@/lib/rules/servicios";
import type { DuracionPaseo, NivelSpa } from "@/lib/types";
import { PASEOS_POR_PACK, PRECIOS } from "@/lib/config/precios";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { useCliente } from "@/lib/hooks/use-cliente";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  comprarPlanDeJardin,
  cotizarDiaJardin,
  cotizarReservaHotel,
  cotizarServicio,
  crearReservaHotel,
  diasConCupo,
  reservarDiaJardin,
  ReservaRechazada,
} from "@/lib/servicios/reservas";
import type { EntradaServicio } from "@/lib/servicios/reservas";
import { cn } from "@/lib/utils";
import {
  formatearDiaMesCorto,
  formatearFecha,
  formatearFechaCorta,
  formatearFechaLarga,
  instanteEnHora,
  sumarDias,
} from "@/lib/utils/fecha";
import { formatearCLP } from "@/lib/utils/moneda";
import type { Cotizacion, Perro } from "@/lib/types";

function avisarError(error: unknown) {
  if (error instanceof ReservaRechazada) {
    toast.error(error.message, { description: error.motivos.join(" ") });
  } else {
    toast.error("Algo salió mal.");
  }
}

/**
 * El abono sale de la config, nunca escrito a mano en la frase: un
 * porcentaje suelto en una pantalla se queda viejo el día que cambia la
 * regla, y nadie lo nota hasta que un cliente reclama que le cobraron otra
 * cosa de la que decía.
 */
const PORCENTAJE_ABONO = Math.round(NEGOCIO.hotel.fraccionAbono * 100);

export default function Reservar() {
  const datos = useCliente();
  const [perroId, setPerroId] = useState<string | null>(null);

  const perros = datos.datos?.perros ?? [];
  const perro = perros.find((p) => p.id === perroId) ?? perros[0] ?? null;

  if (datos.cargando && perros.length === 0) {
    return <Skeleton className="h-96" />;
  }

  if (perros.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no tienes perros registrados"
        descripcion="Agrega a tu perro desde Mi cuenta para poder reservar."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Reservar</h1>
        <p className="text-muted-foreground text-sm">
          El precio se calcula en vivo, con tus descuentos incluidos.
        </p>
      </div>

      {perros.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {perros.map((candidato) => (
            <button
              key={candidato.id}
              type="button"
              onClick={() => setPerroId(candidato.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border-2 py-1.5 pr-4 pl-1.5 transition-all",
                perro?.id === candidato.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <PerroAvatar
                id={candidato.id}
                nombre={candidato.nombre}
                fotoUrl={candidato.fotoUrl}
                tamano="sm"
              />
              <span className="text-sm font-semibold">{candidato.nombre}</span>
            </button>
          ))}
        </div>
      )}

      {/* Un perro sin día de prueba aprobado no puede reservar nada: en vez
          de dejar que choque contra el reparo en cada pestaña, la pantalla
          lo manda derecho a tomar ese día. */}
      {perro && perro.diaDePrueba.estado !== "aprobado" && (
        <Card className="border-warning/50">
          <CardContent className="space-y-3 p-5">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold">
              <CalendarCheck className="size-5" />
              Primero, el día de prueba
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {perro.diaDePrueba.estado === "agendado"
                ? `${perro.nombre} tiene su día de prueba agendado${
                    perro.diaDePrueba.fecha
                      ? ` para el ${formatearFechaLarga(perro.diaDePrueba.fecha)}`
                      : ""
                  }. Cuando lo apruebe, se abren las reservas.`
                : perro.diaDePrueba.estado === "rechazado"
                  ? `El día de prueba de ${perro.nombre} no salió bien. Escríbenos y lo vemos juntos.`
                  : `Antes de la primera reserva, ${perro.nombre} pasa una jornada con nosotros para conocernos.`}
            </p>
            {perro.diaDePrueba.estado === "pendiente" && (
              <Button asChild size="lg" className="w-full">
                <Link href="/dia-de-prueba">Agendar el día de prueba</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {perro && (
        <Tabs defaultValue="jardin">
          <TabsList>
            <TabsTrigger value="jardin">
              <Sun />
              Jardín
            </TabsTrigger>
            <TabsTrigger value="hotel">
              <Moon />
              Hotel
            </TabsTrigger>
            <TabsTrigger value="servicios">
              <Bath />
              Servicios
            </TabsTrigger>
          </TabsList>

          {/* Los servicios van también al final de las otras dos pestañas:
              el baño y el traslado se piensan junto con la estadía, no en
              una visita aparte a otra pestaña. Es el mismo componente y no
              una copia, así que no se pueden ir separando. */}
          <TabsContent value="jardin" className="mt-4 space-y-4">
            <DiaDeJardin perro={perro} />
            <ComprarPlan perro={perro} />
            <ServicioSpot perro={perro} />
          </TabsContent>

          <TabsContent value="hotel" className="mt-4 space-y-4">
            <ReservaDeHotel perro={perro} />
            <ServicioSpot perro={perro} />
          </TabsContent>

          <TabsContent value="servicios" className="mt-4">
            <ServicioSpot perro={perro} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/** Desglose con cada descuento por separado: nunca un total sin explicación. */
function Desglose({ cotizacion }: { cotizacion: Cotizacion }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {cotizacion.lineas.map((linea, i) => (
        <div key={i} className="flex justify-between gap-3">
          <dt>
            {linea.concepto}
            {linea.detalle && (
              <span className="text-muted-foreground block text-xs">
                {linea.detalle}
              </span>
            )}
          </dt>
          <dd className="tabular-nums">
            <PrecioCLP monto={linea.monto} tamano="sm" />
          </dd>
        </div>
      ))}

      {cotizacion.descuentos.map((descuento) => (
        <div
          key={descuento.concepto}
          className="text-success flex justify-between gap-3"
        >
          <dt>
            {descuento.concepto} ({Math.round(descuento.porcentaje * 100)}%)
          </dt>
          <dd>
            <PrecioCLP monto={-descuento.monto} tamano="sm" />
          </dd>
        </div>
      ))}

      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
        <dt className="font-display font-bold">Total</dt>
        <dd>
          <PrecioCLP monto={cotizacion.total} tamano="lg" />
        </dd>
      </div>
    </dl>
  );
}

function Reparos({ motivos }: { motivos: string[] }) {
  if (motivos.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {motivos.map((motivo) => (
        <li
          key={motivo}
          className="bg-warning/12 text-warning flex items-start gap-2 rounded-xl p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {motivo}
        </li>
      ))}
    </ul>
  );
}

function DiaDeJardin({ perro }: { perro: Perro }) {
  const hoy = hoyDelStaff();
  const [fecha, setFecha] = useState(sumarDias(hoy, 1));
  const { ocupado, ejecutar } = useAccion();

  const desde = sumarDias(hoy, 1);
  const hasta = sumarDias(hoy, 21);
  const cupos = useConsulta(
    (repo) => diasConCupo(repo, desde, hasta),
    [desde, hasta],
  );
  const previa = useConsulta(
    (repo) => cotizarDiaJardin(repo, { perroId: perro.id, fecha }),
    [perro.id, fecha],
  );

  async function reservar() {
    try {
      await ejecutar((repo) =>
        reservarDiaJardin(repo, { perroId: perro.id, fecha }),
      );
      toast.success(`${perro.nombre} queda agendado`, {
        description: `Te esperamos el ${formatearDiaMesCorto(`${fecha}T12:00:00Z`)}.`,
      });
    } catch (error) {
      avisarError(error);
    }
  }

  const datos = previa.datos;
  const libres = cupos.datos ?? {};

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Un día de jardín</CardTitle>
        <p className="text-muted-foreground text-sm">
          De {NEGOCIO.jardin.horaApertura}:00 a {NEGOCIO.jardin.horaCierre}:00.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {Object.entries(libres).map(([dia, cupo]) => (
            <button
              key={dia}
              type="button"
              disabled={cupo === 0}
              onClick={() => setFecha(dia)}
              className={cn(
                "flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2 text-xs font-semibold transition-all",
                fecha === dia
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border",
                cupo === 0 && "opacity-40",
              )}
            >
              {formatearDiaMesCorto(`${dia}T12:00:00Z`)}
              <span className="text-muted-foreground text-[10px] font-normal">
                {cupo === 0 ? "lleno" : `${cupo} libres`}
              </span>
            </button>
          ))}
        </div>

        {previa.cargando && !datos ? (
          <Skeleton className="h-28" />
        ) : datos ? (
          <>
            {datos.planDisponible && (
              <p className="bg-jardin-suave text-jardin flex items-center gap-2 rounded-xl p-3 text-sm font-semibold">
                <Ticket className="size-4 shrink-0" />
                Lo cubre tu plan: te quedan{" "}
                {datos.planDisponible.diasTotales -
                  datos.planDisponible.diasUsados}{" "}
                días.
              </p>
            )}
            <Desglose cotizacion={datos.cotizacion} />
            {!datos.planDisponible && datos.cotizacion.total > 0 && (
              <ComoPagar />
            )}
            <Reparos
              motivos={[
                ...datos.admision.problemas.map((p) => p.mensaje),
                ...(datos.capacidad.hayCupo ? [] : ["Ese día ya está lleno."]),
              ]}
            />
            <Button
              size="xl"
              className="w-full"
              disabled={!datos.sePuede || ocupado}
              onClick={reservar}
            >
              <Check />
              Reservar el día
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ComprarPlan({ perro }: { perro: Perro }) {
  const [dias, setDias] = useState(10);
  const { ocupado, ejecutar } = useAccion();

  const precio = dias * precioDelTramo(dias);

  async function comprar(tipo: "dias" | "pase_libre") {
    try {
      const { plan } = await ejecutar((repo) =>
        comprarPlanDeJardin(repo, {
          perroId: perro.id,
          tipo,
          dias,
        }),
      );
      toast.success("Plan activado", {
        description: `Vence el ${formatearFecha(plan.venceEn)} y los días se usan de lunes a viernes. Te dejamos el cobro en tu cuenta para que lo transfieras.`,
      });
    } catch (error) {
      avisarError(error);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-2xl">PLANES</CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          Se paga por adelantado y vale hasta fin de mes. Los días no usados no
          pasan al mes siguiente.
        </p>
      </CardHeader>
      <CardContent>
        {/* Son DOS alternativas, no un plan con un agregado abajo: el pase
            libre REEMPLAZA al pack por días, no lo complementa. Apiladas se
            leían como "el plan" y "algo más"; lado a lado, con la misma
            forma y cada una con su propio botón, la pregunta que queda es
            cuál de las dos, que es la correcta.

            El ámbar es el color de dato de la marca y acá separa la segunda
            opción sin competir con el fucsia, que es el de acción. Lleva
            texto marino, nunca blanco. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="border-border flex flex-col gap-3 rounded-2xl border-2 p-4">
            <div>
              <p className="font-display text-lg font-bold">Por días</p>
              <Label className="text-muted-foreground font-normal">
                ¿Cuántos días al mes?
              </Label>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                aria-label="Un día menos"
                disabled={dias <= NEGOCIO.planes.minimoDias}
                onClick={() =>
                  setDias((d) => Math.max(NEGOCIO.planes.minimoDias, d - 1))
                }
              >
                <Minus />
              </Button>
              <span className="font-display min-w-12 text-center text-2xl font-bold tabular-nums">
                {dias}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Un día más"
                onClick={() => setDias((d) => Math.min(22, d + 1))}
              >
                <Plus />
              </Button>
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {formatearCLP(precioDelTramo(dias))} por día
            </p>

            <Button
              size="lg"
              disabled={ocupado}
              onClick={() => comprar("dias")}
              className="mt-auto w-full flex-col gap-0 py-3"
            >
              <span>Plan de {dias} días</span>
              <span className="text-sm font-normal opacity-90">
                {formatearCLP(precio)}
              </span>
            </Button>
          </div>

          <div className="border-accent bg-accent/15 flex flex-col gap-3 rounded-2xl border-2 p-4">
            <div>
              <p className="font-display text-lg font-bold">Pase libre</p>
              <p className="text-muted-foreground text-sm text-pretty">
                Asistencia libre todos los días hábiles, con tope a las{" "}
                {NEGOCIO.jardin.horaCierre}:00.
              </p>
            </div>

            <p className="font-display text-center text-2xl font-bold tabular-nums">
              {formatearCLP(PRECIOS.planes.paseLibre)}
              <span className="block text-sm font-normal">al mes</span>
            </p>

            <Button
              variant="accent"
              size="lg"
              disabled={ocupado}
              onClick={() => comprar("pase_libre")}
              className="mt-auto w-full"
            >
              Comprar pase libre
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function precioDelTramo(dias: number): number {
  const tramos = PRECIOS.planes.tramosPorDia;
  return (
    tramos.find(
      (t) => dias >= t.desdeDias && (t.hastaDias === null || dias <= t.hastaDias),
    ) ?? tramos.at(-1)!
  ).precioPorDia;
}

function ReservaDeHotel({ perro }: { perro: Perro }) {
  const hoy = hoyDelStaff();
  const [entrada, setEntrada] = useState(sumarDias(hoy, 3));
  const [salida, setSalida] = useState(sumarDias(hoy, 6));
  const [paseos, setPaseos] = useState(0);
  const [paseosCortos, setPaseosCortos] = useState(0);
  const { ocupado, ejecutar } = useAccion();

  const inicio = instanteEnHora(entrada, "10:00");
  const fin = instanteEnHora(salida, "10:00");
  const rangoValido = salida > entrada;

  const previa = useConsulta(
    (repo) =>
      rangoValido
        ? cotizarReservaHotel(repo, {
            perroId: perro.id,
            inicio,
            fin,
            paseosContratados: paseos,
            paseosCortosContratados: paseosCortos,
          })
        : Promise.resolve(null),
    [perro.id, inicio, fin, paseos, paseosCortos, rangoValido],
  );

  async function reservar() {
    try {
      await ejecutar((repo) =>
        crearReservaHotel(repo, {
          perroId: perro.id,
          inicio,
          fin,
          paseosContratados: paseos,
          paseosCortosContratados: paseosCortos,
        }),
      );
      toast.success("Reserva tomada", {
        description: `Transfiere el abono del ${PORCENTAJE_ABONO}% y avísanos: con eso la confirmamos. El saldo se paga al retiro.`,
      });
    } catch (error) {
      avisarError(error);
    }
  }

  const datos = previa.datos;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Hotel</CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          ¡Estadía por una o varias noches, en casa y sin jaulas!
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lo del folleto, antes de elegir fechas: cómo se cobra, qué
            descuentos hay y cuándo se devuelve. Enterarse en el desglose
            es enterarse tarde. */}
        <TablaPrecios tipo="hotel" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/*
            El selector nativo muestra la fecha en el formato del navegador,
            que puede no ser el chileno. La leyenda de abajo la deja escrita
            sin ambigüedad.
          */}
          <div className="space-y-1.5">
            <Label htmlFor="entrada">Entra</Label>
            <Input
              id="entrada"
              type="date"
              value={entrada}
              min={hoy}
              onChange={(e) => setEntrada(e.target.value)}
            />
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              {formatearFechaLarga(`${entrada}T12:00:00Z`)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salida">Sale</Label>
            <Input
              id="salida"
              type="date"
              value={salida}
              min={sumarDias(entrada, 1)}
              onChange={(e) => setSalida(e.target.value)}
            />
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              {formatearFechaLarga(`${salida}T12:00:00Z`)}
            </p>
          </div>
        </div>

        {!rangoValido ? (
          <p className="text-warning text-sm">
            La salida tiene que ser después de la entrada.
          </p>
        ) : previa.cargando && !datos ? (
          <Skeleton className="h-32" />
        ) : datos ? (
          <>
            <Desglose cotizacion={datos.cotizacion} />

            {/* Los paseos van DEBAJO de la cotización porque se deciden
                mirándola: "ya que son $96.000, agrégale un paseo". Arriba,
                antes de saber cuánto sale la estadía, la pregunta no tiene
                contra qué compararse.

                Es un contador con el menos y el más siempre a la vista: con
                un botón de "Agregar" y el menos escondido hasta tener uno,
                no se entendía que se podía sacar ni cuántos llevaba. */}
            <div className="border-border space-y-1 rounded-2xl border p-3">
              <p className="text-sm font-semibold">Paseos durante la estadía</p>
              <p className="text-muted-foreground text-xs text-pretty">
                Opcionales: los repartimos durante la estadía. Cada{" "}
                {PASEOS_POR_PACK} entra la promo.
              </p>
              {(
                [
                  {
                    minutos: 15,
                    nombre: "Paseo de 15 min",
                    cuantos: paseosCortos,
                    poner: setPaseosCortos,
                  },
                  {
                    minutos: 30,
                    nombre: "Paseo de media hora",
                    cuantos: paseos,
                    poner: setPaseos,
                  },
                ] as const
              ).map(({ minutos, nombre, cuantos, poner }) => (
                <div key={minutos} className="flex items-center gap-3 pt-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{nombre}</p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                      {formatearCLP(PRECIOS.paseo[minutos])} c/u
                      <span className="bg-accent text-accent-foreground rounded-full px-1.5 font-semibold">
                        {PASEOS_POR_PACK} por{" "}
                        {formatearCLP(PRECIOS.paseoPack3[minutos])}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Un paseo de ${minutos} min menos`}
                    disabled={cuantos === 0}
                    onClick={() => poner((n) => Math.max(0, n - 1))}
                  >
                    <Minus />
                  </Button>
                  <span
                    className="min-w-6 text-center text-lg font-bold tabular-nums"
                    aria-live="polite"
                  >
                    {cuantos}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Un paseo de ${minutos} min más`}
                    onClick={() => poner((n) => n + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              ))}
            </div>

            <p className="bg-secondary/60 flex items-baseline justify-between gap-3 rounded-xl p-3 text-sm">
              <span className="font-semibold">
                Pagas ahora (abono {PORCENTAJE_ABONO}%)
              </span>
              <PrecioCLP monto={datos.abono} tamano="lg" />
            </p>
            {/* La reserva queda tomada al tocar el botón, pero se confirma
                cuando llega el abono: eso se dice antes, no después. */}
            <ComoPagar />
            <Reparos
              motivos={[
                ...datos.admision.problemas.map((p) => p.mensaje),
                ...(datos.capacidad.hayCupo
                  ? []
                  : ["No queda cupo en esas fechas."]),
              ]}
            />
            <Button
              size="xl"
              className="w-full"
              disabled={!datos.sePuede || ocupado}
              onClick={reservar}
            >
              <Check />
              Reservar y pagar el abono
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

const TIPOS_SERVICIO = [
  { valor: "spa", etiqueta: "Baño", icono: Bath },
  { valor: "paseo", etiqueta: "Paseo", icono: Footprints },
  { valor: "traslado", etiqueta: "Traslado", icono: Car },
] as const;

function ServicioSpot({ perro }: { perro: Perro }) {
  const hoy = hoyDelStaff();
  const [tipo, setTipo] = useState<"spa" | "paseo" | "traslado">("spa");
  const [fecha, setFecha] = useState(sumarDias(hoy, 2));
  const [hora, setHora] = useState("11:00");
  const [nivelSpa, setNivelSpa] = useState<NivelSpa>("peloCorto");
  const [duracion, setDuracion] = useState<DuracionPaseo>(15);
  const [cantidadPaseos, setCantidadPaseos] = useState(1);
  const [km, setKm] = useState(4);
  const [conRegreso, setConRegreso] = useState(false);
  const [otraDireccion, setOtraDireccion] = useState(false);
  const [direccion, setDireccion] = useState("");
  /**
   * Lo que el dueño va juntando antes de confirmar.
   *
   * Cada ítem guarda su propia entrada completa —con SU día y SU hora— y no
   * solo el tipo: un baño el sábado y un traslado el lunes son dos cosas
   * distintas, y guardarlas contra los campos del formulario las haría
   * cambiar solas cuando él mueve la fecha para elegir el siguiente.
   *
   * El concepto y el total se guardan cotizados: es lo que vio al
   * agregarlo, y es lo que tiene que seguir viendo en la lista.
   */
  const [carrito, setCarrito] = useState<
    { clave: string; entrada: EntradaServicio; concepto: string; total: number }[]
  >([]);
  /** `null` mientras no se sabe; `false` cuando la distancia no llegó. */
  const [midiendo, setMidiendo] = useState(false);
  const [kmMedidos, setKmMedidos] = useState<number | null>(null);
  const { ocupado, ejecutar } = useAccion();
  const { datos: datosCliente } = useCliente();

  const fechaHora = instanteEnHora(fecha, hora);

  /** La que se usa: la registrada, o la que escribió si eligió otra. */
  const direccionDelViaje = otraDireccion
    ? direccion
    : (datosCliente?.cliente?.direccion ?? "");

  // Los kilómetros los mide el servidor contra Google. Si no hay llave, o la
  // dirección no se pudo resolver, vuelve `null` y el campo de km queda a
  // mano, que es como funcionaba antes: una distancia que no llega no puede
  // dejar sin cotizar un traslado.
  useEffect(() => {
    let vigente = true;

    async function medir() {
      if (tipo !== "traslado" || !direccionDelViaje.trim()) {
        setKmMedidos(null);
        return;
      }
      setMidiendo(true);
      const { kmHastaLaDireccion } = await import(
        "@/lib/integraciones/distancias/cliente"
      );
      const medidos = await kmHastaLaDireccion(direccionDelViaje);
      // Si la dirección cambió mientras se medía, lo que volvió es de la
      // anterior: escribirlo pondría los km de un viaje que ya no se cotiza.
      if (!vigente) return;
      setKmMedidos(medidos);
      if (medidos !== null) setKm(medidos);
      setMidiendo(false);
    }

    void medir();
    return () => {
      vigente = false;
    };
  }, [tipo, direccionDelViaje]);

  const previa = useConsulta(
    (repo) =>
      cotizarServicio(repo, {
        perroId: perro.id,
        fechaHora,
        tipo,
        nivelSpa,
        duracionMin: duracion,
        cantidad: cantidadPaseos,
        km,
        conRegreso,
      }),
    [
      perro.id,
      fechaHora,
      tipo,
      nivelSpa,
      duracion,
      cantidadPaseos,
      km,
      conRegreso,
    ],
  );

  /** Lo que está elegido ahora mismo, listo para agendar o para el carrito. */
  function loElegido(): EntradaServicio {
    return {
      perroId: perro.id,
      fechaHora,
      tipo,
      nivelSpa,
      duracionMin: duracion,
      cantidad: cantidadPaseos,
      km,
      conRegreso,
    };
  }

  function agregarAlCarrito() {
    if (!previa.datos) return;
    setCarrito((actual) => [
      ...actual,
      {
        clave: `${Date.now()}-${actual.length}`,
        entrada: loElegido(),
        concepto: previa.datos!.lineas[0]?.concepto ?? "Servicio",
        total: previa.datos!.total,
      },
    ]);
    toast.success("Agregado al carrito", {
      description: "Puedes seguir agregando y agendar todo junto.",
    });
  }

  async function agendar(entradas: EntradaServicio[], vaciar: boolean) {
    const { agendarServicios } = await import("@/lib/servicios/reservas");
    try {
      await ejecutar((repo) => agendarServicios(repo, entradas));
      if (vaciar) setCarrito([]);
      toast.success(
        entradas.length === 1
          ? "Servicio agendado"
          : `${entradas.length} servicios agendados`,
        {
          description:
            "Nos pondremos en contacto contigo para acordar los detalles.",
        },
      );
    } catch (error) {
      avisarError(error);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Servicios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_SERVICIO.map(({ valor, etiqueta, icono: Icono }) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipo(valor)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-semibold transition-all",
                tipo === valor
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              <Icono className="size-5" />
              {etiqueta}
            </button>
          ))}
        </div>

        {/* El paseo no pide día ni hora: se compra por cantidad y el equipo
            lo reparte durante la estadía, porque el paseo se hace cuando el
            perro está acá y cuando el día lo permite. */}
        {tipo !== "paseo" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fecha-servicio">Día</Label>
            <Input
              id="fecha-servicio"
              type="date"
              value={fecha}
              min={hoy}
              onChange={(e) => setFecha(e.target.value)}
            />
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              {formatearFechaLarga(`${fecha}T12:00:00Z`)}
            </p>
          </div>
          <div className="space-y-1.5">
            {/* En el baño la hora no es cuándo se hace sino cuándo lo pasan a
                buscar: el equipo lo organiza para tenerlo listo antes. En los
                otros dos la hora es la hora, así que la etiqueta cambia. */}
            <Label htmlFor="hora-servicio">
              {tipo === "spa" ? "Hora en que retirarás a tu perro" : "Hora"}
            </Label>
            <Input
              id="hora-servicio"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
            {tipo === "spa" && (
              <p className="text-muted-foreground text-xs">
                Así lo tenemos listo antes de esa hora.
              </p>
            )}
          </div>
        </div>
        )}

        {tipo === "spa" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* El precio del baño lo deciden el pelo y el peso. El peso ya
                  está en la ficha, así que lo único que hay que preguntar es
                  el pelo. */}
              {(["peloCorto", "peloLargo"] as const).map((nivel) => (
                <button
                  key={nivel}
                  type="button"
                  onClick={() => setNivelSpa(nivel)}
                  className={cn(
                    "rounded-xl border-2 py-3 text-sm font-semibold capitalize transition-all",
                    nivelSpa === nivel
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {NOMBRE_PELO[nivel]}
                </button>
              ))}
            </div>

            {/* El pelo lo declara el dueño y se confirma con el perro acá.
                De los dos, el corto es el único que puede subir de precio,
                así que el aviso va solo en ese: decirlo en los dos sería
                advertir de algo que no puede pasar. Y va ANTES de agendar,
                no cuando llegue el cobro con una diferencia que nadie
                mencionó. */}
            {nivelSpa === "peloCorto" && (
              <p className="text-muted-foreground text-sm text-pretty">
                * Si tu perro resulta de pelo largo, se cobrará la diferencia.
              </p>
            )}
          </div>
        )}

        {tipo === "paseo" && (
          <div className="space-y-1.5">
            <Label>¿Cuántos paseos?</Label>
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                aria-label="Un paseo menos"
                disabled={cantidadPaseos <= 1}
                onClick={() => setCantidadPaseos((n) => Math.max(1, n - 1))}
              >
                <Minus />
              </Button>
              <span className="font-display min-w-24 text-center text-2xl font-bold">
                {cantidadPaseos}
                <span className="text-muted-foreground ml-1.5 text-sm font-semibold">
                  {cantidadPaseos === 1 ? "paseo" : "paseos"}
                </span>
              </span>
              <Button
                size="icon"
                variant="outline"
                aria-label="Un paseo más"
                onClick={() => setCantidadPaseos((n) => n + 1)}
              >
                <Plus />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs text-pretty">
              Los repartimos durante la estadía de tu perrito. Cada{" "}
              {PASEOS_POR_PACK} entra la promo.
            </p>
          </div>
        )}

        {tipo === "paseo" && (
          <div className="grid grid-cols-2 gap-2">
            {([15, 30] as const).map((minutos) => (
              <button
                key={minutos}
                type="button"
                onClick={() => setDuracion(minutos)}
                className={cn(
                  "rounded-xl border-2 py-3 text-sm font-semibold transition-all",
                  duracion === minutos
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {minutos === 15 ? "15 minutos" : "Media hora"}
              </button>
            ))}
          </div>
        )}

        {tipo === "traslado" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { valor: false, texto: "Solo ida" },
                { valor: true, texto: "Ida y vuelta" },
              ].map(({ valor, texto }) => (
                <button
                  key={texto}
                  type="button"
                  onClick={() => setConRegreso(valor)}
                  className={cn(
                    "rounded-xl border-2 py-3 text-sm font-semibold transition-all",
                    conRegreso === valor
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>¿Dónde lo pasamos a buscar?</Label>
              {/* La dirección registrada viene cargada: el dueño ya la
                  eligió de la lista de Google al crear su cuenta, así que
                  volver a pedírsela es hacerle escribir lo que ya dijo. */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { valor: false, texto: "Mi dirección" },
                  { valor: true, texto: "Otra dirección" },
                ].map(({ valor, texto }) => (
                  <button
                    key={texto}
                    type="button"
                    onClick={() => setOtraDireccion(valor)}
                    className={cn(
                      "rounded-xl border-2 py-2.5 text-sm font-semibold transition-all",
                      otraDireccion === valor
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {texto}
                  </button>
                ))}
              </div>

              {otraDireccion ? (
                <Input
                  id="direccion-traslado"
                  value={direccion}
                  placeholder="Calle, número y comuna"
                  onChange={(e) => setDireccion(e.target.value)}
                />
              ) : (
                <p className="text-muted-foreground text-sm text-pretty">
                  {direccionDelViaje ||
                    "No tenemos tu dirección registrada. Elige \"Otra dirección\"."}
                </p>
              )}
            </div>

            {/* Los km son el dato que decide el tramo, así que se muestran
                siempre: medidos quedan de solo lectura con su explicación, y
                sin medir se escriben, que es como funcionaba antes. */}
            <div className="space-y-1.5">
              <Label htmlFor="km">Distancia (km)</Label>
              <Input
                id="km"
                type="number"
                inputMode="decimal"
                min={1}
                value={km}
                onChange={(e) => setKm(Number(e.target.value) || 0)}
              />
              <p className="text-muted-foreground text-xs text-pretty">
                {midiendo
                  ? "Calculando la distancia…"
                  : kmMedidos !== null
                    ? "Calculada desde la casa. Puedes corregirla."
                    : "Escríbela tú: no pudimos calcularla."}
              </p>
            </div>
          </div>
        )}

        {/* La tabla del afiche completa, no solo la línea que le tocó.
            El precio depende del pelo y del peso, o de los kilómetros y la
            hora, y todo eso se verifica acá: ver el cuadro entero es lo que
            le permite entender por qué su valor puede moverse. */}
        <TablaPrecios tipo={tipo} />

        {previa.datos && <Desglose cotizacion={previa.datos} />}

        {/* Dos caminos, porque son dos intenciones distintas: el que viene
            por una sola cosa no tiene por qué pasar por un carrito, y el que
            quiere baño y traslado no tiene por qué agendar dos veces y
            recibir dos conversaciones. */}
        <div className="space-y-2">
          <Button
            size="xl"
            className="w-full"
            disabled={ocupado || !previa.datos}
            onClick={() => agendar([loElegido()], false)}
          >
            <Check />
            Agendar servicio
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={ocupado || !previa.datos}
            onClick={agregarAlCarrito}
          >
            <ShoppingBasket />
            Agregar al carrito
          </Button>
        </div>

        {/* La nota va acá y no detrás de un enlace: el dueño acaba de ver un
            total y tiene que saber, ANTES de tocar el botón, que ese número
            es el del afiche y que se lo confirmamos nosotros. */}
        <p className="text-muted-foreground text-sm text-pretty">
          Te hablaremos en breve para confirmar el valor.
        </p>

        {carrito.length > 0 && (
          <div className="border-primary/40 space-y-3 rounded-2xl border-2 p-4">
            <p className="font-display font-bold">
              Tu carrito ({carrito.length})
            </p>

            <ul className="divide-border divide-y">
              {carrito.map((item) => (
                <li
                  key={item.clave}
                  className="flex items-baseline gap-2 py-2 text-sm"
                >
                  <span className="flex-1 text-pretty">
                    {item.concepto}
                    <span className="text-muted-foreground block text-xs">
                      {formatearFechaCorta(item.entrada.fechaHora)} ·{" "}
                      {horaDe(item.entrada.fechaHora)}
                    </span>
                  </span>
                  <PrecioCLP monto={item.total} tamano="sm" />
                  <button
                    type="button"
                    aria-label={`Sacar ${item.concepto} del carrito`}
                    className="text-muted-foreground hover:text-primary"
                    onClick={() =>
                      setCarrito((actual) =>
                        actual.filter((i) => i.clave !== item.clave),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between gap-3 font-semibold">
              <span>Total referencial</span>
              <PrecioCLP
                monto={carrito.reduce((suma, i) => suma + i.total, 0)}
              />
            </div>

            <Button
              size="xl"
              className="w-full"
              disabled={ocupado}
              onClick={() =>
                agendar(
                  carrito.map((i) => i.entrada),
                  true,
                )
              }
            >
              <Check />
              Agendar todo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** La hora de pared de un instante, para la lista del carrito. */
function horaDe(instante: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: NEGOCIO.zonaHoraria,
  }).format(new Date(instante));
}
