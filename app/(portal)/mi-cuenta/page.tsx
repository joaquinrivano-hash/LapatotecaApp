"use client";

import Image from "next/image";
import { CalendarDays, Camera, PawPrint, Ticket, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PrecioCLP } from "@/components/shared/precio";
import { BarraParticipacion } from "@/components/admin/barra-participacion";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { useCliente } from "@/lib/hooks/use-cliente";
import { nombreDePlan, planVigente, saldoPlan } from "@/lib/rules/planes";
import { alertasDePerro } from "@/lib/servicios/clientes";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import {
  formatearDiaMes,
  formatearFecha,
  formatearHora,
} from "@/lib/utils/fecha";

export default function MiCuenta() {
  const hoy = hoyDelStaff();
  const clienteId = useSesion((s) => s.clienteId);
  const base = useCliente();

  const extra = useConsulta(
    async (repo) => {
      if (!clienteId) return null;
      const perros = await repo.perros.porCliente(clienteId);
      const ids = new Set(perros.map((p) => p.id));

      const [planes, reservas, estadias, reportes] = await Promise.all([
        repo.planes.porCliente(clienteId),
        repo.reservasHotel.porCliente(clienteId),
        repo.estadiasJardin.porCliente(clienteId),
        repo.reportes.listar(),
      ]);

      return {
        planes,
        reservas,
        estadias,
        reportes: reportes
          .filter((r) => r.perroIds.some((id) => ids.has(id)))
          .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
          .slice(0, 20),
      };
    },
    [clienteId ?? ""],
  );

  const perros = base.datos?.perros ?? [];
  const datos = extra.datos;

  if (base.cargando && perros.length === 0) return <Skeleton className="h-96" />;

  const vigentes = (datos?.planes ?? []).filter((p) => planVigente(p, hoy));
  const proximas = [
    ...(datos?.reservas ?? [])
      .filter(
        (r) =>
          r.inicioProgramado.slice(0, 10) >= hoy &&
          r.estado !== "cancelada" &&
          r.estado !== "finalizada",
      )
      .map((r) => ({
        id: r.id,
        linea: "hotel" as const,
        perroId: r.perroId,
        fecha: r.inicioProgramado.slice(0, 10),
        detalle: `Hasta el ${formatearFecha(r.finProgramado)}`,
        total: r.cotizacion.total,
      })),
    ...(datos?.estadias ?? [])
      .filter((e) => e.fecha >= hoy && e.estado !== "cancelada")
      .map((e) => ({
        id: e.id,
        linea: "jardin" as const,
        perroId: e.perroId,
        fecha: e.fecha,
        detalle: `${formatearHora(e.inicioProgramado)} a ${formatearHora(e.finProgramado)}`,
        total: e.cotizacion?.total ?? 0,
      })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const nombrePerro = (id: string) =>
    perros.find((p) => p.id === id)?.nombre ?? "Tu perro";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">
          Hola{base.datos?.cliente ? `, ${base.datos.cliente.nombre}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Tus perros, tus planes y cómo les fue.
        </p>
      </div>

      <section className="space-y-2">
        {perros.map((perro) => {
          const alertas = alertasDePerro(perro, hoy);
          const bloquea = alertas.some((a) => a.bloquea);
          return (
            <Card key={perro.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <PerroAvatar
                  id={perro.id}
                  nombre={perro.nombre}
                  fotoUrl={perro.fotoUrl}
                  tamano="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-lg font-bold">
                    {perro.nombre}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {perro.raza} · {perro.pesoKg} kg
                  </p>
                  {alertas.length > 0 && (
                    <p
                      className={cn(
                        "mt-1 text-sm",
                        bloquea ? "text-destructive" : "text-warning",
                      )}
                    >
                      {alertas[0].mensaje}
                    </p>
                  )}
                </div>
                {alertas.length > 0 && (
                  <Badge variant={bloquea ? "destructive" : "warning"}>
                    <TriangleAlert />
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {vigentes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Tus planes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vigentes.map((plan) => (
              <div key={plan.id} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {nombrePerro(plan.perroId)}
                    <Badge variant="jardin" className="ml-2">
                      <Ticket />
                      {nombreDePlan(plan)}
                    </Badge>
                  </span>
                  <span className="text-sm tabular-nums">
                    te quedan <strong>{saldoPlan(plan)}</strong> de{" "}
                    {plan.diasTotales}
                  </span>
                </div>
                <BarraParticipacion
                  etiqueta=""
                  valor=""
                  fraccion={plan.diasUsados / plan.diasTotales}
                  tono="jardin"
                  className="[&>div:first-child]:hidden"
                />
                <p className="text-muted-foreground text-xs">
                  Vence el {formatearFecha(`${plan.venceEn}T12:00:00Z`)}. Los
                  días no usados no pasan al mes siguiente.
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="proximas">
        <TabsList>
          <TabsTrigger value="proximas">
            Lo que viene
            {proximas.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-1.5 text-xs tabular-nums">
                {proximas.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="proximas" className="mt-3 space-y-2">
          {extra.cargando && !datos ? (
            <Skeleton className="h-32" />
          ) : proximas.length === 0 ? (
            <EstadoVacio
              titulo="No tienes nada agendado"
              descripcion="Cuando reserves un día o una estadía, va a aparecer acá."
              icono={CalendarDays}
            />
          ) : (
            proximas.map((item) => (
              <Card key={`${item.linea}-${item.id}`}>
                <CardContent className="flex items-center gap-3 p-3">
                  <PerroAvatar
                    id={item.perroId}
                    nombre={nombrePerro(item.perroId)}
                    tamano="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold capitalize">
                      {formatearDiaMes(`${item.fecha}T12:00:00Z`)}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {nombrePerro(item.perroId)} · {item.detalle}
                    </p>
                  </div>
                  <Badge variant={item.linea === "hotel" ? "hotel" : "jardin"}>
                    {item.linea === "hotel" ? "Hotel" : "Jardín"}
                  </Badge>
                  {item.total > 0 && <PrecioCLP monto={item.total} />}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="reportes" className="mt-3 space-y-2">
          {extra.cargando && !datos ? (
            <Skeleton className="h-40" />
          ) : (datos?.reportes ?? []).length === 0 ? (
            <EstadoVacio
              titulo="Todavía no hay reportes"
              descripcion="Te mandamos 2 o 3 al día cuando tu perro está con nosotros."
              icono={Camera}
            />
          ) : (
            (datos?.reportes ?? []).map((reporte) => (
              <Card key={reporte.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    {reporte.perroIds.slice(0, 3).map((id) => (
                      <PerroAvatar
                        key={id}
                        id={id}
                        nombre={nombrePerro(id)}
                        tamano="sm"
                      />
                    ))}
                    <span className="text-muted-foreground text-sm capitalize">
                      {formatearDiaMes(`${reporte.fecha}T12:00:00Z`)} ·{" "}
                      {reporte.autorStaff}
                    </span>
                  </div>

                  {reporte.fotoUrl ? (
                    <Image
                      src={reporte.fotoUrl}
                      alt={`Foto del ${reporte.fecha}`}
                      width={640}
                      height={420}
                      unoptimized
                      className="h-48 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="bg-secondary/60 text-muted-foreground flex h-24 items-center justify-center gap-2 rounded-xl text-sm">
                      <PawPrint className="size-4" />
                      Sin foto
                    </div>
                  )}

                  <p className="text-sm text-pretty">{reporte.nota}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
