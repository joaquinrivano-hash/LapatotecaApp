/**
 * Compresión de fotos antes de guardarlas.
 *
 * Las fotos de los reportes se guardan como data URL en localStorage, que
 * tiene unos 5 MB en total. Una foto de celular sin tocar pesa 3-5 MB: tres
 * reportes y el prototipo se queda sin espacio. Por eso toda imagen pasa por
 * acá antes de guardarse.
 */

export interface OpcionesCompresion {
  /** Lado más largo, en píxeles. */
  ladoMaximo?: number;
  calidad?: number;
}

export async function comprimirImagen(
  archivo: File,
  { ladoMaximo = 1280, calidad = 0.75 }: OpcionesCompresion = {},
): Promise<string> {
  const bitmap = await createImageBitmap(archivo);

  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const contexto = lienzo.getContext("2d");
  if (!contexto) {
    bitmap.close();
    throw new Error("No pudimos procesar la foto en este navegador.");
  }

  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return lienzo.toDataURL("image/jpeg", calidad);
}

/** Peso aproximado en KB de un data URL, para avisar antes de guardar. */
export function pesoAproximadoKB(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 0.75) / 1024);
}
