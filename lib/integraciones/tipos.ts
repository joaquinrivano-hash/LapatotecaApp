/**
 * Contrato de integraciones con servicios externos.
 *
 * Mismo criterio que el repositorio: la app habla con la interfaz, nunca con
 * el proveedor. Hoy hay un canal simulado que no toca la red y un adaptador de
 * WhatsApp Business; mañana se pueden agregar email, SMS o pasarela de pago
 * sin tocar las pantallas.
 */

import type { MensajeSaliente } from "@/lib/types";

export interface ResultadoEnvio {
  ok: boolean;
  /** Id del proveedor, para cruzar después con sus webhooks de estado. */
  idProveedor?: string;
  error?: string;
  /** true si el envío fue fingido y no salió ningún mensaje de verdad. */
  simulado: boolean;
}

export interface CanalMensajeria {
  readonly nombre: string;
  /** false cuando faltan credenciales: la app lo dice en pantalla. */
  readonly configurado: boolean;
  /** true si no sale nada a la red. */
  readonly simulado: boolean;
  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio>;
}

/** Cómo se ve una integración en la pantalla de estado del sistema. */
export interface EstadoIntegracion {
  clave: string;
  nombre: string;
  configurada: boolean;
  simulada: boolean;
  detalle: string;
}
