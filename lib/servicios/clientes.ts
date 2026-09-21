/**
 * Clientes, perros y sus alertas.
 *
 * El backoffice necesita ver de un vistazo a quién hay que pedirle algo antes
 * de la próxima reserva: una vacuna vencida no se descubre cuando el perro ya
 * está en la puerta.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  nombreVacuna,
  vacunasFaltantes,
  vacunasPorVencer,
} from "@/lib/rules/admision";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type { Cliente, FechaISO, Perro } from "@/lib/types";

export type TipoAlerta =
  | "vacuna_vencida"
  | "vacuna_por_vencer"
  | "sin_dia_de_prueba"
  | "no_esterilizado"
  | "sobre_peso";

export interface AlertaPerro {
  tipo: TipoAlerta;
  perroId: string;
  mensaje: string;
  /** Solo en las alertas por vencer. */
  diasRestantes?: number;
  /** true si impide reservar hoy mismo. */
  bloquea: boolean;
}

/** Cuántos días antes empieza a avisarse una vacuna que va a vencer. */
export const DIAS_AVISO_VACUNA = 30;

export function alertasDePerro(perro: Perro, hoy: FechaISO): AlertaPerro[] {
  const alertas: AlertaPerro[] = [];

  const vencidas = vacunasFaltantes(perro, hoy);
  if (vencidas.length > 0) {
    alertas.push({
      tipo: "vacuna_vencida",
      perroId: perro.id,
      mensaje: `Tiene vencida la ${vencidas.map(nombreVacuna).join(", ")}.`,
      bloquea: true,
    });
  } else {
    for (const porVencer of vacunasPorVencer(perro, hoy, DIAS_AVISO_VACUNA)) {
      alertas.push({
        tipo: "vacuna_por_vencer",
        perroId: perro.id,
        mensaje: `La ${nombreVacuna(porVencer.tipo)} vence en ${porVencer.diasRestantes} ${porVencer.diasRestantes === 1 ? "día" : "días"}.`,
        diasRestantes: porVencer.diasRestantes,
        bloquea: false,
      });
    }
  }

  if (perro.diaDePrueba.estado !== "aprobado") {
    alertas.push({
      tipo: "sin_dia_de_prueba",
      perroId: perro.id,
      mensaje:
        perro.diaDePrueba.estado === "agendado"
          ? `Día de prueba agendado para el ${perro.diaDePrueba.fecha}.`
          : perro.diaDePrueba.estado === "rechazado"
            ? "El día de prueba no fue aprobado."
            : "Todavía no hace su día de prueba.",
      bloquea: perro.diaDePrueba.estado !== "agendado",
    });
  }

  if (
    NEGOCIO.admision.esterilizacionObligatoriaEnMachos &&
    perro.sexo === "macho" &&
    !perro.esterilizado
  ) {
    alertas.push({
      tipo: "no_esterilizado",
      perroId: perro.id,
      mensaje: "Macho sin esterilizar.",
      bloquea: true,
    });
  }

  if (perro.pesoKg > NEGOCIO.admision.pesoMaximoKg) {
    alertas.push({
      tipo: "sobre_peso",
      perroId: perro.id,
      mensaje: `Pesa ${perro.pesoKg} kg y el máximo es ${NEGOCIO.admision.pesoMaximoKg} kg.`,
      bloquea: true,
    });
  }

  return alertas;
}

export interface ClienteConPerros {
  cliente: Cliente;
  perros: Perro[];
  alertas: AlertaPerro[];
  /** true si alguna alerta impide reservar. */
  bloqueado: boolean;
}

export async function cargarClientes(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
  busqueda = "",
): Promise<ClienteConPerros[]> {
  const [clientes, perros] = await Promise.all([
    busqueda.trim() ? repo.clientes.buscar(busqueda) : repo.clientes.listar(),
    repo.perros.listar(),
  ]);

  // Buscar "Pelusa" tiene que encontrar a su dueña, aunque ella no se llame así.
  const porNombreDePerro = busqueda.trim()
    ? await repo.perros.buscar(busqueda)
    : [];
  const idsExtra = new Set(porNombreDePerro.map((p) => p.clienteId));

  const todos = busqueda.trim()
    ? [
        ...clientes,
        ...(await repo.clientes.listar()).filter(
          (c) => idsExtra.has(c.id) && !clientes.some((x) => x.id === c.id),
        ),
      ]
    : clientes;

  return todos
    .map((cliente) => {
      const suyos = perros.filter((p) => p.clienteId === cliente.id);
      const alertas = suyos.flatMap((p) => alertasDePerro(p, hoy));
      return {
        cliente,
        perros: suyos,
        alertas,
        bloqueado: alertas.some((a) => a.bloquea),
      };
    })
    .sort((a, b) =>
      `${a.cliente.nombre} ${a.cliente.apellido}`.localeCompare(
        `${b.cliente.nombre} ${b.cliente.apellido}`,
        "es",
      ),
    );
}

export interface ResumenAlertas {
  total: number;
  bloqueantes: number;
  vacunasVencidas: number;
  vacunasPorVencer: number;
  sinDiaDePrueba: number;
}

export function resumirAlertas(clientes: ClienteConPerros[]): ResumenAlertas {
  const todas = clientes.flatMap((c) => c.alertas);
  const contar = (tipo: TipoAlerta) =>
    todas.filter((a) => a.tipo === tipo).length;

  return {
    total: todas.length,
    bloqueantes: todas.filter((a) => a.bloquea).length,
    vacunasVencidas: contar("vacuna_vencida"),
    vacunasPorVencer: contar("vacuna_por_vencer"),
    sinDiaDePrueba: contar("sin_dia_de_prueba"),
  };
}
