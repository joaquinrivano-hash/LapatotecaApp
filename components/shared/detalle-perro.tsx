"use client";

import Image from "next/image";
import {
  Bone,
  CalendarDays,
  Phone,
  Pill,
  Scale,
  StickyNote,
  Syringe,
  TriangleAlert,
  Venus,
  Mars,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { vacunasFaltantes } from "@/lib/rules/admision";
import { formatearDiaMes, sumarDias } from "@/lib/utils/fecha";
import { formatearTelefono } from "@/lib/utils/telefono";
import type { Cliente, GravedadIncidente, Perro } from "@/lib/types";

/** Cuánto hacia atrás se muestra el historial de incidentes. */
export const DIAS_DE_HISTORIAL = 180;

const VARIANTE_GRAVEDAD: Record<
  GravedadIncidente,
  React.ComponentProps<typeof Badge>["variant"]
> = { leve: "success", moderado: "warning", grave: "destructive" };

/**
 * La ficha del perro, igual en las tres caras.
 *
 * El staff la ve para saber qué hacer con el perro que tiene enfrente y el
 * admin la ve antes de editar: si cada pantalla ordenara los datos a su
 * manera, quien usa las dos tendría que aprender dos fichas.
 */
export function FotoPerro({ perro }: { perro: Perro }) {
  if (!perro.fotoUrl) return null;

  return (
    <Image
      src={perro.fotoUrl}
      alt={`Foto de ${perro.nombre}`}
      width={640}
      height={480}
      unoptimized
      className="h-44 w-full rounded-2xl object-cover"
    />
  );
}

export function DatosPerro({
  perro,
  cliente,
  hoy,
  horario,
}: {
  perro: Perro;
  cliente?: Cliente;
  hoy: string;
  /** El horario de hoy, cuando la pantalla lo tiene a mano. */
  horario?: string;
}) {
  const faltantes = vacunasFaltantes(perro, hoy);
  const Sexo = perro.sexo === "macho" ? Mars : Venus;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          <Scale />
          {perro.pesoKg} kg
        </Badge>
        <Badge variant="secondary">
          <Sexo />
          {perro.sexo}
          {perro.esterilizado ? " · esterilizado" : ""}
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
        {horario && (
          <Badge variant="jardin">
            <CalendarDays />
            {horario}
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
    </>
  );
}

export function HistorialIncidentes({
  perroId,
  hoy,
}: {
  perroId: string;
  hoy: string;
}) {
  const incidentes = useConsulta(
    async (repo) => {
      const todos = await repo.incidentes.porPerro(perroId);
      return todos
        .filter((i) => i.fecha >= sumarDias(hoy, -DIAS_DE_HISTORIAL))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
    },
    [perroId, hoy],
  );

  const historial = incidentes.datos ?? [];
  const graves = historial.filter((i) => i.gravedad !== "leve").length;

  return (
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
            {historial.length} {historial.length === 1 ? "anotado" : "anotados"}
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
                    {formatearDiaMes(incidente.fecha)} · {incidente.autorStaff}
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
