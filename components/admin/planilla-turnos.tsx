"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  TriangleAlert,
  Trash2,
} from "lucide-react";

import { NEGOCIO } from "@/lib/config/negocio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrillaDeTurnos } from "@/components/admin/grilla-turnos";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  desfaseDelFichaje,
  semanaDeTurnos,
  type TurnoConPersona,
} from "@/lib/servicios/turnos";
import type { LadoObservado } from "@/lib/rules/turnos";
import { describirDondeFicho, dondeFicho } from "@/lib/rules/ubicacion";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  diaDeSemana,
  formatearDiaMesCorto,
  formatearDiaSemanaCorto,
  formatearHora,
  sumarDias,
} from "@/lib/utils/fecha";
import type { FechaISO, UbicacionDeFichaje } from "@/lib/types";
import { cn } from "@/lib/utils";

/** El lunes de la semana en que cae esa fecha. */
function lunesDe(fecha: FechaISO): FechaISO {
  // `diaDeSemana` da 0 el domingo, así que el lunes está a (dia + 6) % 7.
  return sumarDias(fecha, -((diaDeSemana(fecha) + 6) % 7));
}

/**
 * Quién cubre qué horas, y si lo planificado se pareció a lo que pasó.
 *
 * Dos vistas de lo mismo, porque son dos preguntas distintas:
 *
 * - **Grilla**: la semana entera, una columna por turno y una fila por
 *   media hora. Sirve para ARMAR la semana y ver dónde queda un hueco, que
 *   es una comparación entre días y por eso necesita verlos lado a lado.
 * - **Por día**: cómo le fue a cada turno —el fichaje, los rastros, el
 *   atraso—, que es una lectura de a uno y no entra en una celda.
 *
 * La grilla se desplaza de lado en el celular, que es justo lo que la vista
 * por día evitaba. Por eso se agregó al lado y no en lugar de la otra.
 */
export function PlanillaDeTurnos() {
  const [lunes, setLunes] = useState<FechaISO>(() => lunesDe(hoyDelStaff()));
  const domingo = sumarDias(lunes, 6);
  const { ocupado, ejecutar } = useAccion();

  const semana = useConsulta(
    (repo) => semanaDeTurnos(repo, lunes, domingo),
    [lunes],
  );
  const equipo = useConsulta((repo) => repo.equipo.miembros(), []);
  const [asignandoEn, setAsignandoEn] = useState<FechaISO | null>(null);
  const [elegido, setElegido] = useState<TurnoConPersona | null>(null);

  const gente = (equipo.datos ?? []).filter((m) => m.rol !== "cliente");

  async function borrar(id: string) {
    try {
      await ejecutar((repo) => repo.turnos.eliminar(id));
      toast.success("Turno borrado");
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos borrarlo.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => setLunes(sumarDias(lunes, -7))}
        >
          <ChevronLeft />
        </Button>
        <p className="font-display text-center font-bold">
          {formatearDiaMesCorto(`${lunes}T12:00:00Z`)} —{" "}
          {formatearDiaMesCorto(`${domingo}T12:00:00Z`)}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana siguiente"
          onClick={() => setLunes(sumarDias(lunes, 7))}
        >
          <ChevronRight />
        </Button>
      </div>

      {semana.cargando && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {semana.datos && (
        <Tabs defaultValue="grilla">
          <TabsList>
            <TabsTrigger value="grilla">Grilla</TabsTrigger>
            <TabsTrigger value="dia">Por día</TabsTrigger>
          </TabsList>

          <TabsContent value="grilla" className="mt-3 space-y-3">
            <GrillaDeTurnos
              semana={semana.datos}
              seleccionado={elegido?.turno.id ?? null}
              onSeleccionar={(t) => {
                setElegido(t);
                setAsignandoEn(null);
              }}
              onAsignar={(fecha) => {
                setElegido(null);
                setAsignandoEn(fecha);
              }}
            />

            {/* El detalle del turno que se tocó. Va abajo y no dentro de la
                celda: el fichaje, los rastros y el atraso son tres líneas
                de texto que en una columna de 5rem no se leen. */}
            {elegido && (
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">
                        {elegido.persona?.nombre || "Alguien que ya no está"}
                      </span>
                      <span className="text-sm tabular-nums">
                        {formatearDiaSemanaCorto(
                          `${elegido.turno.fecha}T12:00:00Z`,
                        )}{" "}
                        {elegido.turno.desde} – {elegido.turno.hasta}
                      </span>
                    </span>
                    <Observado
                      turno={elegido.turno}
                      comparacion={elegido.comparacion}
                      rastros={elegido.rastros.length}
                    />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Borrar el turno de ${elegido.persona?.nombre ?? "esa persona"}`}
                    disabled={ocupado}
                    onClick={async () => {
                      await borrar(elegido.turno.id);
                      setElegido(null);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            )}

            {asignandoEn && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="font-display font-bold first-letter:uppercase">
                    {formatearDiaSemanaCorto(`${asignandoEn}T12:00:00Z`)}{" "}
                    {formatearDiaMesCorto(`${asignandoEn}T12:00:00Z`)}
                  </p>
                  <Asignar
                    fecha={asignandoEn}
                    gente={gente}
                    onListo={() => setAsignandoEn(null)}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dia" className="mt-3 space-y-4">
            {semana.datos?.map((dia) => (
              <Card key={dia.fecha}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display font-bold first-letter:uppercase">
                      {formatearDiaSemanaCorto(`${dia.fecha}T12:00:00Z`)}{" "}
                      {formatearDiaMesCorto(`${dia.fecha}T12:00:00Z`)}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {dia.ocupacion.pico === 0
                        ? "sin perros"
                        : `hasta ${dia.ocupacion.pico} perros`}
                    </p>
                  </div>

                  {/* Lo único de esta pantalla que pide una acción: una franja
                sin nadie mientras hay perros en la casa.

                Con la planilla vacía NO se listan los huecos: sería un
                bloque rojo de "nadie cubre de 00:00 a 24:00" repetido
                siete veces, y una pantalla que grita en todas sus filas
                enseña a ignorar el rojo. Ese caso lo dice la línea de
                abajo, una sola vez y con el mismo peso. */}
                  {dia.turnos.length > 0 &&
                    dia.huecos.map((h) => (
                      <p
                        key={h.desde}
                        className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
                      >
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span>
                          Nadie cubre de {h.desde} a {h.hasta}, y hay hasta{" "}
                          {h.perros} {h.perros === 1 ? "perro" : "perros"} en la
                          casa.
                        </span>
                      </p>
                    ))}

                  {dia.turnos.length === 0 ? (
                    /* Sin nadie asignado y con perros en la casa, esto NO es un
                 estado vacío: es el mismo problema que el hueco, dicho una
                 vez. Por eso se pinta igual que el aviso. */
                    <p
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm",
                        dia.ocupacion.pico > 0
                          ? "bg-destructive/10 text-destructive font-semibold"
                          : "text-muted-foreground",
                      )}
                    >
                      {dia.ocupacion.pico > 0
                        ? `Nadie asignado, y hubo hasta ${dia.ocupacion.pico} ${dia.ocupacion.pico === 1 ? "perro" : "perros"} en la casa.`
                        : "Nadie asignado todavía."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dia.turnos.map(
                        ({ turno, persona, comparacion, rastros }) => (
                          <li
                            key={turno.id}
                            className="bg-secondary/40 flex items-start gap-3 rounded-xl p-3"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-semibold">
                                  {persona?.nombre || "Alguien que ya no está"}
                                </span>
                                <span className="text-sm tabular-nums">
                                  {turno.desde} – {turno.hasta}
                                </span>
                              </span>
                              <Observado
                                turno={turno}
                                comparacion={comparacion}
                                rastros={rastros.length}
                              />
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Borrar el turno de ${persona?.nombre ?? "esa persona"}`}
                              disabled={ocupado}
                              onClick={() => borrar(turno.id)}
                            >
                              <Trash2 />
                            </Button>
                          </li>
                        ),
                      )}
                    </ul>
                  )}

                  {asignandoEn === dia.fecha ? (
                    <Asignar
                      fecha={dia.fecha}
                      gente={gente}
                      onListo={() => setAsignandoEn(null)}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setAsignandoEn(dia.fecha)}
                    >
                      <Plus />
                      Asignar turno
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * Lo que se observó del turno, diciendo SIEMPRE de dónde salió.
 *
 * El fichaje es la hora que la persona declaró; el rastro es deducido de
 * su trabajo y es un piso, no la presencia. Mostrarlos con las mismas
 * palabras convertiría una deducción en un hecho, y eso después se usa
 * para conversar sobre puntualidad.
 */
function Observado({
  turno,
  comparacion,
  rastros,
}: {
  turno: Parameters<typeof desfaseDelFichaje>[0];
  comparacion: { entrada: LadoObservado; salida: LadoObservado };
  rastros: number;
}) {
  const atraso = desfaseDelFichaje(turno, "entrada");

  if (comparacion.entrada.fuente === "nada" && rastros === 0) {
    return (
      <span className="text-muted-foreground block text-sm">
        Sin fichar y sin actividad registrada.
      </span>
    );
  }

  return (
    <span className="text-muted-foreground block text-sm text-pretty">
      <Lado
        lado={comparacion.entrada}
        verbo="Entró"
        ubicacion={turno.entradaUbicacion}
      />
      {comparacion.salida.instante && (
        <>
          {" · "}
          <Lado
            lado={comparacion.salida}
            verbo="salió"
            ubicacion={turno.salidaUbicacion}
          />
        </>
      )}
      {atraso !== null && atraso > NEGOCIO.turnos.minutosDeTolerancia && (
        <span className="text-destructive font-semibold">
          {" "}
          ({atraso} min tarde)
        </span>
      )}
    </span>
  );
}

function Lado({
  lado,
  verbo,
  ubicacion,
}: {
  lado: LadoObservado;
  verbo: string;
  ubicacion?: UbicacionDeFichaje;
}) {
  if (!lado.instante) return <span>sin {verbo.toLowerCase()}</span>;

  return (
    <span className={cn(lado.fuente === "rastro" && "italic")}>
      {lado.fuente === "fichaje"
        ? `${verbo} ${formatearHora(lado.instante)}`
        : `activ${verbo === "Entró" ? "o desde" : "o hasta"} ${formatearHora(lado.instante)}`}
      {/* Solo el fichaje trae ubicación: el rastro es deducido. Y lo
          fichado antes de pedirla no dice nada, que es lo cierto. */}
      {lado.fuente === "fichaje" && ubicacion && (
        <DondeFicho ubicacion={ubicacion} />
      )}
    </span>
  );
}

/**
 * "en la casa", "a 2,3 km de la casa (ver mapa)".
 *
 * El mapa va solo cuando hay algo que mirar —lejos, o una ubicación
 * dudosa—: al lado de cada "en la casa" sería un enlace que nadie toca.
 */
function DondeFicho({ ubicacion }: { ubicacion: UbicacionDeFichaje }) {
  const donde = dondeFicho(ubicacion);
  const texto = describirDondeFicho(donde);

  if (donde.tipo === "en_la_casa") return <> {texto}</>;
  if (!("lat" in ubicacion)) return <> ({texto})</>;

  return (
    <>
      {" "}
      <span className={cn(donde.tipo === "lejos" && "text-warning font-semibold")}>
        {texto}
      </span>{" "}
      <span className="whitespace-nowrap">
        (
        <a
          href={`https://www.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          ver mapa
        </a>
        )
      </span>
    </>
  );
}

/** El formulario de asignar, que aparece solo cuando se pide. */
function Asignar({
  fecha,
  gente,
  onListo,
}: {
  fecha: FechaISO;
  gente: { id: string; nombre: string }[];
  onListo: () => void;
}) {
  const id = useId();
  const { ocupado, ejecutar } = useAccion();
  const [perfilId, setPerfilId] = useState(gente[0]?.id ?? "");
  const [desde, setDesde] = useState("07:00");
  const [hasta, setHasta] = useState("15:00");

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    try {
      await ejecutar((repo) =>
        repo.turnos.crear({
          perfilId,
          fecha,
          desde,
          hasta,
          creadoEn: new Date().toISOString(),
        }),
      );
      toast.success("Turno asignado");
      onListo();
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos asignarlo.",
      );
    }
  }

  if (gente.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-pretty">
        Todavía no hay nadie en el equipo a quien asignarle un turno. Invítalos
        desde la pestaña de accesos.
      </p>
    );
  }

  return (
    <form
      onSubmit={guardar}
      className="bg-card space-y-3 rounded-xl border p-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-quien`}>Quién</Label>
        <select
          id={`${id}-quien`}
          value={perfilId}
          onChange={(e) => setPerfilId(e.target.value)}
          className="border-input bg-card h-11 w-full rounded-xl border px-3 text-base"
        >
          {gente.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre || "Sin nombre"}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-desde`}>Desde</Label>
          <Input
            id={`${id}-desde`}
            type="time"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-hasta`}>Hasta</Label>
          <Input
            id={`${id}-hasta`}
            type="time"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={ocupado}>
          <CalendarClock />
          Asignar
        </Button>
        <Button type="button" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
