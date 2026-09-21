"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Bath,
  Car,
  Check,
  Footprints,
  Minus,
  Moon,
  Plus,
  Sun,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PrecioCLP } from "@/components/shared/precio";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
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
import { cn } from "@/lib/utils";
import {
  formatearDiaMesCorto,
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

          <TabsContent value="jardin" className="mt-4 space-y-4">
            <DiaDeJardin perro={perro} />
            <ComprarPlan perro={perro} />
          </TabsContent>

          <TabsContent value="hotel" className="mt-4">
            <ReservaDeHotel perro={perro} />
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
        description: `Vence el ${plan.venceEn}. Los días se usan de lunes a viernes.`,
      });
    } catch (error) {
      avisarError(error);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>O compra un plan del mes</CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          Se paga por adelantado y vale hasta fin de mes. Los días no usados no
          pasan al mes siguiente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>¿Cuántos días al mes?</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Un día menos"
              disabled={dias <= NEGOCIO.planes.minimoDias}
              onClick={() => setDias((d) => Math.max(NEGOCIO.planes.minimoDias, d - 1))}
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
            <span className="text-muted-foreground ml-auto text-sm">
              {formatearCLP(precioDelTramo(dias))} por día
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            size="xl"
            disabled={ocupado}
            onClick={() => comprar("dias")}
            className="flex-col gap-0 py-3"
          >
            <span>Plan de {dias} días</span>
            <span className="text-sm font-normal opacity-90">
              {formatearCLP(precio)}
            </span>
          </Button>
          <Button
            size="xl"
            variant="outline"
            disabled={ocupado}
            onClick={() => comprar("pase_libre")}
            className="flex-col gap-0 py-3"
          >
            <span>Pase libre</span>
            <span className="text-sm font-normal opacity-80">
              {formatearCLP(PRECIOS.planes.paseLibre)} al mes
            </span>
          </Button>
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
          })
        : Promise.resolve(null),
    [perro.id, inicio, fin, paseos, rangoValido],
  );

  async function reservar() {
    try {
      await ejecutar((repo) =>
        crearReservaHotel(repo, {
          perroId: perro.id,
          inicio,
          fin,
          paseosContratados: paseos,
        }),
      );
      toast.success("Reserva confirmada", {
        description: "Pagaste el abono del 30%. El saldo se cobra al retiro.",
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
        <p className="text-muted-foreground text-sm">
          Se reserva con {Math.round(NEGOCIO.hotel.fraccionAbono * 100)}% de
          abono. Devolución con {NEGOCIO.hotel.horasParaDevolucion} h de aviso.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="bg-secondary/50 flex items-center justify-between gap-3 rounded-xl p-3">
          <span className="text-sm font-semibold">
            Paseos
            <span className="text-muted-foreground block text-xs font-normal">
              {formatearCLP(PRECIOS.hotel.paseo)} cada uno, de 30 min
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Un paseo menos"
              disabled={paseos === 0}
              onClick={() => setPaseos((p) => Math.max(0, p - 1))}
            >
              <Minus />
            </Button>
            <span className="min-w-6 text-center font-bold tabular-nums">
              {paseos}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Un paseo más"
              onClick={() => setPaseos((p) => p + 1)}
            >
              <Plus />
            </Button>
          </span>
        </div>

        {!rangoValido ? (
          <p className="text-warning text-sm">
            La salida tiene que ser después de la entrada.
          </p>
        ) : previa.cargando && !datos ? (
          <Skeleton className="h-32" />
        ) : datos ? (
          <>
            {datos.conPlanDeJardin && (
              <Badge variant="jardin">
                <Ticket />
                Te aplicamos el 10% por tener plan de jardín
              </Badge>
            )}
            <Desglose cotizacion={datos.cotizacion} />
            <p className="bg-secondary/60 flex items-baseline justify-between gap-3 rounded-xl p-3 text-sm">
              <span className="font-semibold">Pagas ahora (abono 30%)</span>
              <PrecioCLP monto={datos.abono} tamano="lg" />
            </p>
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
  { valor: "spa", etiqueta: "Spa", icono: Bath },
  { valor: "paseo", etiqueta: "Paseo", icono: Footprints },
  { valor: "traslado", etiqueta: "Traslado", icono: Car },
] as const;

function ServicioSpot({ perro }: { perro: Perro }) {
  const hoy = hoyDelStaff();
  const [tipo, setTipo] = useState<"spa" | "paseo" | "traslado">("spa");
  const [fecha, setFecha] = useState(sumarDias(hoy, 2));
  const [hora, setHora] = useState("11:00");
  const [nivelSpa, setNivelSpa] = useState<"express" | "premium">("express");
  const [duracion, setDuracion] = useState<30 | 60>(30);
  const [km, setKm] = useState(4);
  const { ocupado, ejecutar } = useAccion();

  const fechaHora = instanteEnHora(fecha, hora);

  const previa = useConsulta(
    (repo) =>
      cotizarServicio(repo, {
        perroId: perro.id,
        fechaHora,
        tipo,
        nivelSpa,
        duracionMin: duracion,
        km,
      }),
    [perro.id, fechaHora, tipo, nivelSpa, duracion, km],
  );

  async function agendar() {
    const { agendarServicio } = await import("@/lib/servicios/reservas");
    try {
      await ejecutar((repo) =>
        agendarServicio(repo, {
          perroId: perro.id,
          fechaHora,
          tipo,
          nivelSpa,
          duracionMin: duracion,
          km,
        }),
      );
      toast.success("Servicio agendado", {
        description: "Lo dejamos en tu cuenta del mes.",
      });
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
            <Label htmlFor="hora-servicio">Hora</Label>
            <Input
              id="hora-servicio"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </div>
        </div>

        {tipo === "spa" && (
          <div className="grid grid-cols-2 gap-2">
            {(["express", "premium"] as const).map((nivel) => (
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
                Baño {nivel}
              </button>
            ))}
          </div>
        )}

        {tipo === "paseo" && (
          <div className="grid grid-cols-2 gap-2">
            {([30, 60] as const).map((minutos) => (
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
                {minutos === 30 ? "Media hora" : "Una hora"}
              </button>
            ))}
          </div>
        )}

        {tipo === "traslado" && (
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
          </div>
        )}

        {previa.datos && <Desglose cotizacion={previa.datos} />}

        <Button size="xl" className="w-full" disabled={ocupado} onClick={agendar}>
          <Check />
          Agendar
        </Button>
      </CardContent>
    </Card>
  );
}
