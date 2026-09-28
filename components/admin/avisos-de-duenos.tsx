"use client";

/**
 * Lo que los dueños cambiaron en las fichas de sus perros.
 *
 * Se muestra el antes y el después de cada campo porque el aviso existe para
 * decidir: un peso que sube de 8 a 21 kg o una castración que se desmarca
 * cambian si el perro puede seguir viniendo. "Cambió la ficha" no serviría.
 */

import { useState } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { formatearDiaMes } from "@/lib/utils/fecha";

export function AvisosDeDuenos() {
  const { ocupado, ejecutar } = useAccion();
  const [version, setVersion] = useState(0);

  const avisos = useConsulta(
    (repo) => repo.notificaciones.sinLeer(),
    [version],
  );

  const sinLeer = (avisos.datos ?? []).slice().sort((a, b) =>
    b.creadaEn.localeCompare(a.creadaEn),
  );

  async function marcarTodas() {
    await ejecutar((repo) =>
      repo.notificaciones.marcarLeidas(sinLeer.map((a) => a.id)),
    );
    setVersion((v) => v + 1);
  }

  if (avisos.cargando && !avisos.datos) {
    return <Skeleton className="h-32" />;
  }

  if (sinLeer.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-5" />
            Cambios de los dueños
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {sinLeer.length} sin revisar.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={marcarTodas}
        >
          <Check />
          Listo
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {sinLeer.map((aviso) => (
            <li
              key={aviso.id}
              className="rounded-xl border border-border/70 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-pretty">
                  {aviso.titulo}
                </p>
                <span className="text-muted-foreground text-xs first-letter:uppercase">
                  {formatearDiaMes(aviso.creadaEn)}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {aviso.cambios.map((cambio) => (
                  <li key={cambio.campo} className="text-pretty">
                    <span className="font-semibold">{cambio.campo}:</span>{" "}
                    <span className="text-muted-foreground line-through">
                      {cambio.antes ?? "sin dato"}
                    </span>{" "}
                    → <span>{cambio.despues ?? "sin dato"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
