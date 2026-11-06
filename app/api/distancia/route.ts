/**
 * Cuántos kilómetros hay de la casa a una dirección.
 *
 * Esta ruta existe para que la llave de Google NUNCA llegue al navegador. La
 * pantalla manda la dirección acá y el servidor habla con Google.
 *
 * Sin `GOOGLE_MAPS_SERVER_API_KEY` responde 200 con `km: null` y no un error:
 * que no haya llave no es una falla que el dueño tenga que entender, es la
 * app funcionando como antes, con los kilómetros escritos a mano. Un 503 acá
 * haría que la pantalla mostrara un problema donde no hay ninguno.
 */

import { NextResponse } from "next/server";
import { calculadoraDeDistancia } from "@/lib/integraciones/distancias";

export async function POST(peticion: Request) {
  let direccion = "";
  try {
    const cuerpo = (await peticion.json()) as { direccion?: unknown };
    if (typeof cuerpo.direccion === "string") direccion = cuerpo.direccion;
  } catch {
    return NextResponse.json({ km: null }, { status: 400 });
  }

  if (!direccion.trim()) return NextResponse.json({ km: null });

  const calculadora = calculadoraDeDistancia();
  if (!calculadora) return NextResponse.json({ km: null, sinLlave: true });

  return NextResponse.json({ km: await calculadora.kmHasta(direccion) });
}
