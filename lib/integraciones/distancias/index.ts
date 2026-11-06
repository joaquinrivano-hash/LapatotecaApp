/**
 * La calculadora de distancias, o `null` si no hay llave de servidor.
 *
 * Sin llave el traslado pide los kilómetros a mano, que es como funcionaba
 * antes: una cotización no puede quedar trancada porque falte configurar
 * Google.
 */

import { crearCalculadoraGoogle } from "@/lib/integraciones/distancias/google";
import type { CalculadoraDeDistancia } from "@/lib/integraciones/distancias/tipos";

export * from "@/lib/integraciones/distancias/tipos";

export function calculadoraDeDistancia(): CalculadoraDeDistancia | null {
  const llave = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? "";
  return llave ? crearCalculadoraGoogle(llave) : null;
}
