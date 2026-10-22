/**
 * Lectura de los componentes de una dirección de Google.
 *
 * Puro y aparte del adaptador para poder probarlo sin red: lo que importa
 * acá es de dónde sale la comuna, y eso tiene un caso que engaña.
 */

import type {
  ComponenteDireccion,
  DireccionElegida,
} from "@/lib/integraciones/direcciones/tipos";

function buscar(
  componentes: ComponenteDireccion[],
  tipo: string,
): string | null {
  return componentes.find((c) => c.types.includes(tipo))?.longText ?? null;
}

/**
 * La comuna.
 *
 * En Chile Google la pone como `administrative_area_level_3`. La `locality`
 * casi siempre coincide, pero no siempre: en el centro dice "Santiago" para
 * direcciones de comunas vecinas. Por eso va primero el nivel 3 y la
 * localidad queda de respaldo.
 */
export function comunaDe(componentes: ComponenteDireccion[]): string {
  return (
    buscar(componentes, "administrative_area_level_3") ??
    buscar(componentes, "locality") ??
    buscar(componentes, "sublocality") ??
    ""
  );
}

/** Lee la dirección completa a partir de lo que devuelve Places. */
export function leerDireccion(
  componentes: ComponenteDireccion[],
  textoCompleto: string,
): DireccionElegida {
  const calle = buscar(componentes, "route");
  const numero = buscar(componentes, "street_number");

  return {
    // Sin calle (un lugar con nombre, un edificio) se usa el primer tramo del
    // texto completo, que es lo que la persona reconoce.
    direccion: calle
      ? [calle, numero].filter(Boolean).join(" ")
      : textoCompleto.split(",")[0].trim(),
    comuna: comunaDe(componentes),
    tieneNumero: numero !== null,
  };
}

/** "Av. Providencia 1234" + "402" → "Av. Providencia 1234, depto 402". */
export function conDepto(direccion: string, depto: string): string {
  const limpio = depto.trim();
  if (!limpio) return direccion;
  // Si ya lo escribió con la palabra ("casa B", "of. 3"), no se la repetimos.
  return /^\d/.test(limpio)
    ? `${direccion}, depto ${limpio}`
    : `${direccion}, ${limpio}`;
}
