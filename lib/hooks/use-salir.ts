"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { autenticacion } from "@/lib/auth";

/**
 * Cerrar sesión de verdad.
 *
 * Tiene que pasar por la capa de identidad y no limpiar el store a mano: en
 * modo nube la sesión de Supabase seguiría abierta en su cookie, `SesionViva`
 * la volvería a leer y el store se llenaría de nuevo en el siguiente evento.
 * El botón "Salir" parecería andar y la persona seguiría adentro.
 *
 * Y después se navega, no se deja a alguien mirando una pantalla que ya no
 * tiene permiso de mostrarle nada.
 */
export function useSalir(destino = "/ingresar") {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const salir = useCallback(async () => {
    setSaliendo(true);
    try {
      await autenticacion().salir();
    } finally {
      // Se navega igual si el cierre falló: la sesión local ya no sirve y
      // dejar a la persona en el backoffice sería peor que mandarla al
      // login y que vuelva a entrar.
      router.replace(destino);
      router.refresh();
    }
  }, [router, destino]);

  return { salir, saliendo };
}
