"use client";

import { create } from "zustand";

/**
 * Invalidación de consultas.
 *
 * El repositorio no avisa cuando cambia algo, así que después de cada mutación
 * se sube la versión y todas las consultas montadas se vuelven a correr. Es
 * tosco pero predecible, y con los volúmenes del prototipo se nota instantáneo.
 */
interface EstadoDatos {
  version: number;
  refrescar: () => void;
}

export const useVersionDatos = create<EstadoDatos>((set) => ({
  version: 0,
  refrescar: () => set((estado) => ({ version: estado.version + 1 })),
}));

/** Para llamar desde fuera de un componente. */
export function refrescarDatos(): void {
  useVersionDatos.getState().refrescar();
}
