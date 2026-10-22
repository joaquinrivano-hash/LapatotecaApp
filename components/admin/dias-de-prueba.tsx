"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Check, PawPrint, X } from "lucide-react";

import { PerroAvatar } from "@/components/shared/perro-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  diasDePruebaPorEvaluar,
  resolverDiaDePrueba,
  type DiaDePruebaPorEvaluar,
} from "@/lib/servicios/evaluacion";
import { formatearDiaMes, formatearHora } from "@/lib/utils/fecha";

/**
 * Los días de prueba que ya pasaron y siguen sin veredicto.
 *
 * Existe porque el veredicto se podía dar pero no se encontraba: había que
 * acordarse de qué perro vino, buscar a su dueño y entrar a editar la ficha.
 * Nada avisaba que quedaba una decisión pendiente, y un perro sin veredicto
 * no puede reservar — o sea, un cliente que no vuelve.
 *
 * Se esconde sola cuando no hay nada: un negocio al día no necesita mirar
 * una tarjeta vacía.
 */
export function DiasDePruebaPorEvaluar({ hoy }: { hoy: string }) {
  const consulta = useConsulta((repo) => diasDePruebaPorEvaluar(repo, hoy), [hoy]);

  if (consulta.cargando) return <Skeleton className="h-28 w-full rounded-2xl" />;
  const cola = consulta.datos ?? [];
  if (cola.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <PawPrint className="size-5" />
          {cola.length === 1
            ? "Un día de prueba por evaluar"
            : `${cola.length} días de prueba por evaluar`}
        </CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          Hasta que no lo apruebes, el perrito no puede reservar.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {cola.map((entrada) => (
          <Fila key={entrada.perro.id} entrada={entrada} />
        ))}
      </CardContent>
    </Card>
  );
}

function Fila({ entrada }: { entrada: DiaDePruebaPorEvaluar }) {
  const { perro, cliente, estadia, fecha, diasEsperando } = entrada;
  const { ocupado, ejecutar } = useAccion();
  const idNota = useId();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function resolver(veredicto: "aprobado" | "rechazado", nota?: string) {
    try {
      await ejecutar((repo) =>
        resolverDiaDePrueba(repo, perro.id, veredicto, nota),
      );
      toast.success(
        veredicto === "aprobado"
          ? `${perro.nombre} quedó aprobado`
          : `${perro.nombre} quedó rechazado`,
        {
          description:
            veredicto === "aprobado"
              ? "Ya puede reservar jardín y hotel."
              : "Queda anotado en su ficha con el motivo.",
        },
      );
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos guardarlo.",
      );
    }
  }

  return (
    <div className="bg-secondary/40 space-y-3 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <PerroAvatar
          id={perro.id}
          nombre={perro.nombre}
          fotoUrl={perro.fotoUrl}
          tamano="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {perro.nombre}
            <span className="text-muted-foreground font-normal">
              {" "}
              · {cliente ? `${cliente.nombre} ${cliente.apellido}` : "sin dueño"}
            </span>
          </p>
          <p className="text-muted-foreground text-sm">
            {formatearDiaMes(`${fecha}T12:00:00Z`)}
            {diasEsperando > 0 &&
              ` · hace ${diasEsperando} ${diasEsperando === 1 ? "día" : "días"}`}
            {/* Las horas reales: a qué hora llegó y a qué hora lo buscaron.
                Es el dato que ayuda a acordarse de cuál perro era. */}
            {estadia?.inicioReal && (
              <>
                {" · "}
                {formatearHora(estadia.inicioReal)}
                {estadia.finReal && `–${formatearHora(estadia.finReal)}`}
              </>
            )}
          </p>
        </div>
      </div>

      {rechazando ? (
        <div className="space-y-2">
          <Label htmlFor={idNota}>¿Por qué no lo aprobamos?</Label>
          <Input
            id={idNota}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se puso brusco con los chicos"
          />
          <p className="text-muted-foreground text-xs text-pretty">
            Queda en su ficha. Sin el motivo, el día que alguien lea el
            rechazo no va a saber qué pasó.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={ocupado || motivo.trim() === ""}
              onClick={() => resolver("rechazado", motivo)}
            >
              Confirmar
            </Button>
            <Button variant="ghost" onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        /* Aprobar es un toque: casi todos se aprueban. Rechazar pide el
           motivo, porque un rechazo sin explicación no le sirve a nadie
           cuando alguien lo lea después. */
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={ocupado}
            onClick={() => resolver("aprobado")}
          >
            <Check />
            Aprobar
          </Button>
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() => setRechazando(true)}
          >
            <X />
            No aprobar
          </Button>
        </div>
      )}
    </div>
  );
}
