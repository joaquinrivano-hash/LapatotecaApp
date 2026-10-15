/**
 * El análisis de horarios del periodo.
 *
 * Responde dos cosas que el calendario no contesta: **a qué hora pasa el
 * movimiento** y **cuánto se parece lo que pasó a lo que estaba agendado**.
 *
 * Solo mira jornadas y estadías CERRADAS. Una que está en curso todavía no
 * tiene hora de retiro, y contarla como "retiro a las 00:00" sería inventar
 * un dato.
 */

import {
  distribucionHoraria,
  porcentaje,
  repartirPuntualidad,
  type FranjaHoraria,
  type RepartoDePuntualidad,
} from "@/lib/rules/horarios";
import { marcaFueraDeTiempo } from "@/lib/rules/marca-de-asistencia";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type { FechaISO, InstanteISO } from "@/lib/types";

export interface AnalisisDeHorarios {
  franjas: FranjaHoraria[];
  llegadas: RepartoDePuntualidad;
  retiros: RepartoDePuntualidad;
  /**
   * Cuántos de los registros del periodo se marcaron a destiempo.
   *
   * No es un dato sobre los perros sino sobre la confianza que merece todo
   * lo de arriba: si la mitad se marcó horas después, las horas que se están
   * analizando son las que alguien recordó, no las que pasaron.
   */
  marcadosADestiempo: number;
  registros: number;
}

interface Movimiento {
  inicioProgramado: InstanteISO;
  finProgramado: InstanteISO;
  inicioReal?: InstanteISO;
  finReal?: InstanteISO;
  inicioMarcadoEn?: InstanteISO;
  finMarcadoEn?: InstanteISO;
}

export async function analizarHorarios(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<AnalisisDeHorarios> {
  const [reservas, estadias] = await Promise.all([
    repo.reservasHotel.enRango(desde, hasta),
    repo.estadiasJardin.enRango(desde, hasta),
  ]);

  // Solo las cerradas: una en curso no tiene hora de retiro, y contarla
  // como "retiro a las 00:00" sería inventar un dato.
  const movimientos: Movimiento[] = [...reservas, ...estadias].filter(
    (m) => Boolean(m.inicioReal && m.finReal),
  );

  const franjas = distribucionHoraria(
    movimientos.map((m) => ({ llegada: m.inicioReal, retiro: m.finReal })),
  );

  const llegadas = repartirPuntualidad(
    movimientos.map((m) => ({
      programado: m.inicioProgramado,
      real: m.inicioReal!,
    })),
  );
  const retiros = repartirPuntualidad(
    movimientos.map((m) => ({
      programado: m.finProgramado,
      real: m.finReal!,
    })),
  );

  const marcadosADestiempo = movimientos.filter(
    (m) =>
      marcaFueraDeTiempo(m.inicioReal!, m.inicioMarcadoEn) ||
      marcaFueraDeTiempo(m.finReal!, m.finMarcadoEn),
  ).length;

  return {
    franjas,
    llegadas,
    retiros,
    marcadosADestiempo,
    registros: movimientos.length,
  };
}

export { porcentaje };
