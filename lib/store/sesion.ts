"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ID, Rol } from "@/lib/types";

/**
 * Quién está usando la app, según la app.
 *
 * En el prototipo se llena con el clic del selector de rol. En la nube la
 * llena `lib/auth` desde la sesión de Supabase, así que las pantallas leen
 * de un solo lugar y no tienen que saber en cuál de los dos mundos están.
 *
 * Ojo con lo que esto NO es: no protege nada. El rol vive en el navegador y
 * cualquiera lo puede cambiar desde la consola. Lo que decide qué datos se
 * entregan son las políticas de RLS; esto decide qué se dibuja.
 */
export interface Sesion {
  rol: Rol | null;
  /** Solo para el rol cliente: de quién es la cuenta que se está viendo. */
  clienteId?: ID;
  /** Solo para staff: quién firma los reportes e incidentes. */
  staff?: string;
  email?: string;
  /** `auth.users.id`. En el prototipo no existe. */
  usuarioId?: ID;
}

interface EstadoSesion extends Sesion {
  /**
   * ¿Ya sabemos quién está?
   *
   * `rol: null` significa dos cosas muy distintas: "no hay nadie" y "todavía
   * no preguntamos". En la nube averiguarlo es una ida al servidor, y
   * mientras no vuelve una pantalla que no distinga los dos casos muestra
   * "no tienes reservas" a alguien que sí las tiene.
   *
   * En el prototipo la respuesta es inmediata, así que nace resuelta.
   */
  resuelta: boolean;
  entrar: (sesion: Sesion) => void;
  salir: () => void;
  /** Lo que usa `lib/auth` para volcar la sesión real. */
  sincronizar: (sesion: Sesion | null) => void;
}

const VACIA: Sesion = {
  rol: null,
  clienteId: undefined,
  staff: undefined,
  email: undefined,
  usuarioId: undefined,
};

export const useSesion = create<EstadoSesion>()(
  persist(
    (set) => ({
      ...VACIA,
      resuelta: true,
      entrar: (sesion) => set({ ...VACIA, ...sesion, resuelta: true }),
      salir: () => set({ ...VACIA, resuelta: true }),
      sincronizar: (sesion) =>
        set({ ...VACIA, ...(sesion ?? {}), resuelta: true }),
    }),
    {
      name: "patoteca:sesion:v1",
      // `resuelta` no se guarda: es sobre esta carga, no sobre la sesión.
      partialize: ({ rol, clienteId, staff, email, usuarioId }) => ({
        rol,
        clienteId,
        staff,
        email,
        usuarioId,
      }),
    },
  ),
);
