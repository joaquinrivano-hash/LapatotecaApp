"use client";

import { Clock, LogIn, LogOut, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { cn } from "@/lib/utils";
import {
  fechaISO,
  formatearDiaMes,
  formatearHora,
  hoyISO,
} from "@/lib/utils/fecha";
import type { Cliente, ID, Linea, OrigenEstadia, Perro } from "@/lib/types";

export type EstadoAsistencia = "esperado" | "presente" | "cerrado" | "no_llego";

export interface ItemAsistencia {
  id: ID;
  linea: Linea;
  perro: Perro;
  cliente?: Cliente;
  estado: EstadoAsistencia;
  inicioProgramado: string;
  finProgramado: string;
  inicioReal?: string;
  finReal?: string;
  origen?: OrigenEstadia;
}

/**
 * Una tarjeta por perro, con UN botón grande.
 *
 * El staff usa esto con el celular en una mano y el perro en la otra: el botón
 * ocupa todo lo que puede y la acción es siempre la misma, "llegó" o "se fue".
 */
export function FilaAsistencia({
  item,
  ocupado,
  onLlego,
  onSeFue,
  onDeshacer,
}: {
  item: ItemAsistencia;
  ocupado?: boolean;
  onLlego?: (item: ItemAsistencia) => void;
  onSeFue?: (item: ItemAsistencia) => void;
  onDeshacer?: (item: ItemAsistencia) => void;
}) {
  const esHotel = item.linea === "hotel";

  return (
    <div className="bg-card flex items-center gap-3 rounded-2xl border border-border/70 p-3 shadow-sm">
      <PerroAvatar
        id={item.perro.id}
        nombre={item.perro.nombre}
        fotoUrl={item.perro.fotoUrl}
        tamano="lg"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-display truncate text-lg font-bold">
            {item.perro.nombre}
          </p>
          <Badge variant={esHotel ? "hotel" : "jardin"}>
            {esHotel ? "Hotel" : "Jardín"}
          </Badge>
          {item.origen === "dia_de_prueba" && (
            <Badge variant="warning">Prueba</Badge>
          )}
        </div>

        {item.cliente && (
          <p className="text-muted-foreground truncate text-sm">
            {item.cliente.nombre} {item.cliente.apellido}
          </p>
        )}

        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm tabular-nums">
          <Clock className="size-3.5 shrink-0" />
          <Horario item={item} />
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.estado === "esperado" && onLlego && (
          <Button
            size="lg"
            disabled={ocupado}
            onClick={() => onLlego(item)}
            className="min-w-28"
          >
            <LogIn />
            Llegó
          </Button>
        )}

        {item.estado === "presente" && onSeFue && (
          <Button
            size="lg"
            variant="accent"
            disabled={ocupado}
            onClick={() => onSeFue(item)}
            className="min-w-28"
          >
            <LogOut />
            Se fue
          </Button>
        )}

        {item.estado === "presente" && onDeshacer && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onDeshacer(item)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 text-xs font-semibold transition-colors"
          >
            <Undo2 className="size-3" />
            Deshacer
          </button>
        )}

        {item.estado === "cerrado" && (
          <Badge variant="secondary">
            {item.finReal ? formatearHora(item.finReal) : "Listo"}
          </Badge>
        )}

        {item.estado === "no_llego" && <Badge variant="warning">No llegó</Badge>}
      </div>
    </div>
  );
}

/**
 * El horario de un perro de jardín cabe en un día; el de hotel no.
 *
 * Mostrar "11:30 a 09:00" para una estadía que entra hoy y sale el miércoles
 * se lee como un error. Cuando el rango cruza días, manda la fecha.
 */
function Horario({ item }: { item: ItemAsistencia }) {
  const inicio = item.inicioReal ?? item.inicioProgramado;
  const fin = item.finReal ?? item.finProgramado;
  const cruzaDias = fechaISO(inicio) !== fechaISO(fin);

  if (item.estado === "cerrado") {
    return cruzaDias ? (
      <span>Se fue {formatearHora(fin)}</span>
    ) : (
      <span>
        {formatearHora(inicio)} a {formatearHora(fin)}
      </span>
    );
  }

  if (item.estado === "presente") {
    // Estando el perro adentro, lo que el staff necesita saber es cuándo lo
    // vienen a buscar. La hora de llegada ya cumplió su función.
    if (cruzaDias) {
      const salida = fechaISO(item.finProgramado);
      return (
        <span>
          Sale{" "}
          {salida === hoyISO() ? "hoy" : formatearDiaMes(item.finProgramado)}
        </span>
      );
    }

    return (
      <span>
        {item.inicioReal ? `Llegó ${formatearHora(item.inicioReal)}` : formatearHora(inicio)}
        <span className={cn("text-muted-foreground/70")}>
          {" · sale "}
          {formatearHora(item.finProgramado)}
        </span>
      </span>
    );
  }

  return cruzaDias ? (
    <span>
      Entra {formatearHora(item.inicioProgramado)} · sale{" "}
      {formatearDiaMes(item.finProgramado)}
    </span>
  ) : (
    <span>
      {formatearHora(item.inicioProgramado)} a{" "}
      {formatearHora(item.finProgramado)}
    </span>
  );
}
