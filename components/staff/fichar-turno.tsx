"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { MOTIVO_SIN_UBICACION } from "@/lib/rules/ubicacion";
import { ficharTurno, miTurnoDeHoy } from "@/lib/servicios/turnos";
import { useSesion } from "@/lib/store/sesion";
import { formatearHora } from "@/lib/utils/fecha";
import { ubicacionActual } from "@/lib/utils/geolocalizacion";

/**
 * Fichar la entrada y la salida del turno.
 *
 * Aparece **solo si hay un turno asignado para hoy**: un botón de fichar
 * sin turno no tiene a qué pegarse, y pedirle a alguien que fiche algo que
 * nadie planificó es pedirle que invente el dato.
 *
 * No se puede corregir desde acá a propósito. El fichaje es la declaración
 * de quien lo hizo; una casilla que se puede reescribir al final del día
 * se llena con la hora que convenga y deja de significar algo. Si quedó
 * mal, lo arregla Administración.
 *
 * Al fichar se guarda dónde estaba el celular, y la tarjeta lo dice: a
 * quien se le registra la ubicación hay que contárselo, no esconderlo.
 * Sin ubicación se ficha igual, y el aviso dice por qué no salió, para
 * que se pueda arreglar antes del próximo turno.
 */
export function FicharTurno() {
  const usuarioId = useSesion((s) => s.usuarioId);
  const { ocupado, ejecutar } = useAccion();
  const [ubicando, setUbicando] = useState(false);
  const hoy = hoyDelStaff();

  const consulta = useConsulta(
    (repo) => (usuarioId ? miTurnoDeHoy(repo, usuarioId, hoy) : Promise.resolve(null)),
    [usuarioId ?? "", hoy],
  );

  const turno = consulta.datos;
  if (!turno) return null;

  async function fichar(lado: "entrada" | "salida") {
    // La hora es la del toque, no la de cuando el GPS contesta: buscar la
    // señal puede tardar, y esa espera no es un atraso de nadie.
    const ahora = new Date().toISOString();
    setUbicando(true);
    const ubicacion = await ubicacionActual();
    setUbicando(false);

    try {
      await ejecutar((repo) =>
        ficharTurno(repo, turno!.id, lado, ahora, ubicacion),
      );
      toast.success(lado === "entrada" ? "Buen turno 🐾" : "Hasta mañana 🐾", {
        description:
          "sinUbicacion" in ubicacion
            ? `Quedó sin ubicación: ${MOTIVO_SIN_UBICACION[ubicacion.sinUbicacion]}.`
            : undefined,
      });
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos registrarlo.",
      );
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="font-display block font-bold">
            Tu turno: {turno.desde} – {turno.hasta}
          </span>
          <span className="text-muted-foreground block text-sm">
            {turno.entradaReal
              ? `Entraste ${formatearHora(turno.entradaReal)}`
              : "Todavía no fichas la entrada"}
            {turno.salidaReal && ` · saliste ${formatearHora(turno.salidaReal)}`}
          </span>
          {!turno.salidaReal && (
            <span className="text-muted-foreground block text-xs text-pretty">
              Al fichar guardamos dónde estás, para saber que fichaste en la
              casa.
            </span>
          )}
        </span>

        {!turno.entradaReal ? (
          <Button
            size="lg"
            disabled={ocupado || ubicando}
            onClick={() => fichar("entrada")}
          >
            <LogIn />
            {ubicando ? "Ubicando…" : "Llegué"}
          </Button>
        ) : !turno.salidaReal ? (
          <Button
            size="lg"
            variant="outline"
            disabled={ocupado || ubicando}
            onClick={() => fichar("salida")}
          >
            <LogOut />
            {ubicando ? "Ubicando…" : "Me voy"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
