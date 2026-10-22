"use client";

import { Plus } from "lucide-react";

import { NEGOCIO } from "@/lib/config/negocio";
import {
  bloquesDeLaPlanilla,
  coloresPorPersona,
  columnasPorDia,
  filasDelTurno,
  ordenarTurnosDelDia,
  rangoDeLaPlanilla,
} from "@/lib/rules/turnos";
import type { DiaDeTurnos, TurnoConPersona } from "@/lib/servicios/turnos";
import {
  formatearDiaMesCorto,
  formatearDiaSemanaCorto,
  minutosDesdeHHMM,
} from "@/lib/utils/fecha";
import { cn } from "@/lib/utils";
import type { FechaISO, ID } from "@/lib/types";

/**
 * Seis fondos sacados de los tres colores de marca en dos profundidades.
 *
 * El color es una AYUDA, no el dato: el nombre va escrito en el bloque. Si
 * el color fuera lo único, la planilla no se podría leer ni en blanco y
 * negro ni con daltonismo, y acá se mira para decidir quién viene mañana.
 */
const COLORES = [
  "bg-[#fbd9e4] text-[#8f1c48] ring-[#ef9eba]",
  "bg-[#fae7cd] text-[#7a4d00] ring-[#e8bf84]",
  "bg-[#dde4f3] text-[#1b3573] ring-[#a9bce0]",
  "bg-[#f6c2d5] text-[#73173a] ring-[#e07ba1]",
  "bg-[#f3d6a6] text-[#5f3c00] ring-[#c99a3c]",
  "bg-[#c6d2ea] text-[#152a5c] ring-[#8fa5d2]",
];

/**
 * Las alturas de la grilla, en rem.
 *
 * Fijas y no automáticas porque la columna de las horas vive FUERA del
 * contenedor que se desplaza —ver abajo— y las dos tienen que calzar fila
 * por fila. Con alturas automáticas, un nombre largo en el encabezado
 * correría los días medio bloque respecto de sus horas.
 */
const ALTO = { dia: 2.75, turno: 1.25, bloque: 1.5, pie: 2 };

/**
 * La semana como grilla: una columna por turno, una fila por media hora.
 *
 * Contesta una pregunta que la vista por día contesta mal: **mirar la
 * semana entera y ver dónde queda un hueco**. Para eso hay que poder
 * comparar los días de un vistazo, y eso es lo que una grilla hace y una
 * lista no.
 *
 * Tiene el costo que la vista por día evitaba: en el celular se desplaza
 * de lado. Por eso las dos conviven — esta para armar la semana, la otra
 * para ver cómo le fue a cada turno — y no se reemplazó una por la otra.
 *
 * "Turno 1" y "Turno 2" son el ORDEN en que empiezan, no un campo que
 * alguien tenga que elegir al asignar.
 */
export function GrillaDeTurnos({
  semana,
  seleccionado,
  onSeleccionar,
  onAsignar,
}: {
  semana: DiaDeTurnos[];
  seleccionado: ID | null;
  onSeleccionar: (turno: TurnoConPersona | null) => void;
  onAsignar: (fecha: FechaISO) => void;
}) {
  const todos = semana.flatMap((d) => d.turnos.map((t) => t.turno));
  const rango = rangoDeLaPlanilla(
    todos,
    minutosDesdeHHMM(NEGOCIO.turnos.horasQueSeCubren.desde),
    minutosDesdeHHMM(NEGOCIO.turnos.horasQueSeCubren.hasta),
  );
  const bloques = bloquesDeLaPlanilla(rango);
  const porDia = columnasPorDia(semana.map((d) => d.turnos.length));
  const colores = coloresPorPersona(
    todos.map((t) => t.perfilId),
    COLORES.length,
  );

  // Las dos filas de encabezado, y después un bloque por fila.
  const FILAS_CABECERA = 2;

  return (
    <div className="space-y-3">
      {/* La columna de las horas va aparte del contenedor que se desplaza.
          Estaba adentro, pegada con `sticky left-0`, y NO se quedaba: un
          ítem de grilla queda confinado a su propia celda, así que se
          desplazaba con todo lo demás y al llegar al viernes ya no se sabía
          qué hora era. Medido en el navegador: se iba a x = -78. */}
      <div className="flex">
        <div className="shrink-0">
          <div style={{ height: `${ALTO.dia + ALTO.turno}rem` }} />
          {bloques.map((b) => (
            <div
              key={`hora-${b.minutoDelDia}`}
              className={cn(
                "text-muted-foreground w-13 pr-2 text-right text-xs tabular-nums",
                b.minutoDelDia % 60 === 0 && "border-border/60 border-t",
              )}
              style={{ height: `${ALTO.bloque}rem` }}
            >
              {b.minutoDelDia % 60 === 0 ? b.hora : ""}
            </div>
          ))}
          <div style={{ height: `${ALTO.pie}rem` }} />
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            className="grid text-xs"
            style={{
              // `minmax` y no un ancho fijo: en el computador la semana entera
              // cabe y las columnas se reparten el espacio, que es para lo que
              // sirve mirarla en grilla; en el celular el mínimo manda y se
              // desplaza de lado, que es el costo conocido de esta vista.
              gridTemplateColumns: `repeat(${semana.length * porDia}, minmax(4.5rem, 1fr))`,
              gridTemplateRows: `${ALTO.dia}rem ${ALTO.turno}rem repeat(${bloques.length}, ${ALTO.bloque}rem) ${ALTO.pie}rem`,
            }}
          >
            {semana.map((dia, i) => (
              <div
                key={`dia-${dia.fecha}`}
                className="border-border/60 flex flex-col items-center justify-center border-l text-center"
                style={{
                  gridColumn: `${1 + i * porDia} / span ${porDia}`,
                  gridRow: 1,
                }}
              >
                <span className="font-display font-bold first-letter:uppercase">
                  {formatearDiaSemanaCorto(`${dia.fecha}T12:00:00Z`)}
                </span>
                <span className="text-muted-foreground">
                  {formatearDiaMesCorto(`${dia.fecha}T12:00:00Z`)}
                </span>
              </div>
            ))}

            {semana.flatMap((dia, i) =>
              Array.from({ length: porDia }, (_, j) => (
                <div
                  key={`col-${dia.fecha}-${j}`}
                  className={cn(
                    "text-muted-foreground border-border/60 border-b text-center",
                    j === 0 && "border-l",
                  )}
                  style={{ gridColumn: 1 + i * porDia + j, gridRow: 2 }}
                >
                  Turno {j + 1}
                </div>
              )),
            )}

            {/* El rayado de las horas en punto, para seguir la fila de
              izquierda a derecha sin perderla. Solo las en punto: una línea
              cada media hora convierte el fondo en un rallador. */}
            {bloques.map((b, fila) => (
              <div
                key={`raya-${b.minutoDelDia}`}
                aria-hidden
                className={cn(
                  b.minutoDelDia % 60 === 0 && "border-border/60 border-t",
                )}
                style={{
                  gridColumn: `1 / span ${semana.length * porDia}`,
                  gridRow: FILAS_CABECERA + 1 + fila,
                }}
              />
            ))}

            {semana.map((dia, i) => (
              <div
                key={`sep-${dia.fecha}`}
                aria-hidden
                className="border-border/60 border-l"
                style={{
                  gridColumn: 1 + i * porDia,
                  gridRow: `${FILAS_CABECERA + 1} / span ${bloques.length}`,
                }}
              />
            ))}

            {/* Los huecos: nadie cubriendo con perros en la casa.

              Solo en los días que SÍ tienen a alguien asignado, igual que en
              la vista por día: pintar de rojo una semana vacía entera enseña
              a ignorar el rojo justo antes de que aparezca el que importa. */}
            {semana.flatMap((dia, i) =>
              dia.turnos.length === 0
                ? []
                : dia.huecos
                    .map((h) => {
                      const filas = filasDelTurno(h, rango);
                      if (!filas || h.perros === 0) return null;
                      return (
                        <div
                          key={`hueco-${dia.fecha}-${h.desde}`}
                          className="bg-destructive/10 text-destructive pointer-events-none flex items-start justify-center pt-0.5 text-[0.65rem] font-semibold"
                          style={{
                            gridColumn: `${1 + i * porDia} / span ${porDia}`,
                            gridRow: `${FILAS_CABECERA + 1 + filas.desde} / span ${filas.hasta - filas.desde}`,
                          }}
                          title={`Nadie cubre de ${h.desde} a ${h.hasta}, y hay hasta ${h.perros} ${h.perros === 1 ? "perro" : "perros"}.`}
                        >
                          sin nadie
                        </div>
                      );
                    })
                    .filter(Boolean),
            )}

            {semana.flatMap((dia, i) =>
              ordenarTurnosDelDia(
                dia.turnos.map((t) => ({
                  ...t,
                  desde: t.turno.desde,
                  hasta: t.turno.hasta,
                })),
              )
                .map((entrada, j) => {
                  const filas = filasDelTurno(entrada.turno, rango);
                  if (!filas) return null;
                  const color =
                    COLORES[colores.get(entrada.turno.perfilId) ?? 0];
                  const nombre = entrada.persona?.nombre || "Sin cuenta";
                  return (
                    <button
                      key={entrada.turno.id}
                      type="button"
                      onClick={() =>
                        onSeleccionar(
                          seleccionado === entrada.turno.id ? null : entrada,
                        )
                      }
                      title={`${nombre}, ${entrada.turno.desde} a ${entrada.turno.hasta}`}
                      className={cn(
                        // `flex-col` a propósito: un <button> centra su
                        // contenido vertical por omisión, y el nombre quedaba
                        // flotando en la mitad del bloque en vez de arriba,
                        // donde empieza el turno.
                        "m-px flex flex-col items-start overflow-hidden rounded-md px-1 pt-0.5 text-left leading-tight font-semibold",
                        color,
                        seleccionado === entrada.turno.id &&
                          "ring-foreground ring-2",
                      )}
                      style={{
                        gridColumn: 1 + i * porDia + j,
                        gridRow: `${FILAS_CABECERA + 1 + filas.desde} / span ${filas.hasta - filas.desde}`,
                      }}
                    >
                      <span className="w-full truncate">{nombre}</span>
                      <span className="w-full truncate text-[0.65rem] font-normal tabular-nums opacity-80">
                        {entrada.turno.desde}–{entrada.turno.hasta}
                      </span>
                    </button>
                  );
                })
                .filter(Boolean),
            )}

            {/* Asignar donde se está mirando: el día ya es la columna, así que
              el botón no tiene que volver a preguntarlo. */}
            {semana.map((dia, i) => (
              <div
                key={`mas-${dia.fecha}`}
                className="border-border/60 border-t border-l p-0.5"
                style={{
                  gridColumn: `${1 + i * porDia} / span ${porDia}`,
                  gridRow: FILAS_CABECERA + 1 + bloques.length,
                }}
              >
                <button
                  type="button"
                  onClick={() => onAsignar(dia.fecha)}
                  aria-label={`Asignar turno el ${formatearDiaMesCorto(`${dia.fecha}T12:00:00Z`)}`}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-full w-full items-center justify-center rounded-md transition-colors"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {colores.size > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...colores].map(([perfilId, indice]) => {
            const nombre =
              semana
                .flatMap((d) => d.turnos)
                .find((t) => t.turno.perfilId === perfilId)?.persona?.nombre ??
              "Sin cuenta";
            return (
              <li key={perfilId} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn("size-3 rounded-sm", COLORES[indice])}
                />
                {nombre}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
