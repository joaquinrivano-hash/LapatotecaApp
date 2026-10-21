/**
 * El cliente de Supabase del navegador.
 *
 * Es `createBrowserClient` de `@supabase/ssr` y no el `createClient` pelado
 * porque la sesión del usuario se guarda en cookies: así el servidor de Next
 * puede leer quién es en una ruta protegida, que es lo que va a hacer falta
 * cuando el selector de rol desaparezca.
 *
 * La llave que va acá es la **anon**, y es pública a propósito: viaja en el
 * paquete que descarga el navegador, cualquiera la puede leer. Lo que impide
 * que con ella se vean los datos de otro no es el secreto de la llave, son
 * las políticas de RLS. Por eso las migraciones de permisos no son un
 * trámite: son lo único que separa un dato privado de un dato público.
 *
 * La llave `service_role` NUNCA va acá ni en ninguna variable `NEXT_PUBLIC_`:
 * esa se salta RLS entera.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo que la app usa del cliente de Supabase: las tablas, las funciones y la
 * sesión. Se nombra en vez de usar `SupabaseClient` entero para que en los
 * tests se pueda pasar un doble sin tener que imitar la librería completa.
 */
export type ClienteSupabase = Pick<SupabaseClient, "from" | "rpc" | "auth">;

export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const LLAVE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function haySupabaseConfigurado(): boolean {
  return URL_SUPABASE.length > 0 && LLAVE_SUPABASE.length > 0;
}

let cliente: ClienteSupabase | null = null;

export function clienteSupabase(): ClienteSupabase {
  if (cliente) return cliente;

  if (!haySupabaseConfigurado()) {
    // Falla fuerte y temprano a propósito. Caer al repositorio local en
    // silencio sería mostrar datos de demostración en una pantalla que la
    // dueña va a leer como si fueran los de su negocio.
    throw new Error(
      "Falta configurar Supabase: NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  cliente = createBrowserClient(URL_SUPABASE, LLAVE_SUPABASE);
  return cliente;
}
