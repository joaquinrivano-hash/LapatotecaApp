"use client";

import React from "react";
import { toast } from "sonner";
import { Check, Clock, Hotel, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrecioCLP } from "@/components/shared/precio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  cobrarRecargo,
  diasPorCobrar,
  emitirDiaDeJardin,
  emitirSaldoHotel,
  perdonarRecargo,
  recargosPorDecidir,
  saldosPorEmitir,
} from "@/lib/servicios/cobros-pendientes";
import { formatearFechaCorta } from "@/lib/utils/fecha";

/**
 * Lo que el turno del cuidador dejó esperando.
 *
 * Son tres colas y no son la misma cosa, así que la pantalla no las junta en
 * una lista sola: el recargo se DECIDE (cobrarlo o perdonarlo) y los otros dos
 * se EMITEN. Meterlos en una tabla única con un botón genérico le pediría a
 * quien mira que recuerde cuál es cuál.
 */
export function CobrosPendientes() {
  const { ocupado, ejecutar } = useAccion();

  const recargos = useConsulta((repo) => recargosPorDecidir(repo));
  const saldos = useConsulta((repo) => saldosPorEmitir(repo));
  const dias = useConsulta((repo) => diasPorCobrar(repo));
  const perros = useConsulta((repo) => repo.perros.listar());

  const nombre = (perroId: string) =>
    perros.datos?.find((p) => p.id === perroId)?.nombre ?? "El perro";

  const listaRecargos = recargos.datos ?? [];
  const listaSaldos = saldos.datos ?? [];
  const listaDias = dias.datos ?? [];
  const total =
    listaRecargos.length + listaSaldos.length + listaDias.length;

  // Nada esperando es el caso normal y no merece una tarjeta vacía ocupando
  // la pantalla todos los días.
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5" />
          Esperando tu decisión
          <span className="bg-primary text-primary-foreground ml-auto rounded-full px-2.5 py-0.5 text-sm font-bold">
            {total}
          </span>
        </CardTitle>
        <p className="text-muted-foreground text-sm text-pretty">
          El equipo registra las salidas; cobrarlas es decisión tuya.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {listaRecargos.length > 0 && (
          <Seccion
            icono={Sun}
            titulo="Retiros fuera de horario"
            explicacion="El pack cubre el día, no que lo pasen a buscar tarde. Si fue una vez y el dueño avisó, puedes perdonarlo."
          >
            {listaRecargos.map(({ estadia, horas, monto }) => (
              <Fila
                key={estadia.id}
                titulo={nombre(estadia.perroId)}
                detalle={`${formatearFechaCorta(estadia.fecha)} · ${horas} h después del cierre`}
                monto={monto}
              >
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={async () => {
                    await ejecutar((repo) => cobrarRecargo(repo, estadia.id));
                    toast.success(`Recargo cobrado a ${nombre(estadia.perroId)}`);
                  }}
                >
                  <Check /> Cobrar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  onClick={async () => {
                    await ejecutar((repo) => perdonarRecargo(repo, estadia.id));
                    toast(`Recargo perdonado`, {
                      description: "Queda anotado en cero, para poder explicar el mes.",
                    });
                  }}
                >
                  <X /> Perdonar
                </Button>
              </Fila>
            ))}
          </Seccion>
        )}

        {listaSaldos.length > 0 && (
          <Seccion
            icono={Hotel}
            titulo="Saldos de hotel"
            explicacion="Calculados con la salida real, contra el abono ya pagado. Acá no hay nada que decidir: solo emitirlos."
          >
            {listaSaldos.map(({ reserva, saldo }) => (
              <Fila
                key={reserva.id}
                titulo={nombre(reserva.perroId)}
                detalle={`Se fue el ${formatearFechaCorta(reserva.finReal!)}`}
                monto={saldo}
              >
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={async () => {
                    await ejecutar((repo) => emitirSaldoHotel(repo, reserva.id));
                    toast.success(`Saldo emitido`);
                  }}
                >
                  <Check /> Emitir
                </Button>
              </Fila>
            ))}
          </Seccion>
        )}

        {listaDias.length > 0 && (
          <Seccion
            icono={Sun}
            titulo="Días sin cobrar"
            explicacion="Jornadas que se registraron sin pasar por el portal, así que nadie las pagó por adelantado. Casi siempre son perros que llegaron sin reserva."
          >
            {listaDias.map(({ estadia, monto }) => (
              <Fila
                key={estadia.id}
                titulo={nombre(estadia.perroId)}
                detalle={formatearFechaCorta(estadia.fecha)}
                monto={monto}
              >
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={async () => {
                    await ejecutar((repo) => emitirDiaDeJardin(repo, estadia.id));
                    toast.success(`Día cobrado`);
                  }}
                >
                  <Check /> Cobrar
                </Button>
              </Fila>
            ))}
          </Seccion>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cuántas filas se muestran por sección antes de resumir el resto.
 *
 * Un fin de semana largo puede dejar quince retiros tarde, y quince filas con
 * dos botones cada una no se leen: se barren. Mostrar las primeras y decir
 * cuántas faltan deja la decisión a mano sin convertir la pantalla en una
 * muralla.
 */
const FILAS_VISIBLES = 6;

function Seccion({
  icono: Icono,
  titulo,
  explicacion,
  children,
}: {
  icono: React.ElementType;
  titulo: string;
  explicacion: string;
  children: React.ReactNode;
}) {
  const filas = React.Children.toArray(children);
  const ocultas = filas.length - FILAS_VISIBLES;

  return (
    <section className="space-y-2">
      <div>
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Icono className="text-muted-foreground size-4" />
          {titulo}
          <span className="text-muted-foreground text-sm font-normal">
            ({filas.length})
          </span>
        </h3>
        <p className="text-muted-foreground text-xs text-pretty">
          {explicacion}
        </p>
      </div>
      <div className="space-y-2">{filas.slice(0, FILAS_VISIBLES)}</div>
      {ocultas > 0 && (
        <p className="text-muted-foreground text-xs">
          Y {ocultas} más. Resuelve estas y aparecen las siguientes.
        </p>
      )}
    </section>
  );
}

function Fila({
  titulo,
  detalle,
  monto,
  children,
}: {
  titulo: string;
  detalle: string;
  monto: number;
  children: React.ReactNode;
}) {
  return (
    // `grid-cols-1` explícito: sin él la columna implícita se resuelve a
    // max-content y el `truncate` de adentro desborda la tarjeta entera.
    <div className="bg-secondary/40 grid grid-cols-1 gap-2 rounded-xl p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold">{titulo}</p>
        <p className="text-muted-foreground truncate text-xs">{detalle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PrecioCLP monto={monto} className="mr-1 font-bold" />
        {children}
      </div>
    </div>
  );
}
