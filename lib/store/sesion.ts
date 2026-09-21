"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ID, Rol } from "@/lib/types";

/**
 * Sesión mock. No hay auth real: el rol se elige en el login y se guarda para
 * que el prototipo te recuerde entre refrescos.
 */
export interface Sesion {
  rol: Rol | null;
  /** Solo para el rol cliente: de quién es la cuenta que se está viendo. */
  clienteId?: ID;
  /** Solo para staff: quién firma los reportes e incidentes. */
  staff?: string;
}

interface EstadoSesion extends Sesion {
  entrar: (sesion: Sesion) => void;
  salir: () => void;
}

export const useSesion = create<EstadoSesion>()(
  persist(
    (set) => ({
      rol: null,
      clienteId: undefined,
      staff: undefined,
      entrar: (sesion) => set({ ...sesion }),
      salir: () => set({ rol: null, clienteId: undefined, staff: undefined }),
    }),
    { name: "patoteca:sesion:v1" },
  ),
);
