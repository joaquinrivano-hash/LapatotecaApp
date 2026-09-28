"use client";

/**
 * El día de prueba: elegir día y hora, pagarlo y poder cambiarlo.
 *
 * Es media jornada de jardín, así que la hora de llegada importa y se elige en
 * bloques de 30 minutos. El calendario muestra disponibilidad de verdad —cupo
 * de la casa y bloques ya tomados— en vez de dejar elegir cualquier día y
 * fallar después.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Clock,
  Info,
  PawPrint,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PoliticasDelDiaDePrueba } from "@/components/shared/politicas-dia-de-prueba";
import { PrecioCLP } from "@/components/shared/precio";
import { NEGOCIO } from "@/lib/config/negocio";
import { MOTIVO_EN_PALABRAS } from "@/lib/rules/dia-de-prueba";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { useCliente } from "@/lib/hooks/use-cliente";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  agendarDiaDePrueba,
  cancelarDiaDePrueba,
  cotizarDiaDePrueba,
  diaDePruebaAgendado,
  disponibilidadDeVariosDias,
  politicaDeCancelacion,
  reprogramarDiaDePrueba,
  RegistroRechazado,
} from "@/lib/servicios/registro";
import {
  formatearDiaSemanaCorto,
  formatearFechaLarga,
  formatearNumeroDeDia,
  hhmmDesdeMinutos,
  minutosDelDia,
  sumarDias,
} from "@/lib/utils/fecha";
import { formatearCLP } from "@/lib/utils/moneda";

/** Cuántos días adelante se muestran para elegir. */
const DIAS_A_LA_VISTA = 14;

export default function DiaDePrueba() {
  const hoy = hoyDelStaff();
  const router = useRouter();
  const base = useCliente();
  const { ocupado, ejecutar } = useAccion();

  const perros = base.datos?.perros ?? [];
  // Los que ya lo tienen agendado también entran: desde acá se cambia la hora
  // o se cancela, con la misma disponibilidad a la vista.
  const pendientes = perros.filter(
    (p) =>
      p.diaDePrueba.estado === "pendiente" ||
      p.diaDePrueba.estado === "agendado",
  );

  const [perroId, setPerroId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => sumarDias(hoy, 2));
  const [minuto, setMinuto] = useState<number | null>(null);

  const elegido = pendientes.find((p) => p.id === perroId) ?? pendientes[0] ?? null;

  const agenda = useConsulta(
    async (repo) =>
      elegido
        ? disponibilidadDeVariosDias(repo, elegido.id, hoy, DIAS_A_LA_VISTA)
        : null,
    [elegido?.id ?? "", hoy],
  );

  const previa = useConsulta(
    async (repo) =>
      elegido && minuto !== null
        ? cotizarDiaDePrueba(repo, elegido.id, fecha, minuto)
        : null,
    [elegido?.id ?? "", fecha, minuto],
  );

  const agendado = useConsulta(
    async (repo) => (elegido ? diaDePruebaAgendado(repo, elegido.id) : null),
    [elegido?.id ?? "", base.datos?.perros.length ?? 0],
  );

  const dia = agenda.datos?.find((d) => d.fecha === fecha);
  const yaAgendado = agendado.datos;
  const politica = yaAgendado
    ? politicaDeCancelacion(yaAgendado.inicioProgramado)
    : null;

  function elegirDia(nueva: string) {
    setFecha(nueva);
    setMinuto(null);
  }

  async function agendar() {
    if (!elegido || minuto === null) return;
    try {
      if (yaAgendado) {
        const { politica: aplicada } = await ejecutar((repo) =>
          reprogramarDiaDePrueba(repo, elegido.id, fecha, minuto),
        );
        toast.success(`Movimos el día de ${elegido.nombre}`, {
          description: aplicada.sinCosto
            ? `Ahora viene el ${formatearFechaLarga(fecha)}.`
            : `Ahora viene el ${formatearFechaLarga(fecha)}. Por avisar con menos de ${NEGOCIO.diaDePrueba.horasParaCancelarSinCosto} horas se agregó el cargo por el cambio.`,
        });
      } else {
        await ejecutar((repo) =>
          agendarDiaDePrueba(repo, elegido.id, fecha, minuto),
        );
        toast.success(
          `Listo: ${elegido.nombre} viene el ${formatearFechaLarga(fecha)}`,
          { description: "Te dejamos el cobro pendiente en tu cuenta." },
        );
      }
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

  async function cancelar() {
    if (!elegido) return;
    try {
      const { politica: aplicada } = await ejecutar((repo) =>
        cancelarDiaDePrueba(repo, elegido.id),
      );
      toast.success(`Cancelamos el día de ${elegido.nombre}`, {
        description: aplicada.sinCosto
          ? "No te cobramos nada."
          : `Avisaste con menos de ${NEGOCIO.diaDePrueba.horasParaCancelarSinCosto} horas, así que queda el cargo por cancelación tardía.`,
      });
      router.push("/mi-cuenta");
    } catch {
      toast.error("No pudimos cancelar ese día.");
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

  const bloqueos = previa.datos?.admision.bloqueos ?? [];
  const avisos =
    previa.datos?.admision.problemas.filter((p) => !p.bloquea) ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">El día de prueba</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Es <strong className="text-foreground">media jornada</strong> de un
          día de jardín normal: {NEGOCIO.diaDePrueba.horasDeEstadia} horas desde
          la hora que elijas. Así vemos cómo se lleva con los demás sin que sea
          un día entero de golpe.
        </p>
      </div>

      {pendientes.length > 1 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pendientes.map((perro) => (
            <button
              key={perro.id}
              type="button"
              onClick={() => setPerroId(perro.id)}
              className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${
                elegido?.id === perro.id
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <PerroAvatar
                id={perro.id}
                nombre={perro.nombre}
                fotoUrl={perro.fotoUrl}
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {perro.nombre}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {perro.raza}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {yaAgendado && politica && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <CalendarCheck className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold first-letter:uppercase">
                  {formatearFechaLarga(yaAgendado.fecha)}
                </p>
                <p className="text-muted-foreground">
                  Llega a las{" "}
                  {hhmmDesdeMinutos(minutosDelDia(yaAgendado.inicioProgramado))}
                  {" · "}
                  {politica.sinCosto
                    ? "todavía puedes cambiarlo sin costo"
                    : `cambiarlo ahora tiene un costo de ${formatearCLP(politica.costo)}`}
                  .
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={ocupado}
              onClick={cancelar}
            >
              <CalendarX />
              Cancelar el día de prueba
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck className="size-4" />
              {yaAgendado ? "Muévelo a otro día" : "Elige el día"}
            </h2>

            {agenda.cargando && !agenda.datos ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {(agenda.datos ?? []).map((disponible) => {
                  const activo = disponible.fecha === fecha;
                  const lleno = disponible.libres === 0;

                  return (
                    <button
                      key={disponible.fecha}
                      type="button"
                      disabled={lleno}
                      onClick={() => elegirDia(disponible.fecha)}
                      className={`flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl border-2 py-2 transition-all ${
                        activo
                          ? "border-primary bg-primary/10"
                          : lleno
                            ? "border-border/60 opacity-45"
                            : "border-border"
                      }`}
                    >
                      <span className="text-muted-foreground text-[11px] capitalize">
                        {formatearDiaSemanaCorto(disponible.fecha)}
                      </span>
                      <span className="text-lg leading-none font-bold">
                        {formatearNumeroDeDia(disponible.fecha)}
                      </span>
                      <span
                        className={`text-[11px] ${lleno ? "text-muted-foreground" : "text-success"}`}
                      >
                        {lleno ? "lleno" : `${disponible.libres} horas`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-muted-foreground text-xs first-letter:uppercase">
              {formatearFechaLarga(fecha)}
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4" />
              A qué hora llega
            </h2>

            {dia ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {dia.bloques.map((bloque) => (
                    <button
                      key={bloque.minutoDelDia}
                      type="button"
                      disabled={!bloque.disponible}
                      title={
                        bloque.motivo
                          ? MOTIVO_EN_PALABRAS[bloque.motivo]
                          : undefined
                      }
                      onClick={() => setMinuto(bloque.minutoDelDia)}
                      className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-all ${
                        minuto === bloque.minutoDelDia
                          ? "border-primary bg-primary text-primary-foreground"
                          : bloque.disponible
                            ? "border-border hover:border-primary"
                            : "border-border/50 text-muted-foreground line-through opacity-50"
                      }`}
                    >
                      {hhmmDesdeMinutos(bloque.minutoDelDia)}
                    </button>
                  ))}
                </div>
                {dia.libres === 0 && (
                  <p className="text-muted-foreground text-xs text-pretty">
                    Ese día no nos queda ninguna hora libre. Prueba con otro.
                  </p>
                )}
              </>
            ) : (
              <Skeleton className="h-16 rounded-xl" />
            )}
          </div>

          {minuto !== null && previa.datos && (
            <div className="bg-secondary/50 space-y-1 rounded-xl p-3 text-sm">
              <p className="font-semibold first-letter:uppercase">
                {formatearFechaLarga(fecha)}
              </p>
              <p className="text-muted-foreground">
                Llega a las {hhmmDesdeMinutos(minuto)} y lo retiras a las{" "}
                {hhmmDesdeMinutos(
                  minuto + NEGOCIO.diaDePrueba.horasDeEstadia * 60,
                )}
                .
              </p>
              <p className="flex items-center justify-between pt-1">
                <span>Día de prueba</span>
                <strong>
                  <PrecioCLP monto={previa.datos.cotizacion.total} />
                </strong>
              </p>
            </div>
          )}

          {bloqueos.length > 0 && (
            <div className="bg-warning/12 text-warning space-y-1 rounded-xl p-3 text-sm">
              {bloqueos.map((problema) => (
                <p key={problema.mensaje} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {problema.mensaje}
                </p>
              ))}
            </div>
          )}

          {avisos.length > 0 && (
            <div className="text-muted-foreground space-y-1 text-xs">
              {avisos.map((problema) => (
                <p key={problema.mensaje} className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {problema.mensaje}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PoliticasDelDiaDePrueba />

      <Button
        size="xl"
        className="w-full"
        disabled={
          minuto === null ||
          ocupado ||
          (yaAgendado ? !dia?.bloques.find((b) => b.minutoDelDia === minuto)?.disponible : !previa.datos?.sePuede)
        }
        onClick={agendar}
      >
        <PawPrint />
        {ocupado
          ? "Guardando…"
          : minuto === null
            ? "Elige una hora"
            : yaAgendado
              ? "Cambiar a esta hora"
              : "Agendar y pagar"}
      </Button>

      <p className="text-muted-foreground text-center text-xs text-pretty">
        Al agendar te dejamos el cobro en tu cuenta. Puedes cambiar la fecha o
        cancelar desde ahí.
      </p>

      {elegido && (
        <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-xs">
          <Badge variant="secondary">{elegido.nombre}</Badge>
          es quien viene este día.
        </p>
      )}
    </div>
  );
}
