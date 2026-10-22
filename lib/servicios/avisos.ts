/**
 * Los avisos que le llegan a Administración cuando el dueño cambia lo
 * agendado.
 *
 * Una cancelación sin aviso es invisible: el día desaparece del calendario y
 * nadie se entera de quién avisó ni cuándo. Por eso cancelar y mover dejan
 * una `Notificacion`, por el mismo canal que las correcciones de ficha.
 */

import type { RepositorioPatoteca, SinId } from "@/lib/repo/tipos";
import type { Notificacion } from "@/lib/types";

/** "30 h antes", o "después de la hora de llegada" si el día ya había empezado. */
export function describirAviso(horasDeAviso: number): string {
  return horasDeAviso < 0
    ? "después de la hora de llegada"
    : `${Math.floor(horasDeAviso)} h antes`;
}

/**
 * Deja el aviso sin trancar lo que ya pasó.
 *
 * Se llama DESPUÉS de cancelar o mover, que en la nube es una transacción
 * aparte y ya quedó hecha. Si el aviso fallara y el error subiera, la
 * pantalla diría "no pudimos cancelar" de algo que sí se canceló, y el dueño
 * lo intentaría de nuevo. Igual que un mensaje que no sale no es motivo para
 * no cobrar: queda anotado en la consola y la cancelación sigue en pie.
 */
export async function dejarAviso(
  repo: RepositorioPatoteca,
  aviso: SinId<Notificacion>,
): Promise<Notificacion | null> {
  try {
    return await repo.notificaciones.crear(aviso);
  } catch (problema) {
    console.error("No se pudo dejar el aviso a Administración", problema);
    return null;
  }
}
