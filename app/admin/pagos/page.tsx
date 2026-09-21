"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlarmClock,
  Check,
  ChevronDown,
  FileText,
  Receipt,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PrecioCLP } from "@/components/shared/precio";
import { Tile } from "@/components/shared/tile";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { etiquetaConcepto } from "@/lib/rules/cobro-mensual";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  cargarCobranza,
  emitirCuentasDelMes,
  estaVencido,
  marcarPagado,
  periodoAEmitir,
} from "@/lib/servicios/cobranza";
import { cn } from "@/lib/utils";
import { formatearFecha, formatearMes } from "@/lib/utils/fecha";
import type { DeudaDeCliente } from "@/lib/servicios/cobranza";

export default function Pagos() {
  const hoy = hoyDelStaff();
  const periodo = periodoAEmitir(hoy);
  const { ocupado, ejecutar } = useAccion();

  const cobranza = useConsulta((repo) => cargarCobranza(repo, hoy), [hoy]);
  const cuentas = useConsulta(
    (repo) => repo.cuentasMensuales.porPeriodo(periodo),
    [periodo],
  );

  async function emitir() {
    const resultado = await ejecutar((repo) =>
      emitirCuentasDelMes(repo, periodo),
    );

    if (resultado.yaEstaba) {
      toast("Ese mes ya estaba emitido", {
        description: "Emitirlo de nuevo sería cobrarle dos veces al cliente.",
      });
      return;
    }

    toast.success(
      `${resultado.cuentas.length} ${resultado.cuentas.length === 1 ? "cuenta emitida" : "cuentas emitidas"}`,
      {
        description: `${resultado.consumosIncluidos} cobros sueltos quedaron incluidos.`,
      },
    );
  }

  async function cobrar(pagoId: string) {
    await ejecutar((repo) => marcarPagado(repo, pagoId, "transferencia"));
    toast.success("Cobro registrado");
  }

  if (cobranza.cargando && !cobranza.datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const datos = cobranza.datos;
  if (!datos) return null;
  const emitidas = cuentas.datos ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Pagos y cobranza</h1>
        <p className="text-muted-foreground text-sm">
          Lo que está por cobrar hoy, y la cuenta del día 1.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          etiqueta="Por cobrar"
          valor={<PrecioCLP monto={datos.total} tamano="xl" />}
          detalle={`${datos.pendientes.length} cobros`}
          icono={Wallet}
        />
        <Tile
          etiqueta="Vencido"
          valor={<PrecioCLP monto={datos.totalVencido} tamano="xl" />}
          acento={datos.totalVencido > 0 ? "alerta" : "neutro"}
          icono={AlarmClock}
        />
        <Tile
          etiqueta="Clientes con deuda"
          valor={datos.porCliente.length}
          icono={Receipt}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Cuenta del día 1</CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            Junta la renovación de los planes recurrentes con los consumos
            sueltos de <span className="capitalize">{formatearMes(`${periodo}-15T12:00:00Z`)}</span>,
            en un solo documento por cliente. Lo que entra en la cuenta deja de
            cobrarse por separado.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {emitidas.length > 0 ? (
            <>
              <Badge variant="success">
                <Check />
                {emitidas.length} emitidas
              </Badge>
              <span className="text-muted-foreground text-sm">
                Total:{" "}
                <PrecioCLP
                  monto={emitidas.reduce((s, c) => s + c.total, 0)}
                  tamano="sm"
                />
              </span>
            </>
          ) : (
            <Button size="lg" disabled={ocupado} onClick={emitir}>
              <FileText />
              Emitir cuentas de{" "}
              <span className="capitalize">
                {formatearMes(`${periodo}-15T12:00:00Z`)}
              </span>
            </Button>
          )}
        </CardContent>
      </Card>

      {datos.porCliente.length === 0 ? (
        <EstadoVacio
          titulo="No hay nada por cobrar"
          descripcion="Todos los cobros emitidos están pagados."
          icono={Wallet}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Ordenados por monto. Toca un cliente para ver el detalle.
          </p>
          {datos.porCliente.map((deuda) => (
            <DeudaCliente
              key={deuda.cliente.id}
              deuda={deuda}
              hoy={hoy}
              ocupado={ocupado}
              onCobrar={cobrar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La deuda de un cliente, colapsada.
 *
 * Con treinta clientes debiendo y varios cobros cada uno, mostrar todo abierto
 * hace una página de veinte pantallas que nadie recorre. El resumen alcanza
 * para priorizar; el detalle se abre cuando se va a cobrar.
 */
function DeudaCliente({
  deuda,
  hoy,
  ocupado,
  onCobrar,
}: {
  deuda: DeudaDeCliente;
  hoy: string;
  ocupado: boolean;
  onCobrar: (pagoId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border shadow-sm transition-colors",
        deuda.vencido > 0 ? "border-destructive/35" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground size-5 shrink-0 transition-transform",
            abierto && "rotate-180",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {deuda.cliente.nombre} {deuda.cliente.apellido}
          </span>
          <span className="text-muted-foreground block text-sm">
            {deuda.pagos.length} {deuda.pagos.length === 1 ? "cobro" : "cobros"}
            {deuda.diasDeAtraso > 0 &&
              ` · el más antiguo hace ${deuda.diasDeAtraso} días`}
          </span>
        </span>
        {deuda.vencido > 0 && (
          <Badge variant="destructive">
            <AlarmClock />
            <PrecioCLP monto={deuda.vencido} tamano="sm" /> vencido
          </Badge>
        )}
        <PrecioCLP monto={deuda.total} tamano="lg" />
      </button>

      {abierto && (
        <ul className="divide-border/60 divide-y border-t border-border/60 px-3">
          {deuda.pagos.map((pago) => (
            <li
              key={pago.id}
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {etiquetaConcepto(pago.concepto)}
                </p>
                <p className="text-muted-foreground text-sm">
                  Emitido el {formatearFecha(pago.emitidoEn)}
                  {pago.venceEn && ` · vence el ${pago.venceEn}`}
                </p>
              </div>
              {estaVencido(pago, hoy) && (
                <Badge variant="destructive">Vencido</Badge>
              )}
              <PrecioCLP monto={pago.monto} />
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado}
                onClick={() => onCobrar(pago.id)}
              >
                <Check />
                Cobrado
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
