"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { porcentaje } from "@/lib/rules/horarios";
import type { FranjaHoraria, RepartoDePuntualidad } from "@/lib/rules/horarios";
import type { AnalisisDeHorarios } from "@/lib/servicios/horarios";
import { cn } from "@/lib/utils";

/**
 * A qué hora llegan y a qué hora los buscan.
 *
 * Son **dos paneles y no dos series en un mismo gráfico**, a propósito. El
 * tablero ya tiene arriba un gráfico donde el ámbar es jardín y el marino es
 * hotel; meter acá dos colores para llegadas y retiros haría que alguien
 * leyera "ámbar = jardín" sin querer. Con un panel por pregunta cada uno
 * tiene una sola serie, el título dice cuál es, y no hay identidad de color
 * que malinterpretar.
 *
 * Comparten la escala vertical: si no, un panel con 3 retiros se vería igual
 * de alto que otro con 30 y la forma del día se perdería.
 */
export function HorariosDelDia({
  analisis,
  className,
}: {
  analisis: AnalisisDeHorarios;
  className?: string;
}) {
  const [detalle, setDetalle] = React.useState(false);
  const { franjas } = analisis;

  /**
   * Sin movimiento todavía.
   *
   * Devolver null dejaba la tarjeta con su título y su explicación y NADA
   * adentro, que no se lee como "no ha pasado nada" sino como "esto está
   * roto". Se ve apenas se entra a una casa recién abierta, que es
   * justamente la primera impresión que no conviene regalar.
   */
  if (franjas.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm text-pretty">
        Todavía no hay jornadas cerradas en este periodo. Apenas el equipo
        marque la primera llegada y la primera salida, acá aparece la forma
        del día. 🐾
      </p>
    );
  }

  const techo = Math.max(
    ...franjas.map((f) => Math.max(f.llegadas, f.retiros)),
  );

  return (
    <div className={cn("space-y-4", className)}>
      <Panel
        titulo="Llegadas"
        franjas={franjas}
        valor={(f) => f.llegadas}
        techo={techo}
      />
      <Panel
        titulo="Retiros"
        franjas={franjas}
        valor={(f) => f.retiros}
        techo={techo}
      />

      <EjeDeHoras franjas={franjas} />

      <button
        type="button"
        onClick={() => setDetalle((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-semibold transition-colors"
      >
        <ChevronDown
          className={cn("size-4 transition-transform", detalle && "rotate-180")}
        />
        {detalle ? "Ocultar" : "¿Cuánto se parece a lo agendado?"}
      </button>

      {detalle && <Puntualidad analisis={analisis} />}
    </div>
  );
}

/**
 * Un panel: una pregunta, una serie, un color.
 *
 * El alto se mide contra el techo COMPARTIDO entre los dos paneles, no contra
 * el máximo propio: la gracia es ver que las llegadas se amontonan en la
 * mañana y los retiros en la tarde, y eso se pierde si cada panel se escala
 * solo.
 */
function Panel({
  titulo,
  franjas,
  valor,
  techo,
}: {
  titulo: string;
  franjas: FranjaHoraria[];
  valor: (f: FranjaHoraria) => number;
  techo: number;
}) {
  const [activa, setActiva] = React.useState<number | null>(null);
  const pico = Math.max(...franjas.map(valor));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{titulo}</p>
        {activa !== null && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {franjas[activa].hora}:00 · {valor(franjas[activa])}
          </p>
        )}
      </div>

      {/* El `pt-4` reserva el espacio de la etiqueta del pico. Sin él, la
          barra más alta llega al techo y el número queda ENCIMA de la barra:
          se vio así al mirarlo. El panel con el pico más bajo no lo notaba,
          que es justo por lo que un gráfico hay que abrirlo y no solo
          escribirlo. */}
      <div
        className="mt-1 flex h-20 items-end gap-0.5 pt-4"
        onPointerLeave={() => setActiva(null)}
      >
        {franjas.map((franja, i) => {
          const n = valor(franja);
          const esPico = n === pico && n > 0;
          return (
            <button
              key={franja.hora}
              type="button"
              aria-label={`${franja.hora}:00, ${n}`}
              onPointerEnter={() => setActiva(i)}
              onClick={() => setActiva(i)}
              className="group relative flex h-full flex-1 items-end"
            >
              {/* El número solo en el pico: uno en cada barra es ruido y
                  además no cabe en un teléfono. */}
              {esPico && (
                <span className="text-muted-foreground absolute inset-x-0 -top-4 text-center text-[10px] font-semibold tabular-nums">
                  {n}
                </span>
              )}
              <span
                className={cn(
                  "w-full rounded-t transition-opacity",
                  activa !== null && activa !== i && "opacity-40",
                )}
                style={{
                  height: n === 0 ? "2px" : `${(n / techo) * 100}%`,
                  background:
                    n === 0 ? "var(--border)" : "var(--chart-2)",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Las horas van una vez abajo: los dos paneles comparten el eje. */
function EjeDeHoras({ franjas }: { franjas: FranjaHoraria[] }) {
  const paso = Math.max(1, Math.ceil(franjas.length / 6));

  return (
    <div className="flex gap-0.5">
      {franjas.map((franja, i) => (
        <span
          key={franja.hora}
          className="text-muted-foreground flex-1 text-center text-[10px] tabular-nums"
        >
          {i % paso === 0 ? `${franja.hora}` : ""}
        </span>
      ))}
    </div>
  );
}

/**
 * El detalle: cuánto de lo que pasó se parece a lo agendado.
 *
 * Son porcentajes, no una serie en el tiempo, así que van como números y no
 * como gráfico. Un gráfico de tres barras para tres cifras es decorar.
 */
function Puntualidad({ analisis }: { analisis: AnalisisDeHorarios }) {
  const { llegadas, retiros, marcadosADestiempo, registros } = analisis;

  return (
    <div className="space-y-3">
      <Reparto
        titulo="Llegadas"
        reparto={llegadas}
        adelante="Antes de lo agendado"
        atras="Después de lo agendado"
      />
      <Reparto
        titulo="Retiros"
        reparto={retiros}
        adelante="Lo buscaron antes"
        atras="Se quedaron de más"
      />

      {/* No es un dato sobre los perros sino sobre cuánto creerle a todo lo
          de arriba. Se muestra solo cuando hay algo que advertir. */}
      {marcadosADestiempo > 0 && (
        <p className="text-muted-foreground bg-secondary/50 rounded-lg p-2.5 text-xs text-pretty">
          {porcentaje(marcadosADestiempo, registros)}% de los registros se
          marcaron a destiempo ({marcadosADestiempo} de {registros}). Esas
          horas son las que el equipo alcanzó a anotar, no necesariamente las
          que pasaron.
        </p>
      )}
    </div>
  );
}

function Reparto({
  titulo,
  reparto,
  adelante,
  atras,
}: {
  titulo: string;
  reparto: RepartoDePuntualidad;
  adelante: string;
  atras: string;
}) {
  return (
    <div className="border-border/70 rounded-xl border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      <dl className="mt-1.5 grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
        <Cifra etiqueta={adelante} valor={reparto.temprano} total={reparto.total} />
        <Cifra etiqueta="A la hora" valor={reparto.a_la_hora} total={reparto.total} />
        <Cifra etiqueta={atras} valor={reparto.tarde} total={reparto.total} />
      </dl>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  total,
}: {
  etiqueta: string;
  valor: number;
  total: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-muted-foreground text-xs text-pretty">{etiqueta}</dt>
      <dd className="font-display text-lg font-bold tabular-nums">
        {porcentaje(valor, total)}%{" "}
        <span className="text-muted-foreground text-xs font-normal">
          ({valor})
        </span>
      </dd>
    </div>
  );
}
