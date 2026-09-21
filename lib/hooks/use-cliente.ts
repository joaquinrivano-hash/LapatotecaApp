"use client";

import { useConsulta } from "@/lib/hooks/use-consulta";
import { useSesion } from "@/lib/store/sesion";
import type { Cliente, Perro } from "@/lib/types";

export interface DatosDelCliente {
  cliente: Cliente | null;
  perros: Perro[];
}

/** El cliente de la sesión con sus perros. La base de todo el portal. */
export function useCliente() {
  const clienteId = useSesion((s) => s.clienteId);

  return useConsulta<DatosDelCliente>(
    async (repo) => {
      if (!clienteId) return { cliente: null, perros: [] };
      const [cliente, perros] = await Promise.all([
        repo.clientes.obtener(clienteId),
        repo.perros.porCliente(clienteId),
      ]);
      return { cliente, perros };
    },
    [clienteId ?? ""],
  );
}
