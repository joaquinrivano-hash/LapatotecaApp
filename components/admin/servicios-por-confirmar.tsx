"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PrecioCLP } from "@/components/shared/precio";
import { crearCanalMensajeria } from "@/lib/integraciones/mensajeria";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  confirmarServicio,
  serviciosPorConfirmar,
} from "@/lib/servicios/cobros-pendientes";
import { formatearFechaCorta } from "@/lib/utils/fecha";

const NOMBRE_TIPO: Record<string, string> = {
  spa: "Baño",
  paseo: "Paseo",
  traslado: "Traslado",
};

/**
 * Lo que el dueño pidió desde el portal y todavía no tiene precio.
 *
 * Le prometimos por pantalla que le hablamos para confirmar el valor, así
 * que esto es la otra mitad de esa promesa: sin esta cola, un servicio
 * pedido desde el portal no se cobra nunca.
 *
 * Va en su propia tarjeta y no en la de cobros pendientes porque la
 * pregunta es otra. Allá el monto ya está calculado y lo que se decide es
 * si se cobra o cuándo se emite; acá lo que falta es el monto, y sale de
 * una conversación que la app no tuvo. Por eso el campo viene con lo
 * cotizado escrito y se puede cambiar: es el punto de partida, no el
 * resultado.
 *
 * Se esconde sola cuando no hay nada: un negocio al día no necesita mirar
 * una tarjeta vacía todos los días.
 */
export function ServiciosPorConfirmar() {
  const { ocupado, ejecutar } = useAccion();
  const pendientes = useConsulta((repo) => serviciosPorConfirmar(repo));
  const [montos, setMontos] = useState<Record<string, string>>({});

  const lista = pendientes.datos ?? [];
  if (lista.length === 0) return null;

  async function confirmar(servicioId: string, cotizado: number) {
    const escrito = montos[servicioId];
    const monto = escrito === undefined || escrito === "" ? cotizado : Number(escrito);

    if (!Number.isFinite(monto) || monto < 0) {
      toast.error("Ese valor no se entiende", {
        description: "Escribe el monto en pesos, sin puntos ni símbolos.",
      });
      return;
    }

    await ejecutar((repo) =>
      confirmarServicio(
        repo,
        servicioId,
        monto,
        new Date().toISOString(),
        crearCanalMensajeria(),
      ),
    );
    toast.success("Valor confirmado", { description: "El cobro ya está emitido." });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5" />
          Servicios por confirmar
          <span className="bg-primary text-primary-foreground ml-auto rounded-full px-2.5 py-0.5 text-sm font-bold">
            {lista.length}
          </span>
        </CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          Pedidos desde el portal. Les dijimos que les hablamos para confirmar
          el valor: hasta que no se confirma, no hay cobro emitido.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {lista.map(({ servicio, perro, cliente, cotizado }) => (
          <div
            key={servicio.id}
            className="border-border space-y-2 rounded-2xl border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {NOMBRE_TIPO[servicio.tipo] ?? servicio.tipo}
                {perro && <span className="font-normal"> · {perro.nombre}</span>}
              </p>
              <p className="text-muted-foreground text-sm">
                {formatearFechaCorta(servicio.fechaHora)}
              </p>
            </div>

            <p className="text-muted-foreground text-sm">
              {cliente ? `${cliente.nombre} ${cliente.apellido}` : "Sin dueño"}
              {" · cotizado "}
              <PrecioCLP monto={cotizado} tamano="sm" />
            </p>

            {/* Debajo y no al lado: al lado, el nombre del dueño se corta en
                un celular, y es justo como se reconoce de qué conversación
                se trata. */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label="Valor final"
                placeholder={String(cotizado)}
                value={montos[servicio.id] ?? ""}
                onChange={(e) =>
                  setMontos((m) => ({ ...m, [servicio.id]: e.target.value }))
                }
              />
              <Button
                disabled={ocupado}
                onClick={() => confirmar(servicio.id, cotizado)}
              >
                Confirmar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
