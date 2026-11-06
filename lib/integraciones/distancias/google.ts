/**
 * Distancias con la Routes API de Google.
 *
 * Se usa la Routes API y no Distance Matrix porque es la que Google mantiene
 * (Distance Matrix quedó como "legacy") y porque acá siempre se pregunta por
 * UN origen y UN destino: la matriz no aporta nada y cobra igual.
 *
 * La llave es de SERVIDOR y no la del buscador de direcciones. Aquella está
 * restringida por dominio —así se protege una llave que viaja al navegador—
 * y una restricción por dominio no sirve para una llamada que sale del
 * servidor, donde no hay página que la mande. Pedirle a esta que fuera
 * pública obligaría a dejarla sin restringir.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import type { CalculadoraDeDistancia } from "@/lib/integraciones/distancias/tipos";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Solo pedimos los metros: el resto de la respuesta se cobra igual. */
const CAMPOS = "routes.distanceMeters";

/** El cuerpo de la consulta. Puro, para poder probarlo sin red. */
export function cuerpoDeConsulta(direccion: string) {
  return {
    origin: {
      location: {
        latLng: {
          latitude: NEGOCIO.ubicacion.lat,
          longitude: NEGOCIO.ubicacion.lng,
        },
      },
    },
    // Se manda la dirección escrita y no unas coordenadas: el alta ya la
    // eligió de la lista de Google, así que es una que Google sabe resolver.
    destination: { address: `${direccion}, Chile` },
    travelMode: "DRIVE",
    units: "METRIC",
  };
}

/**
 * Los kilómetros que salen de la respuesta, o `null`.
 *
 * Se redondea a un decimal porque lo que decide el precio es el TRAMO, no el
 * metro: mostrar "4.231 km" promete una precisión que la tarifa no usa.
 *
 * Una ruta sin `distanceMeters` es una ruta que Google no supo armar; vale
 * `null` y no cero, que se leería como "está al lado".
 */
export function kmDeRespuesta(cuerpo: unknown): number | null {
  const rutas = (cuerpo as { routes?: { distanceMeters?: number }[] })?.routes;
  const metros = rutas?.[0]?.distanceMeters;
  if (typeof metros !== "number" || !Number.isFinite(metros) || metros <= 0) {
    return null;
  }
  return Math.round(metros / 100) / 10;
}

export function crearCalculadoraGoogle(llave: string): CalculadoraDeDistancia {
  return {
    async kmHasta(direccion) {
      if (!direccion.trim()) return null;
      try {
        const respuesta = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": llave,
            "X-Goog-FieldMask": CAMPOS,
          },
          body: JSON.stringify(cuerpoDeConsulta(direccion)),
        });
        if (!respuesta.ok) return null;
        return kmDeRespuesta(await respuesta.json());
      } catch {
        // Una distancia que no llega no tranca el traslado: los km quedan
        // a mano, que es como funcionaba antes de que existiera esto.
        return null;
      }
    },
  };
}
