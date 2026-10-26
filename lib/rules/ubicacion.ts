/**
 * Dónde se fichó: la distancia a la casa y qué se puede decir de ella.
 *
 * Todo es puro: recibe el punto que dio el celular y el de la casa, y no
 * sabe que existe un GPS ni una base de datos. La distancia se calcula al
 * mostrar y no se guarda: si algún día se corrige el punto de la casa, los
 * fichajes viejos se vuelven a medir contra el bueno.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import type { MotivoSinUbicacion, UbicacionDeFichaje } from "@/lib/types";

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_M = 6_371_000;

/** Distancia en metros entre dos puntos, por el arco de la Tierra. */
export function metrosEntre(a: Punto, b: Punto): number {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

export type DondeFicho =
  | { tipo: "en_la_casa"; metros: number; precisionM: number }
  | { tipo: "lejos"; metros: number; precisionM: number }
  | { tipo: "imprecisa"; metros: number; precisionM: number }
  | { tipo: "sin_ubicacion"; motivo: MotivoSinUbicacion };

/**
 * Qué se puede decir de un fichaje con lo que dio el celular.
 *
 * La precisión manda antes que la distancia, en las dos direcciones:
 *
 * - **Lejos** es solo cuando ni el error alcanza: un punto a 3 km con
 *   ±200 m está lejos igual, pero uno a 300 m con ±200 m puede estar en la
 *   puerta. Acusar a alguien de fichar en la calle por un GPS movido es
 *   peor que no decir nada.
 * - **En la casa** pide además una precisión razonable: con ±2 km
 *   cualquier punto del barrio "calza", y eso no dice nada.
 * - Lo que queda en medio es **imprecisa**: el celular no supo.
 */
export function dondeFicho(
  ubicacion: UbicacionDeFichaje,
  casa: Punto = NEGOCIO.ubicacion,
  radioM: number = NEGOCIO.turnos.radioDeLaCasaM,
  precisionMaximaM: number = NEGOCIO.turnos.precisionMaximaM,
): DondeFicho {
  if ("sinUbicacion" in ubicacion) {
    return { tipo: "sin_ubicacion", motivo: ubicacion.sinUbicacion };
  }

  const metros = metrosEntre(ubicacion, casa);
  const { precisionM } = ubicacion;

  if (metros - precisionM > radioM) return { tipo: "lejos", metros, precisionM };
  if (precisionM <= precisionMaximaM) {
    return { tipo: "en_la_casa", metros, precisionM };
  }
  return { tipo: "imprecisa", metros, precisionM };
}

export const MOTIVO_SIN_UBICACION: Record<MotivoSinUbicacion, string> = {
  permiso: "el celular no dio permiso",
  no_disponible: "el celular no encontró dónde estaba",
  tiempo: "el celular tardó demasiado en contestar",
  sin_soporte: "el navegador no la entrega",
};

/** "450 m", "2,3 km". Redondeado: el GPS no da para más. */
export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${Math.max(10, Math.round(metros / 10) * 10)} m`;
  const km = Math.round(metros / 100) / 10;
  return `${String(km).replace(".", ",")} km`;
}

/**
 * En palabras, para la planilla: "en la casa", "a 2,3 km de la casa",
 * "sin ubicación: el celular no dio permiso".
 *
 * El "±" va solo cuando el error es más grande que la casa: con ±20 m no
 * aporta nada, y con ±400 m es justo lo que hay que saber para no
 * creerle de más al número.
 */
export function describirDondeFicho(donde: DondeFicho): string {
  switch (donde.tipo) {
    case "en_la_casa":
      return "en la casa";
    case "lejos": {
      const margen =
        donde.precisionM > NEGOCIO.turnos.radioDeLaCasaM
          ? ` (±${formatearDistancia(donde.precisionM)})`
          : "";
      return `a ${formatearDistancia(donde.metros)} de la casa${margen}`;
    }
    case "imprecisa":
      return `ubicación poco precisa (±${formatearDistancia(donde.precisionM)})`;
    case "sin_ubicacion":
      return `sin ubicación: ${MOTIVO_SIN_UBICACION[donde.motivo]}`;
  }
}
