/**
 * La distancia entre lo que pasó y cuándo alguien lo anotó.
 *
 * El cuidador marca de un toque, y a veces marca después: el perro llegó a
 * las 8:00 y él alcanzó a tocar el botón a las 8:40. Las dos horas son
 * verdad, y sirven para cosas distintas.
 *
 * **La hora real es la que cobra.** El desfase no toca ni un peso: dice qué
 * tan al día se está marcando, que es información sobre la operación y no
 * sobre el perro. Confundirlas sería cobrarle a un dueño por lo ocupado que
 * estuvo el equipo.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { minutosEntre } from "@/lib/utils/fecha";
import type { InstanteISO } from "@/lib/types";

/**
 * Minutos entre lo que pasó y cuándo se marcó.
 *
 * Positivo es lo normal cuando hay desfase: se marcó DESPUÉS. Negativo
 * significa que alguien anotó una llegada antes de que ocurriera, que pasa
 * cuando se deja todo listo de antemano.
 */
export function desfaseDeMarca(
  real: InstanteISO,
  marcadaEn: InstanteISO | undefined,
): number {
  if (!marcadaEn) return 0;
  return Math.round(minutosEntre(real, marcadaEn));
}

/** Si ese desfase es lo bastante grande como para que valga la pena decirlo. */
export function marcaFueraDeTiempo(
  real: InstanteISO,
  marcadaEn: InstanteISO | undefined,
): boolean {
  return (
    Math.abs(desfaseDeMarca(real, marcadaEn)) >
    NEGOCIO.asistencia.minutosDeMarcaAlDia
  );
}

/**
 * El desfase en palabras, o `null` cuando está al día.
 *
 * Devuelve `null` y no "0 min" a propósito: lo normal no merece una línea en
 * pantalla. Lo que no se dice es lo que deja ver lo que sí importa.
 */
export function describirDesfase(
  real: InstanteISO,
  marcadaEn: InstanteISO | undefined,
): string | null {
  if (!marcaFueraDeTiempo(real, marcadaEn)) return null;

  const minutos = desfaseDeMarca(real, marcadaEn);
  const cuanto = enPalabras(Math.abs(minutos));
  return minutos > 0 ? `marcado ${cuanto} después` : `marcado ${cuanto} antes`;
}

function enPalabras(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const enHoras = `${horas} h`;
  return resto === 0 ? enHoras : `${enHoras} ${resto} min`;
}
