"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck, CircleCheck, PawPrint, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PrecioCLP } from "@/components/shared/precio";
import { NEGOCIO } from "@/lib/config/negocio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { useCliente } from "@/lib/hooks/use-cliente";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  agendarDiaDePrueba,
  cotizarDiaDePrueba,
  RegistroRechazado,
} from "@/lib/servicios/registro";
import { formatearFechaLarga, sumarDias } from "@/lib/utils/fecha";

export default function DiaDePrueba() {
  const hoy = hoyDelStaff();
  const router = useRouter();
  const base = useCliente();
  const { ocupado, ejecutar } = useAccion();

  const perros = base.datos?.perros ?? [];
  const pendientes = perros.filter(
    (p) => p.diaDePrueba.estado === "pendiente",
  );

  const [perroId, setPerroId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => sumarDias(hoy, 2));

  const elegido =
    pendientes.find((p) => p.id === perroId) ?? pendientes[0] ?? null;

  const previa = useConsulta(
    async (repo) =>
      elegido ? cotizarDiaDePrueba(repo, elegido.id, fecha) : null,
    [elegido?.id ?? "", fecha],
  );

  async function agendar() {
    if (!elegido) return;
    try {
      await ejecutar((repo) => agendarDiaDePrueba(repo, elegido.id, fecha));
      toast.success(`Listo: ${elegido.nombre} viene el ${fecha}`, {
        description: "Te vamos a escribir por WhatsApp para coordinar la hora.",
      });
      router.push("/mi-cuenta");
    } catch (problema: unknown) {
      if (problema instanceof RegistroRechazado) {
        toast.error(problema.message, {
          description: problema.motivos.join(" "),
        });
        return;
      }
      toast.error("No pudimos agendar ese día.");
    }
  }

  if (base.cargando && perros.length === 0) return <Skeleton className="h-96" />;

  if (pendientes.length === 0) {
    return (
      <EstadoVacio
        titulo="No tienes días de prueba pendientes"
        descripcion="Tus perritos ya pasaron por acá, así que puedes reservar directo."
        icono={CircleCheck}
      >
        <Button asChild size="lg">
          <Link href="/reservar">Ir a reservar</Link>
        </Button>
      </EstadoVacio>
    );
  }

  const datos = previa.datos;
  // Lo que impide agendar y lo que solo hay que saber van por separado: el
  // registro de desparasitación falta en media guardería y no es un portazo.
  const bloqueos = datos
    ? [
        ...datos.admision.bloqueos.map((p) => p.mensaje),
        ...(datos.capacidad.hayCupo
          ? []
          : ["Ese día ya no nos queda cupo. Prueba con otro."]),
      ]
    : [];
  const avisos = datos
    ? datos.admision.problemas
        .filter((p) => !p.bloquea)
        .map((p) => p.mensaje)
    : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">El día de prueba</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Una jornada completa de jardín, de {NEGOCIO.jardin.horaApertura}:00 a{" "}
          {NEGOCIO.jardin.horaCierre}:00, para ver cómo se lleva con la patota.
          Si todo va bien, después puedes reservar hotel o días de jardín.
        </p>
      </div>

      {pendientes.length > 1 && (
        <div className="space-y-2">
          <Label>¿Quién viene?</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pendientes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPerroId(p.id)}
                className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                  elegido?.id === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70"
                }`}
              >
                <PerroAvatar
                  id={p.id}
                  nombre={p.nombre}
                  fotoUrl={p.fotoUrl}
                  tamano="lg"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {p.nombre}
                  </span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {p.raza}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-5">
          {elegido && (
            <div className="flex items-center gap-3">
              <PerroAvatar
                id={elegido.id}
                nombre={elegido.nombre}
                fotoUrl={elegido.fotoUrl}
                tamano="lg"
              />
              <div className="min-w-0">
                <p className="font-display truncate text-lg font-bold">
                  {elegido.nombre}
                </p>
                <Badge variant="warning">Día de prueba pendiente</Badge>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fecha">¿Qué día viene?</Label>
            <Input
              id="fecha"
              type="date"
              min={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            {/* El input muestra la fecha en el formato del navegador, que
                puede no ser el chileno: por eso va escrita debajo. */}
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              {formatearFechaLarga(fecha)}
            </p>
          </div>

          {previa.cargando && !datos ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : datos ? (
            <>
              <div className="bg-secondary/60 flex items-center justify-between gap-3 rounded-xl p-3">
                <span className="text-sm font-semibold">Día de prueba</span>
                <PrecioCLP monto={datos.cotizacion.total} />
              </div>

              {bloqueos.length > 0 && (
                <div className="bg-warning/12 text-warning space-y-1 rounded-xl p-3 text-sm">
                  {bloqueos.map((problema) => (
                    <p key={problema} className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      {problema}
                    </p>
                  ))}
                </div>
              )}

              {avisos.length > 0 && (
                <div className="text-muted-foreground space-y-1 text-xs">
                  {avisos.map((aviso) => (
                    <p key={aviso}>{aviso} Tráelo al día para la visita.</p>
                  ))}
                </div>
              )}
            </>
          ) : null}

          <Button
            size="xl"
            className="w-full"
            disabled={ocupado || !datos?.sePuede}
            onClick={agendar}
          >
            <CalendarCheck />
            {ocupado ? "Agendando…" : "Agendar el día de prueba"}
          </Button>

          <p className="text-muted-foreground text-center text-xs text-pretty">
            Se paga el mismo día, al retirar. Te escribimos por WhatsApp para
            coordinar la hora de entrega.
          </p>
        </CardContent>
      </Card>

      <p className="text-muted-foreground flex items-start gap-2 text-xs text-pretty">
        <PawPrint className="mt-0.5 size-4 shrink-0" />
        Trae el carnet de vacunas. Si alguna está vencida, la ponemos al día
        antes de la visita.
      </p>
    </div>
  );
}
