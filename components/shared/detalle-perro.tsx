"use client";

import Image from "next/image";
import {
  Bone,
  Cake,
  CalendarDays,
  FileImage,
  Phone,
  Pill,
  Scale,
  ShieldAlert,
  StickyNote,
  Syringe,
  TriangleAlert,
  Venus,
  Mars,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { nombreVacuna, vacunasFaltantes } from "@/lib/rules/admision";
import { describirAlimentacion, describirEdad } from "@/lib/rules/perro";
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

/**
 * El carnet va como acordeón y no abierto: es una foto de un papel, sirve
 * para verificar una fecha y no para mirarla todos los días.
 */
export function CarnetDeVacunas({ perro }: { perro: Perro }) {
  if (!perro.carnetVacunasUrl) return null;

  return (
    <details className="rounded-xl border border-border/70">
      <summary className="flex cursor-pointer items-center gap-1.5 p-3 text-sm font-semibold">
        <FileImage className="size-4" />
        Carnet de vacunación
      </summary>
      <div className="px-3 pb-3">
        <Image
          src={perro.carnetVacunasUrl}
          alt={`Carnet de vacunación de ${perro.nombre}`}
          width={640}
          height={480}
          unoptimized
          className="w-full rounded-xl object-contain"
        />
      </div>
    </details>
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
  const edad = perro.fechaNacimiento
    ? describirEdad(perro.fechaNacimiento, hoy)
    : null;

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
          {perro.esterilizado ? " · castrado" : ""}
        </Badge>
        {edad && (
          <Badge variant="secondary">
            <Cake />
            {edad}
          </Badge>
        )}
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
            Tiene vencida la vacuna {faltantes.map(nombreVacuna).join(", ")}.
            Avísale al dueño.
          </span>
        </p>
      )}

      <Dato
        icono={Bone}
        titulo="Comida"
        texto={describirAlimentacion(perro.alimentacion) ?? undefined}
        vacio="Sin indicaciones de comida."
        className="bg-jardin-suave"
      />

      {perro.alergias?.tiene && (
        <Dato
          icono={ShieldAlert}
          titulo="Alergias"
          texto={perro.alergias.detalle}
          vacio="Tiene alergias, pero no quedó anotado a qué."
          className="bg-destructive/10"
        />
      )}

      {perro.medicamentos && perro.medicamentos.length > 0 && (
        <div className="bg-primary/8 rounded-xl p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Pill className="size-4" />
            Medicamentos
          </h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {perro.medicamentos.map((medicamento) => (
              <li key={medicamento.nombre} className="text-pretty">
                <span className="font-semibold">{medicamento.nombre}</span>
                {medicamento.dosis && ` · ${medicamento.dosis}`}
                {medicamento.frecuencia && ` · ${medicamento.frecuencia}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {perro.indicaciones && (
        <Dato
          icono={Pill}
          titulo="Cuidados especiales"
          texto={perro.indicaciones}
          className="bg-accent/12"
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
