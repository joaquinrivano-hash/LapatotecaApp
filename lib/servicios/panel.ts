/**
 * Indicadores del backoffice.
 *
 * Dos definiciones que hay que tener claras porque se confunden fácil:
 *
 * - **Ocupación** se mide contra el PICO simultáneo del día, no contra la
 *   cantidad de perros que pasaron. Un día con 22 perros que nunca coincidieron
 *   más de 17 está al 68%, no al 88%.
 * - **Ingreso por cupo disponible** divide por los 25 cupos, no por los
 *   ocupados. Es el equivalente al RevPAR de un hotel: mide cuánto rinde el
 *   espacio que tienes, no cuánto cobras a quien viene.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  type OcupanteRango,
} from "@/lib/rules/capacidad";
import { esClienteActivo } from "@/lib/rules/cliente";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { esFinDeSemana, fechaISO, rangoFechas } from "@/lib/utils/fecha";
import type {
  ConceptoPago,
  FechaISO,
  Pago,
  PlanComprado,
} from "@/lib/types";

/** Las cuatro líneas de ingreso del negocio. */
export type LineaIngreso = "hotel" | "jardin" | "servicios" | "tienda";

export const ETIQUETA_LINEA: Record<LineaIngreso, string> = {
  hotel: "Hotel",
  jardin: "Jardín",
  servicios: "Servicios",
  tienda: "Tienda",
};

/**
 * A qué línea pertenece cada cobro.
 *
 * `cuenta_mensual` queda fuera a propósito: es una consolidación de cobros que
 * ya están contados por separado. Sumarla duplicaría el ingreso.
 */
const LINEA_DE_CONCEPTO: Record<ConceptoPago, LineaIngreso | null> = {
  abono_hotel: "hotel",
  saldo_hotel: "hotel",
  dia_suelto: "jardin",
  plan: "jardin",
  dia_de_prueba: "jardin",
  servicio: "servicios",
  tienda: "tienda",
  cuenta_mensual: null,
};

export function lineaDePago(pago: Pago): LineaIngreso | null {
  return LINEA_DE_CONCEPTO[pago.concepto];
}

export interface MetricasDia {
  fecha: FechaISO;
  esFinDeSemana: boolean;
  /** Máximo de perros simultáneos. Es el número contra el que se mide el cupo. */
  pico: number;
  ocupacion: number;
  perrosHotel: number;
  perrosJardin: number;
  perrosDistintos: number;
  ingreso: number;
  ingresoPorCupo: number;
}

export interface ResumenPanel {
  desde: FechaISO;
  hasta: FechaISO;
  dias: MetricasDia[];

  capacidad: number;
  ocupacionPromedio: number;
  ocupacionEntreSemana: number;
  ocupacionFinDeSemana: number;
  picoMaximo: number;

  ingresoTotal: number;
  ingresoPorCupoDisponible: number;
  ingresoPorLinea: { linea: LineaIngreso; monto: number; participacion: number }[];

  /** Reparto de la ocupación entre las dos líneas que ocupan espacio. */
  mixOcupacion: { hotel: number; jardin: number };

  clientesActivos: number;
  totalClientes: number;
  planesVigentes: number;
  /**
   * Qué parte de los planes comprados en el periodo son recompra, o sea de un
   * perro que ya había tenido uno antes.
   */
  renovacionPlanes: number;
}

function fraccion(parte: number, total: number): number {
  return total > 0 ? parte / total : 0;
}

export async function cargarPanel(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<ResumenPanel> {
  const [reservas, estadias, pagos, clientes, planes] = await Promise.all([
    repo.reservasHotel.enRango(desde, hasta),
    repo.estadiasJardin.enRango(desde, hasta),
    repo.pagos.enRango(desde, hasta),
    repo.clientes.listar(),
    repo.planes.listar(),
  ]);

  const ocupantes: OcupanteRango[] = [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadias),
  ];

  const capacidad = NEGOCIO.capacidad.maximoSimultaneo;
  const pagosPorDia = new Map<FechaISO, number>();

  for (const pago of pagos) {
    if (!lineaDePago(pago)) continue;
    const dia = fechaISO(pago.emitidoEn);
    pagosPorDia.set(dia, (pagosPorDia.get(dia) ?? 0) + pago.monto);
  }

  const dias: MetricasDia[] = rangoFechas(desde, hasta).map((fecha) => {
    const ocupacion = calcularOcupacionDia(fecha, ocupantes);
    const ingreso = pagosPorDia.get(fecha) ?? 0;

    return {
      fecha,
      esFinDeSemana: esFinDeSemana(fecha),
      pico: ocupacion.pico,
      ocupacion: fraccion(ocupacion.pico, capacidad),
      perrosHotel: ocupacion.perrosHotel,
      perrosJardin: ocupacion.perrosJardin,
      perrosDistintos: ocupacion.perrosDistintos,
      ingreso,
      ingresoPorCupo: ingreso / capacidad,
    };
  });

  const promedio = (lista: MetricasDia[]) =>
    lista.length === 0
      ? 0
      : lista.reduce((suma, d) => suma + d.ocupacion, 0) / lista.length;

  const ingresoTotal = dias.reduce((suma, d) => suma + d.ingreso, 0);

  const porLinea = new Map<LineaIngreso, number>();
  for (const pago of pagos) {
    const linea = lineaDePago(pago);
    if (!linea) continue;
    porLinea.set(linea, (porLinea.get(linea) ?? 0) + pago.monto);
  }

  const ingresoPorLinea = (
    ["hotel", "jardin", "servicios", "tienda"] as LineaIngreso[]
  ).map((linea) => {
    const monto = porLinea.get(linea) ?? 0;
    return { linea, monto, participacion: fraccion(monto, ingresoTotal) };
  });

  const totalHotel = dias.reduce((suma, d) => suma + d.perrosHotel, 0);
  const totalJardin = dias.reduce((suma, d) => suma + d.perrosJardin, 0);

  const planesPorCliente = new Map<string, PlanComprado[]>();
  for (const plan of planes) {
    planesPorCliente.set(plan.clienteId, [
      ...(planesPorCliente.get(plan.clienteId) ?? []),
      plan,
    ]);
  }

  const ultimaEstadiaPorCliente = new Map<string, FechaISO>();
  for (const estadia of estadias) {
    const previa = ultimaEstadiaPorCliente.get(estadia.clienteId);
    if (!previa || estadia.fecha > previa) {
      ultimaEstadiaPorCliente.set(estadia.clienteId, estadia.fecha);
    }
  }

  const clientesActivos = clientes.filter((cliente) =>
    esClienteActivo({
      planes: planesPorCliente.get(cliente.id) ?? [],
      ultimaEstadia: ultimaEstadiaPorCliente.get(cliente.id),
      fecha: hasta,
    }),
  ).length;

  return {
    desde,
    hasta,
    dias,
    capacidad,
    ocupacionPromedio: promedio(dias),
    ocupacionEntreSemana: promedio(dias.filter((d) => !d.esFinDeSemana)),
    ocupacionFinDeSemana: promedio(dias.filter((d) => d.esFinDeSemana)),
    picoMaximo: dias.reduce((max, d) => Math.max(max, d.pico), 0),
    ingresoTotal,
    ingresoPorCupoDisponible:
      dias.length > 0 ? ingresoTotal / (capacidad * dias.length) : 0,
    ingresoPorLinea,
    mixOcupacion: {
      hotel: fraccion(totalHotel, totalHotel + totalJardin),
      jardin: fraccion(totalJardin, totalHotel + totalJardin),
    },
    clientesActivos,
    totalClientes: clientes.length,
    planesVigentes: planes.filter(
      (p) => !p.cerradoEn && p.diasUsados < p.diasTotales && p.venceEn >= hasta,
    ).length,
    renovacionPlanes: calcularRenovacion(planes, desde, hasta),
  };
}

/**
 * Recompra: de los planes comprados en el periodo, cuántos son de un perro que
 * ya había comprado uno antes. No es retención fina, pero responde la pregunta
 * que importa: ¿los planes se renuevan o cada venta es un cliente nuevo?
 */
export function calcularRenovacion(
  planes: PlanComprado[],
  desde: FechaISO,
  hasta: FechaISO,
): number {
  const delPeriodo = planes.filter((p) => {
    const dia = fechaISO(p.compradoEn);
    return dia >= desde && dia <= hasta;
  });

  if (delPeriodo.length === 0) return 0;

  const recompras = delPeriodo.filter((plan) =>
    planes.some(
      (otro) => otro.perroId === plan.perroId && otro.compradoEn < plan.compradoEn,
    ),
  ).length;

  return fraccion(recompras, delPeriodo.length);
}
