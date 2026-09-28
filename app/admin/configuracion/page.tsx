"use client";

/**
 * Qué se le exige a una ficha nueva.
 *
 * Vive acá y no en el código porque es una decisión de la casa, no una regla
 * del sistema: el día que llegue una vacuna nueva o se deje de pedir el
 * carnet, se cambia desde este panel.
 */

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save, ShieldCheck, Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import type { CampoDeAlta, TipoVacuna } from "@/lib/types";

const CAMPOS: { valor: CampoDeAlta; etiqueta: string; ayuda: string }[] = [
  {
    valor: "fechaNacimiento",
    etiqueta: "Fecha de nacimiento",
    ayuda: "De acá salen la edad y el cumpleaños.",
  },
  {
    valor: "foto",
    etiqueta: "Foto del perro",
    ayuda: "Para reconocerlo apenas llega.",
  },
  {
    valor: "carnetVacunas",
    etiqueta: "Foto del carnet de vacunación",
    ayuda: "Permite verificar las fechas que escribió el dueño.",
  },
  {
    valor: "alimentacion",
    etiqueta: "Comida",
    ayuda: "Marca, cuánto por porción y en qué comidas.",
  },
  {
    valor: "antiparasitario",
    etiqueta: "Antiparasitario",
    ayuda: "Cuándo se lo dieron y cada cuánto se repite.",
  },
];

export default function Configuracion() {
  const { ocupado, ejecutar } = useAccion();
  const [version, setVersion] = useState(0);
  const configuracion = useConsulta(
    (repo) => repo.configuracion.obtener(),
    [version],
  );

  const actual = configuracion.datos;

  async function alternarCampo(campo: CampoDeAlta) {
    if (!actual) return;
    const camposObligatorios = actual.camposObligatorios.includes(campo)
      ? actual.camposObligatorios.filter((c) => c !== campo)
      : [...actual.camposObligatorios, campo];

    await ejecutar((repo) => repo.configuracion.guardar({ camposObligatorios }));
    setVersion((v) => v + 1);
  }

  async function alternarVacuna(tipo: TipoVacuna) {
    if (!actual) return;
    const vacunasObligatorias = actual.vacunasObligatorias.includes(tipo)
      ? actual.vacunasObligatorias.filter((v) => v !== tipo)
      : [...actual.vacunasObligatorias, tipo];

    await ejecutar((repo) =>
      repo.configuracion.guardar({ vacunasObligatorias }),
    );
    setVersion((v) => v + 1);
  }

  async function restaurar() {
    await ejecutar((repo) => repo.configuracion.restaurar());
    setVersion((v) => v + 1);
    toast.success("Volvimos a lo de siempre");
  }

  if (!actual) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Qué le pedimos</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Esto es lo que el dueño tiene que completar para crear la ficha de su
          perro. Lo que apagues acá sigue existiendo en el formulario, pero deja
          de ser obligatorio.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Syringe className="size-5" />
            Vacunas obligatorias
          </CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            Se le pide el vencimiento de cada una, y un perro con alguna vencida
            no puede quedarse.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {NEGOCIO.admision.vacunasObligatorias.map((tipo) => (
            <Opcion
              key={tipo}
              etiqueta={nombreVacuna(tipo)}
              activa={actual.vacunasObligatorias.includes(tipo)}
              ocupado={ocupado}
              onCambio={() => alternarVacuna(tipo)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Datos obligatorios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CAMPOS.map((campo) => (
            <Opcion
              key={campo.valor}
              etiqueta={campo.etiqueta}
              ayuda={campo.ayuda}
              activa={actual.camposObligatorios.includes(campo.valor)}
              ocupado={ocupado}
              onCambio={() => alternarCampo(campo.valor)}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Save className="size-3.5 shrink-0" />
          Se guarda solo. Última vez:{" "}
          {formatearFechaLarga(actual.actualizadoEn)}.
        </p>
        <Button variant="outline" disabled={ocupado} onClick={restaurar}>
          <RotateCcw />
          Volver a lo de siempre
        </Button>
      </div>
    </div>
  );
}

function Opcion({
  etiqueta,
  ayuda,
  activa,
  ocupado,
  onCambio,
}: {
  etiqueta: string;
  ayuda?: string;
  activa: boolean;
  ocupado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="bg-secondary/40 flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3">
      <span className="min-w-0 text-sm">
        <span className="block font-semibold capitalize">{etiqueta}</span>
        {ayuda && (
          <span className="text-muted-foreground block text-xs text-pretty">
            {ayuda}
          </span>
        )}
      </span>
      <Switch checked={activa} disabled={ocupado} onCheckedChange={onCambio} />
    </label>
  );
}
