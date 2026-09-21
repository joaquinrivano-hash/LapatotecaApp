/**
 * Canal simulado: no toca la red.
 *
 * Es el que corre por defecto, para que el prototipo se pueda demostrar sin
 * cuenta de Meta. Los mensajes quedan igual en la bandeja de salida con su
 * estado, así que la pantalla se ve exactamente igual que con el canal real.
 */

import type { CanalMensajeria, ResultadoEnvio } from "@/lib/integraciones/tipos";
import type { MensajeSaliente } from "@/lib/types";

export interface OpcionesCanalSimulado {
  /** Demora fingida, para que la UI muestre el estado "enviando". */
  latenciaMs?: number;
  /** Permite forzar fallas y probar el reintento. */
  falla?: (mensaje: MensajeSaliente) => string | null;
}

export function crearCanalSimulado(
  opciones: OpcionesCanalSimulado = {},
): CanalMensajeria {
  const { latenciaMs = 350, falla } = opciones;
  let contador = 0;

  return {
    nombre: "Simulado",
    configurado: true,
    simulado: true,

    async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
      if (latenciaMs > 0) {
        await new Promise((listo) => setTimeout(listo, latenciaMs));
      }

      const error = falla?.(mensaje) ?? null;
      if (error) return { ok: false, error, simulado: true };

      contador += 1;
      return {
        ok: true,
        idProveedor: `sim-${Date.now().toString(36)}-${contador}`,
        simulado: true,
      };
    },
  };
}
