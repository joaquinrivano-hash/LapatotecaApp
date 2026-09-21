/**
 * Plantillas de WhatsApp Business.
 *
 * Para escribirle PRIMERO a un cliente (fuera de la ventana de 24 h desde su
 * último mensaje), WhatsApp exige una plantilla aprobada previamente en
 * WhatsApp Manager. No se puede mandar texto libre. Por eso los reportes viven
 * acá y no se arman en la pantalla.
 *
 * Los parámetros son POSICIONALES ({{1}}, {{2}}, …), tal como los pide Meta.
 * Para dar de alta la integración hay que crear estas mismas plantillas, con
 * el mismo nombre e idioma, en el panel de Meta.
 */

export interface Plantilla {
  /** Debe coincidir exactamente con el `name` aprobado en WhatsApp Manager. */
  nombre: string;
  idioma: string;
  descripcion: string;
  /** Qué significa cada {{n}}, en orden. */
  parametros: readonly string[];
  cuerpo: string;
  /** Las plantillas con encabezado de imagen mandan la foto del día. */
  encabezado?: "imagen";
}

export const PLANTILLAS = {
  reporte_diario: {
    nombre: "reporte_diario",
    idioma: "es_CL",
    descripcion: "El reporte del día que se manda al dueño con la foto.",
    parametros: ["nombre del dueño", "nombre de los perros", "nota del día"],
    encabezado: "imagen",
    cuerpo:
      "¡Hola {{1}}! 🐾\n\nAsí estuvo hoy {{2}} en La Patoteca:\n\n{{3}}\n\nCualquier cosa nos escribes por acá. ¡Nos vemos pronto!",
  },
  aviso_incidente: {
    nombre: "aviso_incidente",
    idioma: "es_CL",
    descripcion: "Aviso al dueño cuando pasa algo que debe saber.",
    parametros: ["nombre del dueño", "nombre del perro", "qué pasó"],
    cuerpo:
      "Hola {{1}}, te contamos algo que pasó hoy con {{2}} en La Patoteca:\n\n{{3}}\n\nQuedó anotado en su ficha. Cualquier duda respóndenos por acá.",
  },
  recordatorio_reserva: {
    nombre: "recordatorio_reserva",
    idioma: "es_CL",
    descripcion: "Recordatorio de una reserva de hotel o jardín que viene.",
    parametros: ["nombre del dueño", "nombre del perro", "cuándo"],
    cuerpo:
      "Hola {{1}}, te recordamos la reserva de {{2}} en La Patoteca: {{3}}.\n\n¡Te esperamos!",
  },
  cuenta_mensual: {
    nombre: "cuenta_mensual",
    idioma: "es_CL",
    descripcion: "La cuenta unificada que se emite el día 1 de cada mes.",
    parametros: ["nombre del dueño", "mes", "monto"],
    cuerpo:
      "Hola {{1}}, ya está tu cuenta de La Patoteca de {{2}}: {{3}}.\n\nPuedes pagarla por transferencia o en el local. ¡Gracias!",
  },
} as const satisfies Record<string, Plantilla>;

export type ClavePlantilla = keyof typeof PLANTILLAS;

/** Reemplaza {{1}}, {{2}}, … por los valores, en orden. */
export function renderizarPlantilla(
  plantilla: Plantilla,
  parametros: readonly string[],
): string {
  return plantilla.cuerpo.replace(/\{\{(\d+)\}\}/g, (original, indice) => {
    const valor = parametros[Number(indice) - 1];
    return valor ?? original;
  });
}

/** "Pelusa" · "Pelusa y Rocco" · "Pelusa, Rocco y Luna" */
export function listarNombres(nombres: readonly string[]): string {
  if (nombres.length === 0) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}
