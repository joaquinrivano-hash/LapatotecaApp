/**
 * Asistencia del día: lo que hace el staff.
 *
 * Acá se juntan las reglas puras con el repositorio. Las reglas siguen sin
 * saber que existe el almacenamiento, y las pantallas siguen sin calcular
 * precios: piden una acción y reciben el resultado ya cotizado.
 *
 * Sobre los planes: el día del pack se descuenta cuando se AGENDA la estadía,
 * no cuando el perro llega. Si se cancela, se devuelve. Por eso el check-in no
 * toca el saldo.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  type OcupanteRango,
} from "@/lib/rules/capacidad";
import { calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import {
  calcularPrecioJardin,
  calcularRecargoFueraDeHorario,
} from "@/lib/rules/precio-jardin";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { fechaISO } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  OcupacionDia,
  Pago,
  Perro,
  ReservaHotel,
} from "@/lib/types";

export interface DiaDeStaff {
  fecha: FechaISO;
  estadias: EstadiaJardin[];
  reservas: ReservaHotel[];
  perros: Perro[];
  clientes: Cliente[];
  ocupacion: OcupacionDia;
  capacidad: number;
  /** Perros que se esperan y todavía no llegan. */
  esperados: number;
  /** Perros que están adentro ahora. */
  presentes: number;
}

/** Todo lo que necesita la pantalla "Hoy", en una sola pasada. */
export async function cargarDiaDeStaff(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
): Promise<DiaDeStaff> {
  const [estadias, reservas, perros, clientes] = await Promise.all([
    repo.estadiasJardin.porFecha(fecha),
    repo.reservasHotel.enRango(fecha, fecha),
    repo.perros.listar(),
    repo.clientes.listar(),
  ]);

  const ocupantes: OcupanteRango[] = [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadias),
  ];

  const esperados =
    estadias.filter((e) => e.estado === "esperada").length +
    reservas.filter(
      (r) => r.estado === "confirmada" || r.estado === "pendiente",
    ).length;

  const presentes =
    estadias.filter((e) => e.estado === "presente").length +
    reservas.filter((r) => r.estado === "en_curso").length;

  return {
    fecha,
    estadias,
    reservas,
    perros,
    clientes,
    ocupacion: calcularOcupacionDia(fecha, ocupantes),
    capacidad: NEGOCIO.capacidad.maximoSimultaneo,
    esperados,
    presentes,
  };
}

/* ── Jardín ────────────────────────────────────────────────────────── */

export async function registrarLlegadaJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<EstadiaJardin> {
  return repo.estadiasJardin.actualizar(estadiaId, {
    inicioReal: ahora,
    estado: "presente",
  });
}

export interface ResultadoSalida {
  estadia: EstadiaJardin;
  /** Recargo por retiro tarde, si lo hubo. */
  recargo: number;
  horasFueraDeHorario: number;
  pago: Pago | null;
}

/**
 * Cierra la jornada con la hora REAL de retiro y vuelve a cotizar: de acá sale
 * el recargo fuera de horario, que no se puede saber antes.
 */
export async function registrarSalidaJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoSalida> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new Error(`No existe la estadía ${estadiaId}`);

  const inicio = estadia.inicioReal ?? estadia.inicioProgramado;
  const cotizacion = calcularPrecioJardin({
    inicio,
    fin: ahora,
    origen: estadia.origen,
  });

  const recargo = calcularRecargoFueraDeHorario(inicio, ahora);

  const actualizada = await repo.estadiasJardin.actualizar(estadiaId, {
    finReal: ahora,
    estado: "finalizada",
    cotizacion,
  });

  const pago = await registrarCobroDeEstadia(repo, actualizada, ahora);

  return {
    estadia: actualizada,
    recargo: recargo.monto,
    horasFueraDeHorario: recargo.horas,
    pago,
  };
}

/**
 * Deja el cobro de la jornada al día. Si ya había uno emitido, lo corrige en
 * vez de duplicarlo: un perro no puede aparecer cobrado dos veces por el
 * mismo día.
 */
async function registrarCobroDeEstadia(
  repo: RepositorioPatoteca,
  estadia: EstadiaJardin,
  ahora: InstanteISO,
): Promise<Pago | null> {
  const total = estadia.cotizacion?.total ?? 0;
  const existentes = await repo.pagos.listar();
  const previo = existentes.find(
    (p) => p.referenciaId === estadia.id && p.estado !== "reembolsado",
  );

  if (total <= 0) {
    // Jornada cubierta por el plan y sin recargo: no hay nada que cobrar.
    if (previo && previo.estado === "pendiente") {
      await repo.pagos.eliminar(previo.id);
    }
    return null;
  }

  const concepto =
    estadia.origen === "dia_de_prueba" ? "dia_de_prueba" : "dia_suelto";

  if (previo) {
    return repo.pagos.actualizar(previo.id, { monto: total, concepto });
  }

  return repo.pagos.crear({
    clienteId: estadia.clienteId,
    concepto,
    referenciaId: estadia.id,
    monto: total,
    estado: "pendiente",
    emitidoEn: ahora,
  });
}

/* ── Hotel ─────────────────────────────────────────────────────────── */

export async function registrarLlegadaHotel(
  repo: RepositorioPatoteca,
  reservaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ReservaHotel> {
  return repo.reservasHotel.actualizar(reservaId, {
    inicioReal: ahora,
    estado: "en_curso",
  });
}

export interface ResultadoSalidaHotel {
  reserva: ReservaHotel;
  /** Diferencia contra lo cotizado al reservar. Positiva = se pasó. */
  diferencia: number;
  saldoPorCobrar: number;
  pago: Pago | null;
}

export async function registrarSalidaHotel(
  repo: RepositorioPatoteca,
  reservaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoSalidaHotel> {
  const reserva = await repo.reservasHotel.obtener(reservaId);
  if (!reserva) throw new Error(`No existe la reserva ${reservaId}`);

  const inicio = reserva.inicioReal ?? reserva.inicioProgramado;
  const cotizacionOriginal = reserva.cotizacion;

  const cotizacion = calcularPrecioHotel({
    inicio,
    fin: ahora,
    paseosContratados: reserva.paseosContratados,
  });

  const actualizada = await repo.reservasHotel.actualizar(reservaId, {
    finReal: ahora,
    estado: "finalizada",
    cotizacion,
  });

  // El abono ya se pagó al reservar; lo que queda es el saldo contra el total
  // recalculado con la hora real de salida.
  const abono = cotizacionOriginal.abono ?? 0;
  const saldoPorCobrar = Math.max(0, cotizacion.total - abono);

  const existentes = await repo.pagos.porCliente(reserva.clienteId);
  const previo = existentes.find(
    (p) => p.referenciaId === reserva.id && p.concepto === "saldo_hotel",
  );

  let pago: Pago | null = null;
  if (saldoPorCobrar > 0) {
    pago = previo
      ? await repo.pagos.actualizar(previo.id, { monto: saldoPorCobrar })
      : await repo.pagos.crear({
          clienteId: reserva.clienteId,
          concepto: "saldo_hotel",
          referenciaId: reserva.id,
          monto: saldoPorCobrar,
          estado: "pendiente",
          emitidoEn: ahora,
        });
  }

  return {
    reserva: actualizada,
    diferencia: cotizacion.total - cotizacionOriginal.total,
    saldoPorCobrar,
    pago,
  };
}

/** Marca que el perro no llegó. No cobra nada. */
export async function marcarNoLlego(
  repo: RepositorioPatoteca,
  estadiaId: ID,
): Promise<EstadiaJardin> {
  return repo.estadiasJardin.actualizar(estadiaId, { estado: "no_show" });
}

/** Deshace un check-in hecho por error. */
export async function deshacerLlegadaJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
): Promise<EstadiaJardin> {
  return repo.estadiasJardin.actualizar(estadiaId, {
    inicioReal: undefined,
    estado: "esperada",
  });
}

/** El día de Santiago que el staff está mirando. */
export function hoyDelStaff(ahora: InstanteISO = new Date().toISOString()) {
  return fechaISO(ahora);
}
