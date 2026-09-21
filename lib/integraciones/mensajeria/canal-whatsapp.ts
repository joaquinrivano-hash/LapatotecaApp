/**
 * Canal de WhatsApp Business.
 *
 * No llama a Meta directo desde el navegador: el token es secreto y no puede
 * viajar al cliente. Pasa por `/api/integraciones/whatsapp/enviar`, que es
 * quien tiene las credenciales.
 */

import type { CanalMensajeria, ResultadoEnvio } from "@/lib/integraciones/tipos";
import type { MensajeSaliente } from "@/lib/types";

export const RUTA_ENVIO = "/api/integraciones/whatsapp/enviar";

export function crearCanalWhatsApp(
  opciones: { endpoint?: string } = {},
): CanalMensajeria {
  const endpoint = opciones.endpoint ?? RUTA_ENVIO;

  return {
    nombre: "WhatsApp Business",
    configurado: true,
    simulado: false,

    async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
      try {
        const respuesta = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mensaje),
        });

        const cuerpo = (await respuesta.json()) as Partial<ResultadoEnvio>;

        if (!respuesta.ok || !cuerpo.ok) {
          return {
            ok: false,
            error: cuerpo.error ?? `WhatsApp respondió ${respuesta.status}.`,
            simulado: cuerpo.simulado ?? false,
          };
        }

        return {
          ok: true,
          idProveedor: cuerpo.idProveedor,
          simulado: cuerpo.simulado ?? false,
        };
      } catch (error) {
        // Sin conexión o el endpoint caído: el mensaje queda fallido en la
        // bandeja y se puede reintentar desde la app.
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "No pudimos contactar a WhatsApp.",
          simulado: false,
        };
      }
    },
  };
}
