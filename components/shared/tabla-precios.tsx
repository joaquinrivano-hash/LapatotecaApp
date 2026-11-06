import { NEGOCIO } from "@/lib/config/negocio";
import { PASEOS_POR_PACK, PRECIOS } from "@/lib/config/precios";
import { formatearCLP } from "@/lib/utils/moneda";
import { cn } from "@/lib/utils";

/**
 * El afiche de precios, en una sola definición.
 *
 * Los mismos números viven en la landing (para quien todavía no es cliente)
 * y en el portal (para quien está agendando). Escritos dos veces se
 * separarían el día que cambie una tarifa: no porque alguien se olvide del
 * config —los montos salen de `PRECIOS` igual— sino porque una tabla puede
 * ganar una fila y la otra no.
 *
 * Una fila es [concepto, precio] o [concepto, precio, precioEnLaOtraColumna]
 * cuando el servicio es una matriz. El spa y el traslado lo son, y eso no
 * es un detalle de diseño: con un "precios desde" el dueño no sabe cuál es
 * el suyo.
 */
export type FilaDePrecio =
  | readonly [string, number]
  | readonly [string, number, number];

export interface AficheDePrecios {
  /** Encabezados de las dos columnas de precio, si es una matriz. */
  columnas?: readonly [string, string];
  filas: readonly FilaDePrecio[];
  /** Packs y combinaciones, que no son una fila más de la tabla. */
  extras?: readonly string[];
  nota?: string;
}

export const PRECIOS_DEL_AFICHE = {
  spa: {
    columnas: ["Pequeño", "Mediano"],
    filas: [
      ["Pelo corto", PRECIOS.spa.peloCorto.chico, PRECIOS.spa.peloCorto.grande],
      ["Pelo largo", PRECIOS.spa.peloLargo.chico, PRECIOS.spa.peloLargo.grande],
    ],
    nota: `Pequeño bajo ${NEGOCIO.spa.pesoChicoBajoKg} kg; mediano de ${NEGOCIO.spa.pesoChicoBajoKg} a ${NEGOCIO.spa.pesoMaximoKg} kg.`,
  },
  paseo: {
    filas: [
      ["Cada 15 minutos", PRECIOS.paseo[15]],
      ["Media hora", PRECIOS.paseo[30]],
    ],
    extras: [
      `${PASEOS_POR_PACK} paseos de 15 min: ${formatearCLP(PRECIOS.paseoPack3[15])}`,
      `${PASEOS_POR_PACK} de media hora: ${formatearCLP(PRECIOS.paseoPack3[30])}`,
    ],
    nota: "Se envían fotos y comprobante del tiempo total del paseo.",
  },
  traslado: {
    columnas: ["Normal", "Punta"],
    filas: PRECIOS.traslado.tramos.map(
      (t, i) =>
        [
          `${i === 0 ? 0 : PRECIOS.traslado.tramos[i - 1].hastaKm} a ${t.hastaKm} km`,
          t.normal,
          t.punta,
        ] as const,
    ),
    nota: `Punta: ${NEGOCIO.traslado.horariosPunta
      .map((h) => `${h.desde} a ${h.hasta}`)
      .join(" y ")}.`,
  },
} satisfies Record<"spa" | "paseo" | "traslado", AficheDePrecios>;

export type TipoConAfiche = keyof typeof PRECIOS_DEL_AFICHE;

/**
 * La tabla de referencia que se muestra al agendar.
 *
 * Es referencial y la pantalla lo dice: el precio final depende del pelo y
 * del peso del perro, o de los kilómetros y la hora del viaje, y eso se
 * verifica acá. Mostrarla igual es lo que evita que el dueño agende a
 * ciegas y después pregunte por qué el valor no es el que pensaba.
 */
export function TablaPrecios({
  tipo,
  className,
}: {
  tipo: TipoConAfiche;
  className?: string;
}) {
  const afiche: AficheDePrecios = PRECIOS_DEL_AFICHE[tipo];
  const columnas = afiche.columnas;

  return (
    <div
      className={cn(
        "border-border bg-secondary/40 rounded-2xl border p-3",
        className,
      )}
    >
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
        Precios de referencia
      </p>

      {columnas && (
        <div className="text-muted-foreground mb-1 flex items-baseline gap-3 text-xs">
          <span className="flex-1" />
          <span className="w-20 text-right">{columnas[0]}</span>
          <span className="w-20 text-right">{columnas[1]}</span>
        </div>
      )}

      <dl className="divide-border/70 divide-y">
        {afiche.filas.map((fila) => (
          <div
            key={fila[0]}
            className="flex items-baseline gap-3 py-1.5 text-sm"
          >
            <dt className="flex-1 text-pretty">{fila[0]}</dt>
            <dd className="w-20 text-right font-semibold tabular-nums">
              {formatearCLP(fila[1])}
            </dd>
            {columnas && (
              <dd className="w-20 text-right font-semibold tabular-nums">
                {formatearCLP(fila[2] ?? fila[1])}
              </dd>
            )}
          </div>
        ))}
      </dl>

      {afiche.extras && (
        <ul className="text-muted-foreground mt-2 space-y-0.5 text-sm">
          {afiche.extras.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {afiche.nota && (
        <p className="text-muted-foreground mt-2 text-xs text-pretty">
          {afiche.nota}
        </p>
      )}
    </div>
  );
}
