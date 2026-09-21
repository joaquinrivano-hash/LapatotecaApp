"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { DoorOpen, PawPrint, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { OcupacionFranjas } from "@/components/shared/ocupacion-franjas";
import { Tile } from "@/components/shared/tile";
import {
  FilaAsistencia,
  type ItemAsistencia,
} from "@/components/staff/fila-asistencia";
import { itemsDelDia } from "@/components/staff/items";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  cargarDiaDeStaff,
  deshacerLlegadaJardin,
  hoyDelStaff,
  registrarLlegadaHotel,
  registrarLlegadaJardin,
  registrarSalidaHotel,
  registrarSalidaJardin,
} from "@/lib/servicios/asistencia";
import { formatearCLP } from "@/lib/utils/moneda";
import { hhmmDesdeMinutos } from "@/lib/utils/fecha";

export default function Hoy() {
  const hoy = hoyDelStaff();
  const dia = useConsulta((repo) => cargarDiaDeStaff(repo, hoy), [hoy]);
  const { ocupado, ejecutar } = useAccion();

  const items = useMemo(
    () => (dia.datos ? itemsDelDia(dia.datos) : []),
    [dia.datos],
  );

  const porLlegar = items.filter((i) => i.estado === "esperado");
  const adentro = items.filter((i) => i.estado === "presente");
  const cerrados = items.filter(
    (i) => i.estado === "cerrado" || i.estado === "no_llego",
  );

  async function llego(item: ItemAsistencia) {
    await ejecutar(async (repo) => {
      if (item.linea === "hotel") await registrarLlegadaHotel(repo, item.id);
      else await registrarLlegadaJardin(repo, item.id);
    });
    toast.success(`Llegó ${item.perro.nombre}`);
  }

  async function seFue(item: ItemAsistencia) {
    if (item.linea === "hotel") {
      const resultado = await ejecutar((repo) =>
        registrarSalidaHotel(repo, item.id),
      );
      toast.success(`Se fue ${item.perro.nombre}`, {
        description:
          resultado.saldoPorCobrar > 0
            ? `Queda por cobrar ${formatearCLP(resultado.saldoPorCobrar)}.`
            : "Sin saldo pendiente.",
      });
      return;
    }

    const resultado = await ejecutar((repo) =>
      registrarSalidaJardin(repo, item.id),
    );

    // El recargo fuera de horario recién se sabe acá, así que hay que decirlo
    // en el momento: si no, aparece después en la cuenta sin explicación.
    if (resultado.recargo > 0) {
      toast.warning(`Se fue ${item.perro.nombre}, fuera de horario`, {
        description: `${resultado.horasFueraDeHorario} h después del cierre: se agregaron ${formatearCLP(resultado.recargo)}.`,
      });
    } else {
      toast.success(`Se fue ${item.perro.nombre}`);
    }
  }

  async function deshacer(item: ItemAsistencia) {
    if (item.linea === "hotel") return;
    await ejecutar((repo) => deshacerLlegadaJardin(repo, item.id));
    toast(`${item.perro.nombre} volvió a "por llegar"`);
  }

  if (dia.cargando && !dia.datos) return <CargandoHoy />;
  if (!dia.datos) return null;

  const { ocupacion, capacidad, esperados, presentes } = dia.datos;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile etiqueta="Adentro" valor={presentes} icono={PawPrint} />
        <Tile
          etiqueta="Por llegar"
          valor={esperados}
          icono={DoorOpen}
          acento={esperados > 0 ? "neutro" : "neutro"}
        />
        <Tile
          etiqueta="Cupos"
          valor={`${ocupacion.pico}/${capacidad}`}
          icono={Users}
          acento={ocupacion.pico >= capacidad ? "alerta" : "neutro"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Cómo se llena el día</CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            El cupo se mide por el momento más lleno, no por cuántos perros
            pasaron. Hoy el peak son{" "}
            <strong className="text-foreground">{ocupacion.pico}</strong> a las{" "}
            {hhmmDesdeMinutos(ocupacion.picoMinutoDelDia)}, con{" "}
            {ocupacion.perrosDistintos} perros distintos en el día.
          </p>
        </CardHeader>
        <CardContent>
          <OcupacionFranjas ocupacion={ocupacion} capacidad={capacidad} />
        </CardContent>
      </Card>

      <Tabs defaultValue="por-llegar">
        <TabsList>
          <TabsTrigger value="por-llegar">
            Por llegar
            {porLlegar.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-1.5 text-xs tabular-nums">
                {porLlegar.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="adentro">
            Adentro
            {adentro.length > 0 && (
              <span className="bg-success/15 text-success rounded-full px-1.5 text-xs tabular-nums">
                {adentro.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="se-fueron">Se fueron</TabsTrigger>
        </TabsList>

        <TabsContent value="por-llegar" className="mt-3 space-y-2">
          {porLlegar.length === 0 ? (
            <EstadoVacio
              titulo="Ya llegaron todos"
              descripcion="No queda nadie por marcar. Buen día."
            />
          ) : (
            porLlegar.map((item) => (
              <FilaAsistencia
                key={`${item.linea}-${item.id}`}
                item={item}
                ocupado={ocupado}
                onLlego={llego}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="adentro" className="mt-3 space-y-2">
          {adentro.length === 0 ? (
            <EstadoVacio
              titulo="No hay perros adentro"
              descripcion="Cuando marques una llegada, va a aparecer acá."
            />
          ) : (
            adentro.map((item) => (
              <FilaAsistencia
                key={`${item.linea}-${item.id}`}
                item={item}
                ocupado={ocupado}
                onSeFue={seFue}
                onDeshacer={item.linea === "jardin" ? deshacer : undefined}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="se-fueron" className="mt-3 space-y-2">
          {cerrados.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no se va nadie"
              descripcion="Acá queda el registro de los que ya salieron hoy."
            />
          ) : (
            cerrados.map((item) => (
              <FilaAsistencia key={`${item.linea}-${item.id}`} item={item} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CargandoHoy() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-12" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
