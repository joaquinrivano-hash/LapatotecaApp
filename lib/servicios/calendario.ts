/**
 * Calendario de ocupación.
 *
 * Lo que el admin necesita ver de un día no es "cuántos perros vinieron", sino
 * cuán lleno estuvo el espacio: el pico. Por eso cada día se resume por su
 * pico y sus cupos libres, y recién al abrirlo aparece el detalle de quién
 * entra y quién sale.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  type OcupanteRango,
} from "@/lib/rules/capacidad";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { esFinDeSemana, fechaISO, rangoFechas } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  FechaISO,
  Linea,
  OcupacionDia,
  Perro,
  ReservaHotel,
} from "@/lib/types";

export interface DiaCalendario {
  fecha: FechaISO;
  esFinDeSemana: boolean;
  ocupacion: OcupacionDia;
  cuposLibres: number;
  /** Perros que empiezan su estadía ese día. */
  entran: number;
  /** Perros que la terminan. */
  salen: number;
}

export async function cargarCalendario(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<DiaCalendario[]> {
  const [reservas, estadias] = await Promise.all([
    repo.reservasHotel.enRango(desde, hasta),
    repo.estadiasJardin.enRango(desde, hasta),
  ]);

  const ocupantes: OcupanteRango[] = [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadias),
  ];

  return rangoFechas(desde, hasta).map((fecha) => {
    const ocupacion = calcularOcupacionDia(fecha, ocupantes);
    return {
      fecha,
      esFinDeSemana: esFinDeSemana(fecha),
      ocupacion,
      cuposLibres: Math.max(
        0,
        NEGOCIO.capacidad.maximoSimultaneo - ocupacion.pico,
      ),
      entran: ocupantes.filter((o) => fechaISO(o.inicio) === fecha).length,
      salen: ocupantes.filter((o) => fechaISO(o.fin) === fecha).length,
    };
  });
}

export interface MovimientoDia {
  id: string;
  linea: Linea;
  perro: Perro;
  cliente: Cliente | undefined;
  inicio: string;
  fin: string;
  estado: string;
}

export interface DetalleDia {
  fecha: FechaISO;
  ocupacion: OcupacionDia;
  cuposLibres: number;
  movimientos: MovimientoDia[];
}

/** Quién está ese día, ordenado por hora de entrada. */
export async function cargarDetalleDia(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
): Promise<DetalleDia> {
  const [reservas, estadias, perros, clientes] = await Promise.all([
    repo.reservasHotel.enRango(fecha, fecha),
    repo.estadiasJardin.porFecha(fecha),
    repo.perros.listar(),
    repo.clientes.listar(),
  ]);

  const buscarPerro = (id: string) => perros.find((p) => p.id === id);
  const buscarCliente = (id: string) => clientes.find((c) => c.id === id);

  const deReserva = (r: ReservaHotel): MovimientoDia | null => {
    const perro = buscarPerro(r.perroId);
    if (!perro) return null;
    return {
      id: r.id,
      linea: "hotel",
      perro,
      cliente: buscarCliente(r.clienteId),
      inicio: r.inicioReal ?? r.inicioProgramado,
      fin: r.finReal ?? r.finProgramado,
      estado: r.estado,
    };
  };

  const deEstadia = (e: EstadiaJardin): MovimientoDia | null => {
    const perro = buscarPerro(e.perroId);
    if (!perro) return null;
    return {
      id: e.id,
      linea: "jardin",
      perro,
      cliente: buscarCliente(e.clienteId),
      inicio: e.inicioReal ?? e.inicioProgramado,
      fin: e.finReal ?? e.finProgramado,
      estado: e.estado,
    };
  };

  const movimientos = [
    ...reservas
      .filter((r) => r.estado !== "cancelada")
      .map(deReserva),
    ...estadias.filter((e) => e.estado !== "cancelada").map(deEstadia),
  ]
    .filter((m): m is MovimientoDia => m !== null)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const ocupacion = calcularOcupacionDia(fecha, [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadias),
  ]);

  return {
    fecha,
    ocupacion,
    cuposLibres: Math.max(
      0,
      NEGOCIO.capacidad.maximoSimultaneo - ocupacion.pico,
    ),
    movimientos,
  };
}
