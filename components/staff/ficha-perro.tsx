"use client";

import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AjustarHora } from "@/components/staff/ajustar-hora";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import {
  CarnetDeVacunas,
  DatosPerro,
  FotoPerro,
  HistorialIncidentes,
} from "@/components/shared/detalle-perro";
import type { ItemAsistencia } from "@/components/staff/fila-asistencia";
import { formatearHora } from "@/lib/utils/fecha";
import type { Cliente, Perro } from "@/lib/types";

/**
 * La ficha que se abre al tocar un perro, igual en Hoy y en Buscar.
 *
 * El contenido es el mismo que ve el admin en la ficha del cliente: quién es,
 * qué come, qué cuidado especial tiene y si ya pasó algo antes. Acá es de solo
 * lectura —los datos los carga el dueño al crear la cuenta y los corrige el
 * admin— y lo único accionable es la entrada o la salida, abajo y en el mismo
 * lugar siempre.
 */
export function FichaPerro({
  perro,
  cliente,
  item,
  onAjustarHora,
  hoy,
  ocupado,
  onAccion,
}: {
  perro: Perro;
  cliente?: Cliente;
  item?: ItemAsistencia;
  /** Corregir la hora real de la llegada o el retiro ya marcados. */
  onAjustarHora?: (que: "llegada" | "retiro", nueva: string) => void;
  hoy: string;
  ocupado?: boolean;
  onAccion: (accion: "llego" | "se_fue") => void;
}) {
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

      <div className="space-y-3 overflow-y-auto px-5 pb-2">
        <FotoPerro perro={perro} />
        <DatosPerro
          perro={perro}
          cliente={cliente}
          hoy={hoy}
          horario={
            item
              ? `${formatearHora(item.inicioProgramado)} a ${formatearHora(item.finProgramado)}`
              : undefined
          }
        />
        {/* Corregir la hora vive acá y no en la tarjeta: la tarjeta tiene
            dos blancos —el cuerpo abre la ficha, el botón grande marca— y un
            tercero los habría puesto a pelear. Además el cuerpo es un botón,
            así que otro botón adentro sería HTML inválido. */}
        {item && onAjustarHora && (item.inicioReal || item.finReal) && (
          <div className="border-border/70 space-y-2 rounded-xl border p-3">
            <p className="text-sm font-semibold">¿Lo marcaste a destiempo?</p>
            <div className="flex flex-wrap gap-2">
              {item.inicioReal && (
                <AjustarHora
                  que="llegada"
                  real={item.inicioReal}
                  marcadaEn={item.inicioMarcadoEn}
                  ocupado={ocupado}
                  onGuardar={(nueva) => onAjustarHora("llegada", nueva)}
                />
              )}
              {item.finReal && (
                <AjustarHora
                  que="retiro"
                  real={item.finReal}
                  marcadaEn={item.finMarcadoEn}
                  ocupado={ocupado}
                  onGuardar={(nueva) => onAjustarHora("retiro", nueva)}
                />
              )}
            </div>
          </div>
        )}

        <CarnetDeVacunas perro={perro} />
        <HistorialIncidentes perroId={perro.id} hoy={hoy} />
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
