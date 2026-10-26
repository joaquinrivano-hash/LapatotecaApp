import { afterEach, describe, expect, it, vi } from "vitest";
import { ubicacionActual } from "@/lib/utils/geolocalizacion";

type Exito = (posicion: GeolocationPosition) => void;
type Fallo = (error: GeolocationPositionError) => void;

/** Un GPS de mentira que contesta lo que se le pida. */
function gps(contestar: (exito: Exito, fallo: Fallo) => void) {
  return {
    getCurrentPosition: (exito: Exito, fallo?: Fallo | null) =>
      contestar(exito, fallo ?? (() => {})),
  };
}

const posicion = (latitude: number, longitude: number, accuracy: number) =>
  ({ coords: { latitude, longitude, accuracy } }) as GeolocationPosition;
const error = (code: number) => ({ code }) as GeolocationPositionError;

afterEach(() => vi.useRealTimers());

describe("ubicacionActual", () => {
  it("devuelve el punto con su precisión, redondeado al metro", async () => {
    const u = await ubicacionActual(
      gps((exito) => exito(posicion(-33.443612345, -70.618987654, 23.6))),
    );
    expect(u).toEqual({ lat: -33.44361, lng: -70.61899, precisionM: 24 });
  });

  it("sin permiso no falla: dice el motivo", async () => {
    const u = await ubicacionActual(gps((_, fallo) => fallo(error(1))));
    expect(u).toEqual({ sinUbicacion: "permiso" });
  });

  it("sin señal tampoco", async () => {
    const u = await ubicacionActual(gps((_, fallo) => fallo(error(2))));
    expect(u).toEqual({ sinUbicacion: "no_disponible" });
  });

  it("sin geolocalización en el navegador", async () => {
    await expect(ubicacionActual(undefined)).resolves.toEqual({
      sinUbicacion: "sin_soporte",
    });
  });

  // El aviso de permiso que nadie toca no cuenta para el timeout del
  // navegador: sin este tope el botón quedaría pegado.
  it("si nadie contesta, se rinde y dice que tardó", async () => {
    vi.useFakeTimers();
    const promesa = ubicacionActual(
      gps(() => {}),
      15_000,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promesa).resolves.toEqual({ sinUbicacion: "tiempo" });
  });

  it("una respuesta tardía después de rendirse no cambia nada", async () => {
    vi.useFakeTimers();
    let tarde: Exito = () => {};
    const promesa = ubicacionActual(
      gps((exito) => {
        tarde = exito;
      }),
      1_000,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    tarde(posicion(-33.44, -70.61, 10));
    await expect(promesa).resolves.toEqual({ sinUbicacion: "tiempo" });
  });
});
