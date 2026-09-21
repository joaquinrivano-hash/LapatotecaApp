"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * false en el render del servidor y en la primera pasada del cliente.
 *
 * Los datos viven en localStorage, que el servidor no tiene: sin esto React
 * reclamaría que el HTML del servidor no coincide con el del navegador.
 *
 * Se usa `useSyncExternalStore` en vez del clásico `useState` + `useEffect`
 * porque es la forma que React reconoce para distinguir servidor de cliente,
 * y no provoca un render en cascada.
 */
export function useMontado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}
