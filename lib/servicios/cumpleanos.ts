/**
 * Los cumpleaños, para el equipo y para el backoffice.
 *
 * No se guardan como avisos: se calculan de la fecha de nacimiento cada vez.
 * Un cumpleaños guardado en una tabla se desincroniza el día que alguien
 * corrige la fecha, y además habría que generarlos todos los años.
 */

import { cumpleanosEntre, type CumpleanosDePerro } from "@/lib/rules/perro";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { primerDiaDelMes, ultimoDiaDelMes } from "@/lib/utils/fecha";
import type { Cliente, FechaISO } from "@/lib/types";

export interface CumpleanosConDueno extends CumpleanosDePerro {
  cliente?: Cliente;
}

async function conDuenos(
  repo: RepositorioPatoteca,
  cumpleanos: CumpleanosDePerro[],
): Promise<CumpleanosConDueno[]> {
  const clientes = await repo.clientes.listar();
  const porId = new Map(clientes.map((c) => [c.id, c]));

  return cumpleanos.map((c) => ({
    ...c,
    cliente: porId.get(c.perro.clienteId),
  }));
}

/** Los de hoy, que es lo que el equipo necesita saber al abrir la puerta. */
export async function cumpleanosDeHoy(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
): Promise<CumpleanosConDueno[]> {
  const perros = await repo.perros.listar();
  return conDuenos(repo, cumpleanosEntre(perros, hoy, hoy));
}

/** Los del mes, para que Administración alcance a preparar algo. */
export async function cumpleanosDelMes(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
): Promise<CumpleanosConDueno[]> {
  const perros = await repo.perros.listar();
  return conDuenos(
    repo,
    cumpleanosEntre(perros, primerDiaDelMes(fecha), ultimoDiaDelMes(fecha)),
  );
}
