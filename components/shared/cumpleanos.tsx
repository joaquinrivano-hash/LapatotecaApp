"use client";

/**
 * Los cumpleaños, donde sirven.
 *
 * En Hoy es una tira que aparece solo si hay alguno: un recuadro vacío todos
 * los días enseña a ignorarlo. En el backoffice es el mes completo, que es lo
 * que se necesita para alcanzar a preparar algo.
 */

import { Cake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { cumpleanosDeHoy, cumpleanosDelMes } from "@/lib/servicios/cumpleanos";
import { formatearDiaMes, formatearMes } from "@/lib/utils/fecha";
import { listarNombres } from "@/lib/integraciones/mensajeria/plantillas";

export function CumpleanosDeHoy({ hoy }: { hoy: string }) {
  const consulta = useConsulta((repo) => cumpleanosDeHoy(repo, hoy), [hoy]);
  const cumpleaneros = consulta.datos ?? [];

  if (cumpleaneros.length === 0) return null;

  return (
    <div className="bg-accent/15 flex items-center gap-3 rounded-2xl p-3">
      <Cake className="text-accent-foreground size-6 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">
          Hoy cumple {cumpleaneros.length === 1 ? "años" : "años"}{" "}
          {listarNombres(cumpleaneros.map((c) => c.perro.nombre))}
        </p>
        <p className="text-muted-foreground text-xs text-pretty">
          {cumpleaneros.length === 1
            ? `${cumpleaneros[0].cumple} ${cumpleaneros[0].cumple === 1 ? "año" : "años"}. Sácale una foto para el reporte.`
            : "Sácales una foto para el reporte."}
        </p>
      </div>
    </div>
  );
}

export function CumpleanosDelMes({ hoy }: { hoy: string }) {
  const consulta = useConsulta((repo) => cumpleanosDelMes(repo, hoy), [hoy]);
  const cumpleaneros = consulta.datos ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Cake className="size-5" />
          Cumpleaños de <span className="capitalize">{formatearMes(hoy)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {consulta.cargando ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : cumpleaneros.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Este mes no cumple años ninguno. 🎂
          </p>
        ) : (
          <ul className="space-y-2">
            {cumpleaneros.map((cumpleanos) => (
              <li
                key={`${cumpleanos.perro.id}-${cumpleanos.fecha}`}
                className={`flex items-center gap-3 rounded-xl p-2 ${
                  cumpleanos.fecha === hoy ? "bg-accent/15" : ""
                }`}
              >
                <PerroAvatar
                  id={cumpleanos.perro.id}
                  nombre={cumpleanos.perro.nombre}
                  fotoUrl={cumpleanos.perro.fotoUrl}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {cumpleanos.perro.nombre}
                    {cumpleanos.fecha === hoy && " · ¡hoy!"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {cumpleanos.cliente
                      ? `${cumpleanos.cliente.nombre} ${cumpleanos.cliente.apellido}`
                      : "Sin dueño registrado"}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold first-letter:uppercase">
                    {formatearDiaMes(cumpleanos.fecha)}
                  </p>
                  <p className="text-muted-foreground">
                    cumple {cumpleanos.cumple}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
