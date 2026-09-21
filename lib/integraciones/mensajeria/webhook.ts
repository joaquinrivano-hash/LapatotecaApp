/**
 * Lectura del webhook de WhatsApp Business.
 *
 * Meta manda los cambios de estado dentro de un payload bastante anidado
 * (entry → changes → value → statuses) y con nombres propios. Traducirlo vive
 * acá, aparte de la ruta, para poder testearlo.
 */

import type { EstadoMensaje } from "@/lib/types";

/** Los estados de Meta, traducidos a los nuestros. */
export const ESTADOS_WHATSAPP: Record<string, EstadoMensaje> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

export interface CambioDeEstado {
  idProveedor: string;
  estado: EstadoMensaje;
  destino?: string;
  error?: string;
}

export function extraerCambiosDeEstado(cuerpo: unknown): CambioDeEstado[] {
  const cambios: CambioDeEstado[] = [];
  const entradas = (cuerpo as { entry?: unknown[] })?.entry ?? [];

  for (const entrada of entradas) {
    const cambiosEntrada = (entrada as { changes?: unknown[] })?.changes ?? [];

    for (const cambio of cambiosEntrada) {
      const estados =
        (cambio as { value?: { statuses?: unknown[] } })?.value?.statuses ?? [];

      for (const estado of estados) {
        const e = estado as {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: { title?: string; message?: string }[];
        };
        if (!e.id || !e.status) continue;

        cambios.push({
          idProveedor: e.id,
          estado: ESTADOS_WHATSAPP[e.status] ?? "enviado",
          destino: e.recipient_id,
          error: e.errors?.[0]?.message ?? e.errors?.[0]?.title,
        });
      }
    }
  }

  return cambios;
}
