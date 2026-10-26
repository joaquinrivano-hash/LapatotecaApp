/**
 * La ubicación del celular, para el fichaje.
 *
 * **Nunca falla**: sin permiso, sin señal o sin respuesta devuelve el
 * motivo en vez de tirar un error. El fichaje no puede depender del GPS —la
 * hora es lo que importa, y quien está llegando con un perro en brazos no
 * va a pelear con los permisos del navegador—, así que lo que no se pudo
 * saber queda dicho y el fichaje se guarda igual.
 */

import type { MotivoSinUbicacion, UbicacionDeFichaje } from "@/lib/types";

type Geolocalizador = Pick<Geolocation, "getCurrentPosition">;

/** Los códigos de `GeolocationPositionError`. */
const POR_CODIGO: Record<number, MotivoSinUbicacion> = {
  1: "permiso",
  2: "no_disponible",
  3: "tiempo",
};

/** Cinco decimales son un metro: más que eso es ruido del GPS. */
const redondear = (grados: number) => Math.round(grados * 1e5) / 1e5;

export function ubicacionActual(
  geo: Geolocalizador | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.geolocation,
  /**
   * El `timeout` del navegador no cuenta el rato que el aviso de permiso
   * queda abierto sin que nadie lo toque. Sin este tope, un aviso ignorado
   * dejaría el botón de fichar pegado para siempre.
   */
  esperaMaximaMs = 15_000,
): Promise<UbicacionDeFichaje> {
  if (!geo) return Promise.resolve({ sinUbicacion: "sin_soporte" });

  return new Promise((resolver) => {
    let listo = false;
    const terminar = (ubicacion: UbicacionDeFichaje) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      resolver(ubicacion);
    };
    const reloj = setTimeout(
      () => terminar({ sinUbicacion: "tiempo" }),
      esperaMaximaMs,
    );

    try {
      geo.getCurrentPosition(
        (posicion) =>
          terminar({
            lat: redondear(posicion.coords.latitude),
            lng: redondear(posicion.coords.longitude),
            precisionM: Math.round(posicion.coords.accuracy),
          }),
        (error) =>
          terminar({ sinUbicacion: POR_CODIGO[error.code] ?? "no_disponible" }),
        // Una posición de hace un minuto sirve: la persona no se movió de
        // la puerta, y pedir una nueva es hacerla esperar.
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    } catch {
      terminar({ sinUbicacion: "sin_soporte" });
    }
  });
}
