/**
 * Punto único de acceso a la identidad.
 *
 * Se elige con el mismo interruptor que el repositorio: si los datos están
 * en la nube, la identidad también. Tenerlos cruzados no tiene sentido —un
 * login real contra datos del navegador, o datos de la nube sin saber quién
 * los pide— así que no hay una variable aparte que permita equivocarse.
 */

import { crearAutenticacionMock } from "@/lib/auth/mock";
import { crearAutenticacionSupabase } from "@/lib/auth/supabase";
import type { Autenticacion } from "@/lib/auth/tipos";
import { origenDatos } from "@/lib/repo";
import { clienteSupabase } from "@/lib/repo/supabase/cliente";

export * from "@/lib/auth/tipos";
export { crearAutenticacionMock } from "@/lib/auth/mock";
export { crearAutenticacionSupabase, explicarAuth } from "@/lib/auth/supabase";

let instancia: Autenticacion | null = null;

export function autenticacion(): Autenticacion {
  if (!instancia) {
    instancia =
      origenDatos() === "supabase"
        ? crearAutenticacionSupabase(clienteSupabase())
        : crearAutenticacionMock();
  }
  return instancia;
}

/** ¿Hay cuentas de verdad, con correo y contraseña? */
export function hayAuthReal(): boolean {
  return origenDatos() === "supabase";
}

/** Solo para tests. */
export function reemplazarAutenticacion(nueva: Autenticacion | null): void {
  instancia = nueva;
}
