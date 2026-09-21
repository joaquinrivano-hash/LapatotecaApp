/**
 * Fábrica del canal de mensajería.
 *
 * Cambiar de simulado a WhatsApp real es una variable de entorno:
 * `NEXT_PUBLIC_CANAL_MENSAJERIA=whatsapp`. Ni una pantalla se toca.
 */

import { modoCanalMensajeria } from "@/lib/integraciones/config";
import { crearCanalSimulado } from "@/lib/integraciones/mensajeria/canal-simulado";
import { crearCanalWhatsApp } from "@/lib/integraciones/mensajeria/canal-whatsapp";
import type { CanalMensajeria, EstadoIntegracion } from "@/lib/integraciones/tipos";

export * from "@/lib/integraciones/mensajeria/armado";
export * from "@/lib/integraciones/mensajeria/plantillas";
export * from "@/lib/integraciones/mensajeria/servicio";
export * from "@/lib/integraciones/mensajeria/webhook";
export { crearCanalSimulado } from "@/lib/integraciones/mensajeria/canal-simulado";
export { crearCanalWhatsApp } from "@/lib/integraciones/mensajeria/canal-whatsapp";

let instancia: CanalMensajeria | null = null;

export function crearCanalMensajeria(): CanalMensajeria {
  return modoCanalMensajeria() === "whatsapp"
    ? crearCanalWhatsApp()
    : crearCanalSimulado();
}

export function canalMensajeria(): CanalMensajeria {
  if (!instancia) instancia = crearCanalMensajeria();
  return instancia;
}

/** Solo para tests. */
export function reemplazarCanalMensajeria(nuevo: CanalMensajeria | null): void {
  instancia = nuevo;
}

/** Lo que muestra la pantalla de estado del sistema. */
export function estadoMensajeria(): EstadoIntegracion {
  const canal = canalMensajeria();
  return {
    clave: "mensajeria",
    nombre: canal.nombre,
    configurada: canal.configurado,
    simulada: canal.simulado,
    detalle: canal.simulado
      ? "Los mensajes quedan en la bandeja de salida y no salen a la red."
      : "Los mensajes se envían por WhatsApp Business.",
  };
}
