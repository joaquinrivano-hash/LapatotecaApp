"use client";

import { useState } from "react";
import { Info, PawPrint, Ticket, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PrecioCLP } from "@/components/shared/precio";
import { Tile } from "@/components/shared/tile";
import { BarraParticipacion } from "@/components/admin/barra-participacion";
import { OcupacionDiaria } from "@/components/admin/ocupacion-diaria";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { cargarPanel, ETIQUETA_LINEA } from "@/lib/servicios/panel";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { cn } from "@/lib/utils";
import { formatearPorcentaje } from "@/lib/utils/moneda";
import { sumarDias } from "@/lib/utils/fecha";

const PERIODOS = [
  { etiqueta: "30 días", dias: 30 },
  { etiqueta: "60 días", dias: 60 },
];

export default function Numeros() {
  const hoy = hoyDelStaff();
  const [dias, setDias] = useState(60);
  const desde = sumarDias(hoy, -(dias - 1));

  const panel = useConsulta(
    (repo) => cargarPanel(repo, desde, hoy),
    [desde, hoy],
  );

  if (panel.cargando && !panel.datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const datos = panel.datos;
  if (!datos) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Cómo va el negocio</h1>
          <p className="text-muted-foreground text-sm">
            Últimos {dias} días, hasta hoy.
          </p>
        </div>
        <div className="bg-secondary/70 flex gap-1 rounded-full p-1">
          {PERIODOS.map((periodo) => (
            <button
              key={periodo.dias}
              type="button"
              onClick={() => setDias(periodo.dias)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                dias === periodo.dias
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {periodo.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          etiqueta="Ocupación"
          valor={formatearPorcentaje(datos.ocupacionPromedio)}
          detalle={`Peak del periodo: ${datos.picoMaximo} de ${datos.capacidad}`}
          icono={PawPrint}
        />
        <Tile
          etiqueta="Por cupo al día"
          valor={<PrecioCLP monto={datos.ingresoPorCupoDisponible} tamano="xl" />}
          detalle="Rinde cada uno de los 25 cupos"
          icono={TrendingUp}
        />
        <Tile
          etiqueta="Clientes activos"
          valor={datos.clientesActivos}
          detalle={`de ${datos.totalClientes} registrados`}
          icono={Users}
        />
        <Tile
          etiqueta="Planes vigentes"
          valor={datos.planesVigentes}
          detalle={`${formatearPorcentaje(datos.renovacionPlanes)} son recompra`}
          icono={Ticket}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Qué tan lleno estuvo cada día</CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            Cada barra es el momento más lleno del día, que es contra lo que se
            mide el tope de {datos.capacidad}. Un día con 22 perros que nunca
            coincidieron no está lleno.
          </p>
        </CardHeader>
        <CardContent>
          <OcupacionDiaria dias={datos.dias} capacidad={datos.capacidad} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>De dónde viene la plata</CardTitle>
            <p className="text-muted-foreground text-sm">
              Total del periodo: <PrecioCLP monto={datos.ingresoTotal} />
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {datos.ingresoPorLinea.map((linea) => (
              <BarraParticipacion
                key={linea.linea}
                etiqueta={ETIQUETA_LINEA[linea.linea]}
                valor={
                  <>
                    <PrecioCLP monto={linea.monto} tamano="sm" />
                    <span className="text-muted-foreground ml-2">
                      {formatearPorcentaje(linea.participacion)}
                    </span>
                  </>
                }
                fraccion={linea.participacion}
                tono={
                  linea.linea === "hotel"
                    ? "hotel"
                    : linea.linea === "jardin"
                      ? "jardin"
                      : "neutro"
                }
              />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Semana contra fin de semana</CardTitle>
              <p className="text-muted-foreground text-sm text-pretty">
                El jardín llena de lunes a viernes; el hotel hace lo contrario.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <BarraParticipacion
                etiqueta="Entre semana"
                valor={formatearPorcentaje(datos.ocupacionEntreSemana)}
                fraccion={datos.ocupacionEntreSemana}
              />
              <BarraParticipacion
                etiqueta="Fin de semana"
                valor={formatearPorcentaje(datos.ocupacionFinDeSemana)}
                fraccion={datos.ocupacionFinDeSemana}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Quién ocupa el espacio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BarraParticipacion
                etiqueta="Jardín"
                valor={formatearPorcentaje(datos.mixOcupacion.jardin)}
                fraccion={datos.mixOcupacion.jardin}
                tono="jardin"
              />
              <BarraParticipacion
                etiqueta="Hotel"
                valor={formatearPorcentaje(datos.mixOcupacion.hotel)}
                fraccion={datos.mixOcupacion.hotel}
                tono="hotel"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-xs">
        <Info className="size-3.5 shrink-0" />
        El ingreso se cuenta cuando se emite el cobro, no cuando se paga.
      </p>
    </div>
  );
}
