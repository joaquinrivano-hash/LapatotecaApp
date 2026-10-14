"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { describirDesfase } from "@/lib/rules/marca-de-asistencia";
import { fechaISO, formatearHora, instanteEnHora } from "@/lib/utils/fecha";
import type { InstanteISO } from "@/lib/types";

/**
 * Corregir la hora de una llegada o un retiro ya marcados.
 *
 * El check-in es de un toque y así se queda: el caso normal es marcar en el
 * momento, con el perro en la puerta. Esto es para el otro caso — marcar a
 * destiempo, con las manos ocupadas, y arreglarlo cuando se puede.
 *
 * Lo que se corrige es la hora REAL, que es la que cobra. Cuándo se apretó el
 * botón no se toca: ese dato dice qué tan al día se está marcando y no tiene
 * por qué editarse.
 */
export function AjustarHora({
  que,
  real,
  marcadaEn,
  ocupado,
  onGuardar,
}: {
  que: "llegada" | "retiro";
  real: InstanteISO;
  marcadaEn?: InstanteISO;
  ocupado?: boolean;
  onGuardar: (nueva: InstanteISO) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [hora, setHora] = useState(() => formatearHora(real));

  const desfase = describirDesfase(real, marcadaEn);
  const etiqueta = que === "llegada" ? "Llegó" : "Se fue";

  function guardar() {
    // La fecha la manda el instante que ya estaba: una estadía de hotel puede
    // haber empezado anteayer, y rearmar la hora sobre "hoy" la correría de
    // día sin que nadie lo pidiera.
    onGuardar(instanteEnHora(fechaISO(real), hora));
    setAbierto(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // El cuerpo de la tarjeta abre la ficha del perro. Sin cortar el
          // evento acá, tocar la hora abría las dos cosas encima: la ficha
          // tapando la hoja de ajuste. Son blancos separados y tienen que
          // seguir siéndolo.
          e.stopPropagation();
          setHora(formatearHora(real));
          setAbierto(true);
        }}
        className="decoration-muted-foreground/40 underline decoration-dotted underline-offset-4"
      >
        {etiqueta} {formatearHora(real)}
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="space-y-4">
          <div>
            <h2 className="font-display flex items-center gap-2 text-xl font-bold">
              <Clock className="size-5" />
              ¿A qué hora {que === "llegada" ? "llegó" : "se fue"}?
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              Si lo marcaste después, pon la hora de verdad. Es la que define
              el cobro.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="hora-real">Hora</Label>
            <Input
              id="hora-real"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </div>

          {/* Se muestra solo cuando hay algo que mostrar: un par de minutos
              de desfase es la vida real, no un atraso que valga decir. */}
          {desfase && marcadaEn && (
            <p className="bg-secondary/50 text-muted-foreground rounded-lg p-2.5 text-xs text-pretty">
              Quedó {desfase}, a las {formatearHora(marcadaEn)}. Eso no cambia:
              lo que corriges es la hora en que pasó.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={guardar} disabled={ocupado || !hora}>
              Guardar la hora
            </Button>
            <Button
              variant="outline"
              onClick={() => setAbierto(false)}
              disabled={ocupado}
            >
              Cancelar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
