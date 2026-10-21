/**
 * Firma de los avisos del webhook de WhatsApp.
 *
 * Meta firma cada POST con el App Secret en `X-Hub-Signature-256`. Vive
 * aparte de `webhook.ts` porque usa `node:crypto` y ese archivo lo reexporta
 * el índice de mensajería, que también llega al navegador.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La firma se calcula sobre los bytes tal como llegaron: si se parsea el JSON
 * y se vuelve a serializar, cambia un espacio y deja de coincidir.
 */
export function firmaValida(
  cuerpoCrudo: string,
  cabecera: string | null,
  secreto: string,
): boolean {
  const recibida = cabecera?.match(/^sha256=([0-9a-f]{64})$/i)?.[1];
  if (!recibida) return false;

  const esperada = createHmac("sha256", secreto)
    .update(cuerpoCrudo, "utf8")
    .digest();

  // En tiempo constante: con `===` el tiempo de respuesta delata cuántos
  // caracteres del principio están bien, y la firma se adivina de a uno.
  return timingSafeEqual(Buffer.from(recibida, "hex"), esperada);
}
