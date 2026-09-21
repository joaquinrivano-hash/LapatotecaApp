/**
 * Punto único de acceso a los datos.
 *
 * Para migrar a Supabase: escribe `RepositorioSupabase` cumpliendo las
 * interfaces de `tipos.ts` y cámbialo acá. Ni un componente se toca.
 */

import { crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";

export * from "@/lib/repo/tipos";
export { crearRepositorioLocal, ErrorRepositorio } from "@/lib/repo/local";
export { crearAlmacenLocal, crearAlmacenMemoria } from "@/lib/repo/almacen";

let instancia: RepositorioPatoteca | null = null;

/**
 * El repositorio de la app. Vive en el navegador: en el servidor devuelve uno
 * en memoria, así que las pantallas leen sus datos desde el cliente.
 */
export function repositorio(): RepositorioPatoteca {
  if (!instancia) instancia = crearRepositorioLocal();
  return instancia;
}

/** Solo para tests: fuerza una instancia distinta. */
export function reemplazarRepositorio(nuevo: RepositorioPatoteca | null): void {
  instancia = nuevo;
}
