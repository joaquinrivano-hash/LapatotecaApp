"use client";

import { useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Bone,
  CalendarDays,
  Camera,
  LogIn,
  LogOut,
  Phone,
  Pill,
  Scale,
  StickyNote,
  Syringe,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import type { ItemAsistencia } from "@/components/staff/fila-asistencia";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { vacunasFaltantes } from "@/lib/rules/admision";
import { comprimirImagen } from "@/lib/utils/imagen";
import { formatearDiaMes, formatearHora, sumarDias } from "@/lib/utils/fecha";
import { formatearTelefono } from "@/lib/utils/telefono";
import type { Cliente, GravedadIncidente, Perro } from "@/lib/types";

/** Cuánto hacia atrás se muestra el historial de incidentes. */
const DIAS_DE_HISTORIAL = 180;

const VARIANTE_GRAVEDAD: Record<
  GravedadIncidente,
  React.ComponentProps<typeof Badge>["variant"]
> = { leve: "success", moderado: "warning", grave: "destructive" };

/**
 * La ficha que se abre al tocar un perro, igual en Hoy y en Buscar.
 *
 * El orden es el de las preguntas que aparecen con el perro en brazos: quién
 * es, qué come, qué cuidado especial tiene y si ya pasó algo antes. La acción
 * de entrada o salida queda abajo, siempre en el mismo lugar.
 */
export function FichaPerro({
  perro,
  cliente,
  item,
  hoy,
  ocupado,
  onAccion,
}: {
  perro: Perro;
  cliente?: Cliente;
  item?: ItemAsistencia;
  hoy: string;
  ocupado?: boolean;
  onAccion: (accion: "llego" | "se_fue") => void;
}) {
  const faltantes = vacunasFaltantes(perro, hoy);
  const archivo = useRef<HTMLInputElement>(null);
  const { ocupado: guardando, ejecutar } = useAccion();

  const incidentes = useConsulta(
    async (repo) => {
      const todos = await repo.incidentes.porPerro(perro.id);
      return todos
        .filter((i) => i.fecha >= sumarDias(hoy, -DIAS_DE_HISTORIAL))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
    },
    [perro.id, hoy],
  );

  const historial = incidentes.datos ?? [];
  const graves = historial.filter((i) => i.gravedad !== "leve").length;

  async function elegirFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const entrante = evento.target.files?.[0];
    evento.target.value = "";
    if (!entrante) return;
    try {
      const fotoUrl = await comprimirImagen(entrante);
      await ejecutar((repo) => repo.perros.actualizar(perro.id, { fotoUrl }));
      toast.success(`Lista la foto de ${perro.nombre}`);
    } catch {
      toast.error("No pudimos procesar esa foto.");
    }
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <PerroAvatar
            id={perro.id}
            nombre={perro.nombre}
            fotoUrl={perro.fotoUrl}
            tamano="xl"
          />
          <div className="min-w-0">
            <SheetTitle>{perro.nombre}</SheetTitle>
            <SheetDescription>
              {perro.raza}
              {cliente && ` · ${cliente.nombre} ${cliente.apellido}`}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-3 overflow-y-auto px-5">
        {/* La foto grande solo cuando existe: un marco vacío no le sirve a
            nadie, y sacarla es una acción, no un hueco. */}
        {perro.fotoUrl && (
          <Image
            src={perro.fotoUrl}
            alt={`Foto de ${perro.nombre}`}
            width={640}
            height={480}
            unoptimized
            className="h-44 w-full rounded-2xl object-cover"
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <Scale />
            {perro.pesoKg} kg
          </Badge>
          {cliente && (
            <Badge variant="secondary" asChild>
              {/* En el celular el teléfono se toca para llamar. */}
              <a href={`tel:${cliente.telefono}`}>
                <Phone />
                {formatearTelefono(cliente.telefono)}
              </a>
            </Badge>
          )}
          {item && (
            <Badge variant={item.linea === "hotel" ? "hotel" : "jardin"}>
              <CalendarDays />
              {formatearHora(item.inicioProgramado)} a{" "}
              {formatearHora(item.finProgramado)}
            </Badge>
          )}
        </div>

        {faltantes.length > 0 && (
          <p className="bg-warning/12 text-warning flex items-start gap-2 rounded-xl p-3 text-sm">
            <Syringe className="mt-0.5 size-4 shrink-0" />
            <span>
              Tiene vencida la vacuna {faltantes.join(", ")}. Avísale al dueño.
            </span>
          </p>
        )}

        <Dato
          icono={Bone}
          titulo="Comida"
          texto={perro.alimentacion}
          vacio="Sin indicaciones de comida."
          className="bg-jardin-suave"
        />

        {perro.indicaciones && (
          <Dato
            icono={Pill}
            titulo="Indicaciones"
            texto={perro.indicaciones}
            className="bg-primary/8"
          />
        )}

        {perro.notas && (
          <Dato
            icono={StickyNote}
            titulo="Notas"
            texto={perro.notas}
            className="bg-secondary/60"
          />
        )}

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <TriangleAlert className="size-4" />
            Incidentes
            <span className="text-muted-foreground font-normal">
              últimos {DIAS_DE_HISTORIAL / 30} meses
            </span>
          </h3>

          {incidentes.cargando ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : historial.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nunca hemos tenido que anotar nada. 🎉
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {historial.length}{" "}
                {historial.length === 1 ? "anotado" : "anotados"}
                {graves > 0 && `, ${graves} sobre leve`}.
              </p>
              <ul className="space-y-2">
                {historial.slice(0, 4).map((incidente) => (
                  <li
                    key={incidente.id}
                    className="rounded-xl border border-border/70 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={VARIANTE_GRAVEDAD[incidente.gravedad]}>
                        {incidente.gravedad}
                      </Badge>
                      <span className="text-muted-foreground text-xs first-letter:uppercase">
                        {formatearDiaMes(incidente.fecha)} ·{" "}
                        {incidente.autorStaff}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-pretty">
                      {incidente.descripcion}
                    </p>
                  </li>
                ))}
              </ul>
              {historial.length > 4 && (
                <p className="text-muted-foreground text-xs">
                  Y {historial.length - 4} más atrás.
                </p>
              )}
            </>
          )}
        </section>

        <Button
          variant="outline"
          className="w-full"
          disabled={guardando}
          onClick={() => archivo.current?.click()}
        >
          <Camera />
          {perro.fotoUrl ? "Cambiar la foto" : `Tomarle una foto a ${perro.nombre}`}
        </Button>
        <input
          ref={archivo}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={elegirFoto}
        />
      </div>

      <SheetFooter>
        {item?.estado === "esperado" && (
          <Button size="xl" disabled={ocupado} onClick={() => onAccion("llego")}>
            <LogIn />
            Marcar que llegó
          </Button>
        )}
        {item?.estado === "presente" && (
          <Button
            size="xl"
            variant="accent"
            disabled={ocupado}
            onClick={() => onAccion("se_fue")}
          >
            <LogOut />
            Marcar que se fue
          </Button>
        )}
        {!item && (
          <p className="text-muted-foreground py-2 text-center text-sm">
            Hoy no tiene reserva ni jardín agendado.
          </p>
        )}
      </SheetFooter>
    </>
  );
}

function Dato({
  icono: Icono,
  titulo,
  texto,
  vacio,
  className,
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto?: string;
  vacio?: string;
  className?: string;
}) {
  if (!texto && !vacio) return null;

  return (
    <div className={`rounded-xl p-3 ${className ?? ""}`}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icono className="size-4" />
        {titulo}
      </h3>
      <p
        className={`mt-0.5 text-sm text-pretty ${texto ? "" : "text-muted-foreground"}`}
      >
        {texto ?? vacio}
      </p>
    </div>
  );
}
