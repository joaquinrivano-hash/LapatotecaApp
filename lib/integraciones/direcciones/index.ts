/**
 * El buscador de direcciones de la app, o `null` si no hay llave.
 *
 * Sin llave el formulario vuelve a pedir la dirección y la comuna como
 * texto: un alta no puede quedar trancada porque falte configurar Google.
 */

import { crearBuscadorGoogle } from "@/lib/integraciones/direcciones/google";
import type { BuscadorDirecciones } from "@/lib/integraciones/direcciones/tipos";

export * from "@/lib/integraciones/direcciones/tipos";
export {
  comunaDe,
  conDepto,
  leerDireccion,
} from "@/lib/integraciones/direcciones/componentes";

let instancia: BuscadorDirecciones | null | undefined;

export function buscadorDeDirecciones(): BuscadorDirecciones | null {
  if (instancia === undefined) {
    // Literal a propósito: Next reemplaza NEXT_PUBLIC_* al compilar.
    const llave = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
    instancia =
      llave && typeof window !== "undefined" ? crearBuscadorGoogle(llave) : null;
  }
  return instancia;
}
