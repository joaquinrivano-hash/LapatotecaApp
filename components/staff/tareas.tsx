"use client";

/**
 * Las piezas de la pantalla de tareas del staff.
 *
 * Cada fila tiene dos blancos, no tres: el círculo de la izquierda marca
 * (es la acción del día, de un toque y con el perro en brazos) y los tres
 * puntos de la derecha abren las otras opciones. Las instrucciones se
 * despliegan tocando el texto, que es un botón aparte: un botón adentro de
 * otro es HTML inválido y ya nos pasó en la tarjeta de asistencia.
 */

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Ellipsis,
  MessageCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { cn } from "@/lib/utils";
import { formatearDiaMes, formatearHora } from "@/lib/utils/fecha";
import type { EstadoTarea, Perro, RegistroDeTarea } from "@/lib/types";

/* ── El círculo ────────────────────────────────────────────────────── */

const ESTILO_CIRCULO: Record<EstadoTarea, string> = {
  pendiente: "border-border bg-card text-transparent",
  en_proceso: "border-warning bg-warning/15 text-warning",
  hecha: "border-success bg-success text-white",
  no_se_hizo: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

function IconoEstado({ estado }: { estado: EstadoTarea }) {
  if (estado === "en_proceso") return <Clock3 className="size-5" />;
  if (estado === "no_se_hizo") return <X className="size-5" />;
  return <Check className="size-5" strokeWidth={3} />;
}

/** Quién y a qué hora: lo que el turno siguiente quiere saber. */
export function FirmaDelRegistro({ registro }: { registro?: RegistroDeTarea }) {
  if (!registro || registro.estado === "pendiente") return null;
  return (
    <span className="text-muted-foreground text-xs">
      {registro.autorStaff} · {formatearHora(registro.marcadoEn)}
    </span>
  );
}

export interface FilaTareaProps {
  titulo: string;
  estado: EstadoTarea;
  registro?: RegistroDeTarea;
  instrucciones?: string;
  /** "Viene del lunes 26", por ejemplo. */
  etiqueta?: string;
  ocupado?: boolean;
  /** El toque del círculo: alterna entre hecha y pendiente. */
  onAlternar: () => void;
  onOpciones?: () => void;
  children?: React.ReactNode;
}

export function FilaTarea({
  titulo,
  estado,
  registro,
  instrucciones,
  etiqueta,
  ocupado,
  onAlternar,
  onOpciones,
  children,
}: FilaTareaProps) {
  const [abierta, setAbierta] = useState(false);
  const hecha = estado === "hecha";

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border/70 p-3 shadow-sm transition-colors",
        hecha && "bg-success/5 border-success/30",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onAlternar}
          disabled={ocupado}
          aria-label={hecha ? `Desmarcar ${titulo}` : `Marcar ${titulo} como hecha`}
          aria-pressed={hecha}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-all active:scale-95 disabled:opacity-60",
            ESTILO_CIRCULO[estado],
          )}
        >
          <IconoEstado estado={estado} />
        </button>

        <div className="min-w-0 flex-1 pt-1">
          {instrucciones ? (
            <button
              type="button"
              onClick={() => setAbierta((a) => !a)}
              className="flex w-full items-start gap-1 text-left"
              aria-expanded={abierta}
            >
              <span
                className={cn(
                  "font-semibold text-pretty",
                  hecha && "text-muted-foreground line-through decoration-success/50",
                )}
              >
                {titulo}
              </span>
              <ChevronDown
                className={cn(
                  "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
                  abierta && "rotate-180",
                )}
              />
            </button>
          ) : (
            <p
              className={cn(
                "font-semibold text-pretty",
                hecha && "text-muted-foreground line-through decoration-success/50",
              )}
            >
              {titulo}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {etiqueta && (
              <span className="text-warning text-xs font-semibold">{etiqueta}</span>
            )}
            {estado === "en_proceso" && (
              <span className="text-warning text-xs font-semibold">En proceso</span>
            )}
            <FirmaDelRegistro registro={registro} />
          </div>

          {registro?.nota && registro.estado !== "pendiente" && (
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              {estado === "no_se_hizo" ? "No se hizo: " : ""}
              {registro.nota}
            </p>
          )}

          {abierta && instrucciones && (
            <p className="bg-secondary/60 mt-2 rounded-xl p-2.5 text-sm text-pretty">
              {instrucciones}
            </p>
          )}

          {children}
        </div>

        {onOpciones && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpciones}
            aria-label={`Más opciones para ${titulo}`}
            className="shrink-0"
          >
            <Ellipsis />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Quién no comió ────────────────────────────────────────────────── */

/**
 * Por omisión comieron todos, que es lo normal: se toca solo al que no.
 * Así el reporte dice "Desayunaron casi todos (faltó Mara)", igual que en
 * el grupo.
 */
export function QuienNoComio({
  perros,
  seleccionados,
  ocupado,
  onCambiar,
}: {
  perros: Perro[];
  seleccionados: string[];
  ocupado?: boolean;
  onCambiar: (ids: string[]) => void;
}) {
  // Con veinte perros en la casa, los veinte botones de golpe tapan el
  // resto de la ronda: se abren solo cuando alguien no comió.
  const [abierto, setAbierto] = useState(false);
  if (perros.length === 0) return null;

  const nombres = perros
    .filter((p) => seleccionados.includes(p.id))
    .map((p) => p.nombre);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-primary mt-1 text-sm font-semibold"
      >
        {nombres.length
          ? `No comió: ${nombres.join(", ")} · cambiar`
          : "¿Alguno no comió?"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-semibold">
          Toca a los que no comieron.
        </p>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-primary text-sm font-semibold"
        >
          Listo
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {perros.map((perro) => {
          const marcado = seleccionados.includes(perro.id);
          return (
            <button
              key={perro.id}
              type="button"
              disabled={ocupado}
              onClick={() =>
                onCambiar(
                  marcado
                    ? seleccionados.filter((id) => id !== perro.id)
                    : [...seleccionados, perro.id],
                )
              }
              aria-pressed={marcado}
              className={cn(
                "flex items-center gap-1.5 rounded-full border-2 py-1 pr-3 pl-1 text-sm font-semibold transition-all active:scale-[0.98]",
                marcado
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <PerroAvatar
                id={perro.id}
                nombre={perro.nombre}
                fotoUrl={perro.fotoUrl}
                tamano="sm"
              />
              {perro.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Las otras opciones ────────────────────────────────────────────── */

export function HojaDeOpciones({
  abierta,
  titulo,
  estado,
  notaInicial,
  ocupado,
  onCerrar,
  onElegir,
}: {
  abierta: boolean;
  titulo: string;
  estado: EstadoTarea;
  notaInicial?: string;
  ocupado?: boolean;
  onCerrar: () => void;
  onElegir: (estado: EstadoTarea, nota?: string) => void;
}) {
  const [nota, setNota] = useState(notaInicial ?? "");

  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent className="space-y-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="px-0">
          <SheetTitle className="pr-8">{titulo}</SheetTitle>
          <SheetDescription>
            Si no se pudo, cuéntale al que viene por qué: así no lo intenta de
            nuevo bajo la lluvia.
          </SheetDescription>
        </SheetHeader>

        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Una nota (opcional): falta cloro, si para de llover, no estaba sucio…"
          rows={2}
        />

        <div className="grid grid-cols-1 gap-2 pt-2">
          <Button
            size="lg"
            disabled={ocupado}
            onClick={() => onElegir("hecha", nota)}
          >
            <Check /> Hecha
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={ocupado}
            onClick={() => onElegir("en_proceso", nota)}
          >
            <Clock3 /> En proceso
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={ocupado || !nota.trim()}
            onClick={() => onElegir("no_se_hizo", nota)}
          >
            <X /> No se pudo hoy
          </Button>
          {estado !== "pendiente" && (
            <Button
              variant="ghost"
              disabled={ocupado}
              onClick={() => onElegir("pendiente")}
            >
              Volver a pendiente
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Anotar: extras y novedades ────────────────────────────────────── */

export function ListaDeAnotaciones({
  registros,
  usuarioId,
  autor,
  ocupado,
  onBorrar,
}: {
  registros: RegistroDeTarea[];
  usuarioId?: string;
  autor: string;
  ocupado?: boolean;
  onBorrar: (id: string) => void;
}) {
  if (registros.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {registros.map((r) => {
        // Cada uno borra lo suyo, igual que en la base.
        const propio = usuarioId ? r.autorId === usuarioId : r.autorStaff === autor;
        return (
          <li
            key={r.id}
            className="bg-secondary/50 flex items-start gap-2 rounded-xl px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-pretty">{r.nota}</p>
              <FirmaDelRegistro registro={r} />
            </div>
            {propio && (
              <Button
                variant="ghost"
                size="icon"
                className="-my-1 size-9 shrink-0"
                disabled={ocupado}
                onClick={() => onBorrar(r.id)}
                aria-label="Borrar"
              >
                <X className="size-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── El reporte para el grupo ──────────────────────────────────────── */

export function HojaDeResumen({
  abierta,
  texto,
  onCerrar,
}: {
  abierta: boolean;
  texto: string;
  onCerrar: () => void;
}) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado. Pégalo en el grupo.");
    } catch {
      toast.error("No pudimos copiarlo. Mantén apretado el texto para copiarlo a mano.");
    }
  }

  // El enlace se abre en el mismo toque: después de un `await` el celular
  // bloquea la ventana nueva.
  const enlace = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="px-0">
          <SheetTitle>Reporte para el grupo</SheetTitle>
          <SheetDescription>
            Con todo lo del día hasta ahora. Acuérdate de mandar la foto de la
            pizarra junto con el texto.
          </SheetDescription>
        </SheetHeader>
        <pre className="bg-secondary/50 max-h-[45svh] overflow-y-auto rounded-2xl p-3 font-sans text-sm whitespace-pre-wrap">
          {texto}
        </pre>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button asChild size="lg">
            <a href={enlace} target="_blank" rel="noreferrer">
              <MessageCircle /> Mandar por WhatsApp
            </a>
          </Button>
          <Button size="lg" variant="outline" onClick={copiar}>
            <Copy /> Copiar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "Viene del lunes 26": un encargo que se arrastra. */
export function etiquetaDeArrastre(desde?: string): string | undefined {
  return desde
    ? `Viene del ${formatearDiaMes(`${desde}T12:00:00Z`)}`
    : undefined;
}
