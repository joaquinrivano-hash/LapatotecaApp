"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Database,
  Download,
  RotateCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tile } from "@/components/shared/tile";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { formatearFecha, hoyISO } from "@/lib/utils/fecha";

function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Datos() {
  const [confirmando, setConfirmando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const { ocupado, ejecutar } = useAccion();

  const resumen = useConsulta(async (repo) => {
    const [anclaje, clientes, perros, reservas, estadias, pagos, respaldo] =
      await Promise.all([
        repo.sistema.anclaje(),
        repo.clientes.listar(),
        repo.perros.listar(),
        repo.reservasHotel.listar(),
        repo.estadiasJardin.listar(),
        repo.pagos.listar(),
        repo.sistema.exportar(),
      ]);

    return {
      anclaje,
      clientes: clientes.length,
      perros: perros.length,
      movimientos: reservas.length + estadias.length,
      pagos: pagos.length,
      // El respaldo es el mismo JSON que se guarda en el navegador, así que
      // su tamaño es una medida honesta de cuánto ocupa la demo.
      peso: new Blob([respaldo]).size,
    };
  }, []);

  const descargar = async () => {
    const json = await ejecutar((repo) => repo.sistema.exportar());
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `patoteca-${hoyISO()}.json`;
    enlace.click();
    URL.revokeObjectURL(url);
    toast.success("Respaldo descargado");
  };

  const restaurar = async (entrante: File) => {
    try {
      const json = await entrante.text();
      await ejecutar((repo) => repo.sistema.importar(json));
      toast.success("Datos restaurados", {
        description: `Se cargó ${entrante.name}.`,
      });
    } catch (problema: unknown) {
      toast.error("No pudimos restaurar el respaldo", {
        description:
          problema instanceof Error
            ? problema.message
            : "El archivo no se pudo leer.",
      });
    }
  };

  const reiniciar = async () => {
    setConfirmando(false);
    // Se vuelve a anclar a hoy: así la demo muestra de nuevo "los últimos 60
    // días" sin importar cuánto tiempo pasó desde la última vez.
    await ejecutar((repo) => repo.sistema.reiniciar(hoyISO()));
    toast.success("Datos de demo regenerados");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Datos</h1>
        <p className="text-muted-foreground text-sm">
          Esto es un prototipo: todo vive en este navegador. Guarda un respaldo
          antes de una demo y déjalo como estaba después.
        </p>
      </div>

      {resumen.datos ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            etiqueta="Anclaje"
            valor={
              <span className="text-xl first-letter:uppercase">
                {formatearFecha(resumen.datos.anclaje)}
              </span>
            }
            detalle="El día que los datos llaman hoy"
            icono={CalendarClock}
            className="col-span-2 lg:col-span-1"
          />
          <Tile
            etiqueta="Clientes"
            valor={resumen.datos.clientes}
            detalle={`${resumen.datos.perros} perros`}
          />
          <Tile
            etiqueta="Movimientos"
            valor={resumen.datos.movimientos}
            detalle="Reservas y estadías"
          />
          <Tile
            etiqueta="Espacio"
            valor={formatearPeso(resumen.datos.peso)}
            detalle={`${resumen.datos.pagos} cobros guardados`}
            icono={Database}
          />
        </div>
      ) : (
        <Skeleton className="h-28 w-full rounded-2xl" />
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-lg font-bold">Respaldo</h2>
            <p className="text-muted-foreground text-sm">
              El archivo trae todo: clientes, perros, reservas, planes, cobros y
              la bandeja de mensajes. Sirve para retomar una demo en otro
              computador.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={descargar} disabled={ocupado}>
              <Download />
              Descargar respaldo
            </Button>
            <Button
              variant="outline"
              onClick={() => archivo.current?.click()}
              disabled={ocupado}
            >
              <Upload />
              Restaurar desde archivo
            </Button>
            <input
              ref={archivo}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(evento) => {
                const elegido = evento.target.files?.[0];
                // Se limpia para que elegir el mismo archivo dos veces vuelva
                // a disparar el cambio.
                evento.target.value = "";
                if (elegido) void restaurar(elegido);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-warning/40">
        <CardContent className="space-y-4 p-5">
          <div className="flex gap-3">
            <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-display text-lg font-bold">
                Volver a los datos de demo
              </h2>
              <p className="text-muted-foreground text-sm">
                Borra todo lo que se registró en este navegador y genera de
                nuevo los datos de ejemplo, anclados a hoy. No se puede
                deshacer: si quieres conservar algo, descarga el respaldo
                antes.
              </p>
            </div>
          </div>

          {confirmando ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={reiniciar}
                disabled={ocupado}
              >
                <RotateCcw />
                Sí, borrar y regenerar
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmando(false)}
                disabled={ocupado}
              >
                Mejor no
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setConfirmando(true)}
              disabled={ocupado}
            >
              <RotateCcw />
              Reiniciar datos
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
