"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { OcupacionFranjas } from "@/components/shared/ocupacion-franjas";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { Tile } from "@/components/shared/tile";
import { NEGOCIO } from "@/lib/config/negocio";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { cargarCalendario, cargarDetalleDia } from "@/lib/servicios/calendario";
import { cn } from "@/lib/utils";
import {
  diaDeSemana,
  fechaISO,
  formatearDiaMesCorto,
  formatearDiaSemanaCorto,
  formatearFechaLarga,
  formatearHora,
  formatearNumeroDeDia,
  sumarDias,
} from "@/lib/utils/fecha";
import type { MovimientoDia } from "@/lib/servicios/calendario";

/**
 * Color de la ocupación del día, leído como negocio: verde es la casa llena.
 *
 * Es al revés de un semáforo de alerta a propósito. En el calendario del
 * backoffice un día vacío es el problema, no el día lleno.
 */
function colorDeOcupacion(porcentaje: number): {
  barra: string;
  texto: string;
} {
  if (porcentaje >= 80) return { barra: "bg-success", texto: "text-success" };
  if (porcentaje >= 50) return { barra: "bg-warning", texto: "text-warning" };
  return { barra: "bg-destructive", texto: "text-destructive" };
}

/** Lunes de la semana a la que pertenece la fecha. */
function lunesDe(fecha: string): string {
  const dia = diaDeSemana(fecha);
  return sumarDias(fecha, dia === 0 ? -6 : 1 - dia);
}

export default function Calendario() {
  const hoy = hoyDelStaff();
  const [semana, setSemana] = useState(() => lunesDe(hoy));
  const [diaAbierto, setDiaAbierto] = useState<string | null>(hoy);

  const fin = sumarDias(semana, 6);
  const dias = useConsulta(
    (repo) => cargarCalendario(repo, semana, fin),
    [semana, fin],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Calendario</h1>
          <p className="text-muted-foreground text-sm">
            El número grande es el momento más lleno de cada día.
          </p>
          <p className="text-muted-foreground text-sm font-semibold first-letter:uppercase">
            {formatearDiaMesCorto(semana)} al {formatearDiaMesCorto(fin)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Semana anterior"
            onClick={() => setSemana(sumarDias(semana, -7))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSemana(lunesDe(hoy))}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Semana siguiente"
            onClick={() => setSemana(sumarDias(semana, 7))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {dias.cargando && !dias.datos ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {(dias.datos ?? []).map((dia) => {
            const lleno = dia.cuposLibres === 0;
            const abierto = diaAbierto === dia.fecha;
            const capacidad = Math.max(1, dia.ocupacion.pico + dia.cuposLibres);
            const porcentaje = Math.round((dia.ocupacion.pico / capacidad) * 100);
            const color = colorDeOcupacion(porcentaje);

            return (
              <button
                key={dia.fecha}
                type="button"
                onClick={() => setDiaAbierto(abierto ? null : dia.fecha)}
                aria-label={`${formatearFechaLarga(dia.fecha)}: ${porcentaje}% de ocupación`}
                className={cn(
                  "bg-card flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition-all",
                  abierto ? "border-primary shadow-sm" : "border-border/70",
                  dia.esFinDeSemana && !abierto && "bg-secondary/30",
                )}
              >
                {/* Dos líneas fijas: "28 sep" en una sola se corta en los
                    teléfonos angostos y desalinea toda la tira. */}
                <span className="text-muted-foreground flex h-7 flex-col justify-center text-[10px] leading-tight font-semibold">
                  <span className="first-letter:uppercase">
                    {formatearDiaSemanaCorto(dia.fecha)}
                  </span>
                  <span className="tabular-nums">
                    {formatearNumeroDeDia(dia.fecha)}
                  </span>
                </span>

                <span
                  className={cn(
                    "font-display flex h-7 items-center text-xl font-bold tabular-nums",
                    color.texto,
                  )}
                >
                  {dia.ocupacion.pico}
                </span>

                {/* Barra vertical: qué parte del tope se usó ese día. */}
                <span
                  className="bg-muted flex h-12 w-2.5 flex-col justify-end overflow-hidden rounded-full"
                  aria-hidden
                >
                  <span
                    className={cn("w-full rounded-full", color.barra)}
                    style={{ height: `${porcentaje}%` }}
                  />
                </span>

                <span className="text-muted-foreground flex h-4 items-center text-[10px] tabular-nums">
                  {dia.fecha === hoy
                    ? "hoy"
                    : lleno
                      ? "lleno"
                      : `${dia.cuposLibres} libres`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-success size-2 rounded-full" />
          80% o más
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-warning size-2 rounded-full" />
          50% a 79%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-destructive size-2 rounded-full" />
          bajo 50%
        </span>
        <span>
          Ocupación medida contra los {NEGOCIO.capacidad.maximoSimultaneo}{" "}
          cupos.
        </span>
      </p>

      {diaAbierto && <DetalleDelDia fecha={diaAbierto} />}
    </div>
  );
}

/**
 * El horario de un movimiento, visto desde el día que se está mirando.
 *
 * Una estadía de hotel cruza días: mostrar "10:00 a 09:00" se lee como un
 * error. Lo que importa de ese día es si entra, si sale, o si solo está.
 */
function describirHorario(movimiento: MovimientoDia, fecha: string): string {
  const entra = fechaISO(movimiento.inicio) === fecha;
  const sale = fechaISO(movimiento.fin) === fecha;

  if (entra && sale) {
    return `${formatearHora(movimiento.inicio)} a ${formatearHora(movimiento.fin)}`;
  }
  if (entra) return `entra ${formatearHora(movimiento.inicio)}`;
  if (sale) return `sale ${formatearHora(movimiento.fin)}`;
  return "todo el día";
}

function DetalleDelDia({ fecha }: { fecha: string }) {
  const detalle = useConsulta(
    (repo) => cargarDetalleDia(repo, fecha),
    [fecha],
  );

  if (detalle.cargando && !detalle.datos) return <Skeleton className="h-64" />;
  const datos = detalle.datos;
  if (!datos) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile etiqueta="Peak del día" valor={datos.ocupacion.pico} />
        <Tile etiqueta="Cupos libres" valor={datos.cuposLibres} />
        <Tile
          etiqueta="Jardín"
          valor={datos.ocupacion.perrosJardin}
          acento="jardin"
        />
        <Tile
          etiqueta="Hotel"
          valor={datos.ocupacion.perrosHotel}
          acento="hotel"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="first-letter:uppercase">
            {formatearFechaLarga(`${fecha}T12:00:00Z`)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OcupacionFranjas
            ocupacion={datos.ocupacion}
            capacidad={datos.ocupacion.pico + datos.cuposLibres}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            Quién está ese día
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {datos.movimientos.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datos.movimientos.length === 0 ? (
            <EstadoVacio
              titulo="Día libre"
              descripcion="No hay nadie agendado."
              icono={CalendarDays}
            />
          ) : (
            <ul className="divide-border/60 divide-y">
              {datos.movimientos.map((movimiento) => (
                <li
                  key={`${movimiento.linea}-${movimiento.id}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <PerroAvatar
                    id={movimiento.perro.id}
                    nombre={movimiento.perro.nombre}
                    fotoUrl={movimiento.perro.fotoUrl}
                    tamano="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {movimiento.perro.nombre}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {movimiento.cliente
                        ? `${movimiento.cliente.nombre} ${movimiento.cliente.apellido}`
                        : movimiento.perro.raza}
                    </p>
                  </div>
                  <Badge
                    variant={movimiento.linea === "hotel" ? "hotel" : "jardin"}
                  >
                    {movimiento.linea === "hotel" ? "Hotel" : "Jardín"}
                  </Badge>
                  <span className="text-muted-foreground w-28 shrink-0 text-right text-sm tabular-nums">
                    {describirHorario(movimiento, fecha)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
