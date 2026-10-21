/**
 * Punto único de acceso a los datos.
 *
 * Hay dos implementaciones del mismo contrato y la app no sabe cuál está
 * usando: `RepositorioLocal` sobre localStorage (el prototipo) y
 * `RepositorioSupabase` sobre la base en la nube. Se elige con
 * `NEXT_PUBLIC_ORIGEN_DATOS` y ni un componente cambia.
 *
 * El interruptor es explícito y no "usa Supabase si hay llaves": tener las
 * llaves cargadas para probar una pantalla no debería cambiarle el origen de
 * los datos a una demo sin avisar.
 */

import { crearRepositorioLocal } from "@/lib/repo/local";
import { clienteSupabase } from "@/lib/repo/supabase/cliente";
import { crearRepositorioSupabase } from "@/lib/repo/supabase/repositorio";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";

export * from "@/lib/repo/tipos";
export { crearRepositorioLocal, ErrorRepositorio } from "@/lib/repo/local";
export { crearAlmacenLocal, crearAlmacenMemoria } from "@/lib/repo/almacen";
export { crearRepositorioSupabase } from "@/lib/repo/supabase/repositorio";
export { haySupabaseConfigurado } from "@/lib/repo/supabase/cliente";

export type OrigenDatos = "local" | "supabase";

/** De dónde salen los datos en este despliegue. */
export function origenDatos(): OrigenDatos {
  return process.env.NEXT_PUBLIC_ORIGEN_DATOS === "supabase"
    ? "supabase"
    : "local";
}

let instancia: RepositorioPatoteca | null = null;

/**
 * El repositorio de la app.
 *
 * Con origen `local` vive en el navegador: en el servidor el almacén cae a
 * memoria, así que nada revienta durante el render. Con origen `supabase`
 * habla con la base, y lo que se vea depende de quién esté con sesión abierta
 * — sin sesión, las políticas no entregan nada.
 */
export function repositorio(): RepositorioPatoteca {
  if (!instancia) {
    instancia =
      origenDatos() === "supabase"
        ? crearRepositorioSupabase(clienteSupabase())
        : crearRepositorioLocal();
  }
  return instancia;
}

/** Solo para tests: fuerza una instancia distinta. */
export function reemplazarRepositorio(nuevo: RepositorioPatoteca | null): void {
  instancia = nuevo;
}
