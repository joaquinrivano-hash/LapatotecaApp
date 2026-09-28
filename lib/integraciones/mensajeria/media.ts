/**
 * La foto del reporte, de la bandeja a Meta.
 *
 * El equipo saca la foto en el celular y la app la guarda comprimida como data
 * URL (ver `lib/utils/imagen`). WhatsApp no acepta eso: el encabezado de imagen
 * pide un link HTTPS que **su** servidor pueda descargar, y un data URL no lo
 * es —el mensaje sale, pero llega sin foto y con un error de descarga—.
 *
 * Como el prototipo no tiene dónde publicar la foto, se sube a la API de medios
 * de Meta y el mensaje la referencia por id. El id vive 30 días y sirve solo
 * para el número que lo subió, que es exactamente lo que necesita un reporte:
 * se manda y se olvida.
 */

/** Tope de Meta para una imagen. Las fotos comprimidas pesan ~200 KB. */
export const LIMITE_IMAGEN_MB = 5;

export interface ImagenLeida {
  tipo: string;
  bytes: Uint8Array<ArrayBuffer>;
  nombreArchivo: string;
}

export function esDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

/** "image/jpeg" → "jpg". Meta exige nombre de archivo en el multipart. */
function extensionDe(tipo: string): string {
  const subtipo = tipo.split("/")[1] ?? "jpg";
  return subtipo === "jpeg" ? "jpg" : subtipo;
}

export function leerDataUrl(dataUrl: string): ImagenLeida {
  // A mano y no con una expresión regular: el contenido va después de la
  // primera coma y puede traer saltos de línea.
  const coma = dataUrl.indexOf(",");
  if (!esDataUrl(dataUrl) || coma === -1) {
    throw new Error("La foto no es un data URL válido.");
  }

  const cabecera = dataUrl.slice("data:".length, coma);
  if (!cabecera.endsWith(";base64")) {
    throw new Error("La foto tiene que venir en base64.");
  }
  const tipo = cabecera.slice(0, -";base64".length);

  const binario = atob(dataUrl.slice(coma + 1));
  // El ArrayBuffer va explícito para que los bytes sirvan como Blob.
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }

  const megas = bytes.length / (1024 * 1024);
  if (megas > LIMITE_IMAGEN_MB) {
    throw new Error(
      `La foto pesa ${megas.toFixed(1)} MB y WhatsApp acepta hasta ${LIMITE_IMAGEN_MB} MB.`,
    );
  }

  return { tipo, bytes, nombreArchivo: `reporte.${extensionDe(tipo)}` };
}
