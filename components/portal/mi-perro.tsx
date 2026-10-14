"use client";

/**
 * La ficha del perro para su dueño.
 *
 * Es la misma que ven el equipo y Administración, más un botón para corregir
 * los datos. El dueño puede cambiarlos sin pedir permiso —son suyos y nadie
 * los conoce mejor—, pero cada cambio le avisa a Administración con el antes y
 * el después: un peso que sube de 8 a 21 kg cambia si el perro puede quedarse.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import {
  CarnetDeVacunas,
  DatosPerro,
  FotoPerro,
  HistorialIncidentes,
} from "@/components/shared/detalle-perro";
import {
  aBorrador,
  cambiosDePerro,
  estadoDesde,
  FormularioPerro,
  type EstadoPerro,
} from "@/components/shared/formulario-perro";
import { revisarAltaDePerro, type FaltanteDeAlta } from "@/lib/rules/alta-perro";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { actualizarPerroComoDueno } from "@/lib/servicios/perros";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import type { Perro } from "@/lib/types";

export function MiPerro({
  perro,
  hoy,
  onGuardado,
}: {
  perro: Perro;
  hoy: string;
  onGuardado: () => void;
}) {
  const { ocupado, ejecutar } = useAccion();
  const [editando, setEditando] = useState(false);
  const [ficha, setFicha] = useState<EstadoPerro>(() => estadoDesde(perro));
  const [faltantes, setFaltantes] = useState<FaltanteDeAlta[]>([]);

  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);

  function empezarAEditar() {
    setFicha(estadoDesde(perro));
    setFaltantes([]);
    setEditando(true);
  }

  async function guardar() {
    const reglas = configuracion.datos;
    if (!reglas) return;

    const revision = revisarAltaDePerro(aBorrador(ficha), reglas, hoy);
    setFaltantes(revision);
    if (revision.length > 0) {
      toast.error("Falta completar la ficha.", {
        description: revision[0].mensaje,
      });
      return;
    }

    const { cambios } = await ejecutar((repo) =>
      actualizarPerroComoDueno(repo, perro.id, cambiosDePerro(ficha, reglas)),
    );

    setEditando(false);
    onGuardado();
    toast.success(
      cambios.length === 0
        ? "No había nada que cambiar"
        : `Listo, ${perro.nombre} quedó actualizado`,
      {
        description:
          cambios.length > 0
            ? "Le avisamos a La Patoteca de lo que cambiaste."
            : undefined,
      },
    );
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
            <SheetDescription>{perro.raza}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-3 overflow-y-auto px-5 pb-2">
        {editando ? (
          configuracion.datos ? (
            <FormularioPerro
              estado={ficha}
              onCambio={setFicha}
              configuracion={configuracion.datos}
              faltantes={faltantes}
              hoy={hoy}
            />
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          )
        ) : (
          <>
            <FotoPerro perro={perro} />
            <DatosPerro perro={perro} hoy={hoy} />
            <CarnetDeVacunas perro={perro} />

            {perro.diaDePrueba.estado === "agendado" &&
              perro.diaDePrueba.fecha && (
                <Link
                  href="/dia-de-prueba"
                  className="bg-jardin-suave flex items-center gap-2 rounded-xl p-3 text-sm"
                >
                  <CalendarCheck className="size-4 shrink-0" />
                  <span className="text-pretty">
                    Su día de prueba es el{" "}
                    <strong>{formatearFechaLarga(perro.diaDePrueba.fecha)}</strong>.
                    Tócalo para cambiarlo o cancelarlo.
                  </span>
                </Link>
              )}

            <HistorialIncidentes perroId={perro.id} hoy={hoy} />
          </>
        )}
      </div>

      <SheetFooter>
        {editando ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setEditando(false)}
            >
              <X />
              Dejar así
            </Button>
            <Button className="flex-1" disabled={ocupado} onClick={guardar}>
              <Save />
              {ocupado ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        ) : (
          <Button size="xl" variant="outline" onClick={empezarAEditar}>
            <Pencil />
            Corregir sus datos
          </Button>
        )}
      </SheetFooter>
    </>
  );
}
