/**
 * Lo que quedó calculado esperando que alguien decida.
 *
 * El cuidador registra la salida y nada más: ni emite cobros ni perdona
 * atrasos. De ahí salen dos colas que mira Administración, y son distintas
 * entre sí:
 *
 *   · El **recargo fuera de horario** es una DECISIÓN. El pack cubre el día,
 *     no que lo pasen a buscar a las ocho y media; pero si el dueño se quedó
 *     pegado en el Costanera una vez, la dueña puede perdonarlo. Nadie que
 *     esté entregando un perro en la puerta debería tener que tomar esa
 *     decisión con el dueño mirando.
 *
 *   · El **saldo de hotel** no es una decisión, es una EMISIÓN. El hotel se
 *     paga según la salida real y el abono ya cubrió una parte; lo que falta
 *     se debe. Lo único que cambió es quién lo emite.
 *
 * Las dos colas se contestan igual: "¿existe ya un cobro de este concepto
 * para esta estadía?". Si no existe, está pendiente de decidir.
 */

import { calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import { calcularRecargoFueraDeHorario } from "@/lib/rules/precio-jardin";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type {
  EstadiaJardin,
  ID,
  InstanteISO,
  Pago,
  ReservaHotel,
} from "@/lib/types";

export class DecisionImposible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DecisionImposible";
  }
}

/* ── El recargo del jardín ─────────────────────────────────────────── */

export interface RecargoPorDecidir {
  estadia: EstadiaJardin;
  horas: number;
  monto: number;
}

/** El recargo que le corresponde a una estadía ya cerrada, si lo hubo. */
function recargoDe(estadia: EstadiaJardin): { horas: number; monto: number } {
  if (!estadia.finReal) return { horas: 0, monto: 0 };
  const inicio = estadia.inicioReal ?? estadia.inicioProgramado;
  const { horas, monto } = calcularRecargoFueraDeHorario(
    inicio,
    estadia.finReal,
  );
  return { horas, monto };
}

/**
 * Un cobro de este concepto para esta estadía significa "ya se decidió",
 * tenga monto o no: perdonar deja un cobro en cero, no deja un vacío.
 */
function yaDecidido(pagos: Pago[], estadiaId: ID): boolean {
  return pagos.some(
    (p) => p.referenciaId === estadiaId && p.concepto === "recargo_jardin",
  );
}

export async function recargosPorDecidir(
  repo: RepositorioPatoteca,
): Promise<RecargoPorDecidir[]> {
  const [estadias, pagos] = await Promise.all([
    repo.estadiasJardin.listar(),
    repo.pagos.listar(),
  ]);

  return estadias
    .filter((e) => e.estado === "finalizada" && !yaDecidido(pagos, e.id))
    .map((estadia) => ({ estadia, ...recargoDe(estadia) }))
    .filter((r) => r.monto > 0)
    .sort((a, b) => (a.estadia.finReal ?? "").localeCompare(b.estadia.finReal ?? ""));
}

async function decidirRecargo(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  monto: number,
  ahora: InstanteISO,
): Promise<Pago> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new DecisionImposible(`No existe la estadía ${estadiaId}`);

  const pagos = await repo.pagos.listar();
  if (yaDecidido(pagos, estadiaId)) {
    throw new DecisionImposible("Ese retiro tarde ya se decidió.");
  }

  return repo.pagos.crear({
    clienteId: estadia.clienteId,
    concepto: "recargo_jardin",
    referenciaId: estadia.id,
    monto,
    // Un recargo perdonado nace reembolsado en cero, que es como la app ya
    // anula el cobro del día de prueba. Borrarlo sería más limpio de mirar y
    // dejaría la cobranza del mes sin poder explicarse: un cobro que
    // desaparece no deja rastro de que existió ni de que alguien lo perdonó.
    estado: monto > 0 ? "pendiente" : "reembolsado",
    emitidoEn: ahora,
  });
}

/** Lo cobra: nace pendiente y entra en la cuenta del mes como cualquier otro. */
export async function cobrarRecargo(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new DecisionImposible(`No existe la estadía ${estadiaId}`);

  const { monto } = recargoDe(estadia);
  if (monto <= 0) {
    throw new DecisionImposible("Ese retiro no tiene recargo que cobrar.");
  }
  return decidirRecargo(repo, estadiaId, monto, ahora);
}

/** Lo perdona, dejando constancia de que se perdonó. */
export async function perdonarRecargo(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return decidirRecargo(repo, estadiaId, 0, ahora);
}

/* ── El día de jardín que nadie alcanzó a pagar por adelantado ────── */

export interface DiaPorCobrar {
  estadia: EstadiaJardin;
  monto: number;
}

/**
 * Días sueltos sin cobro emitido.
 *
 * En la práctica son los ingresos no planificados: el perro que apareció en
 * la puerta. Un día reservado desde el portal ya trae su cobro desde que se
 * agendó, así que no cae acá — y eso es justo lo que hace que esta cola sea
 * la red de seguridad: si una jornada se registró y nunca se cobró, aparece.
 */
export async function diasPorCobrar(
  repo: RepositorioPatoteca,
): Promise<DiaPorCobrar[]> {
  const [estadias, pagos] = await Promise.all([
    repo.estadiasJardin.listar(),
    repo.pagos.listar(),
  ]);

  return estadias
    .filter(
      (e) =>
        e.origen === "dia_suelto" &&
        e.estado !== "cancelada" &&
        !pagos.some(
          (p) => p.referenciaId === e.id && p.concepto === "dia_suelto",
        ),
    )
    .map((estadia) => ({ estadia, monto: estadia.cotizacion?.total ?? 0 }))
    .filter((d) => d.monto > 0)
    .sort((a, b) => a.estadia.fecha.localeCompare(b.estadia.fecha));
}

export async function emitirDiaDeJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new DecisionImposible(`No existe la estadía ${estadiaId}`);

  const pagos = await repo.pagos.listar();
  if (
    pagos.some(
      (p) => p.referenciaId === estadiaId && p.concepto === "dia_suelto",
    )
  ) {
    throw new DecisionImposible("Ese día ya está cobrado.");
  }

  const monto = estadia.cotizacion?.total ?? 0;
  if (monto <= 0) {
    throw new DecisionImposible("Ese día no tiene nada que cobrar.");
  }

  return repo.pagos.crear({
    clienteId: estadia.clienteId,
    concepto: "dia_suelto",
    referenciaId: estadia.id,
    monto,
    estado: "pendiente",
    emitidoEn: ahora,
  });
}

/* ── El saldo del hotel ────────────────────────────────────────────── */

export interface SaldoPorEmitir {
  reserva: ReservaHotel;
  saldo: number;
}

/** Lo que falta por cobrar de una estadía de hotel ya cerrada. */
function saldoDe(reserva: ReservaHotel): number {
  if (!reserva.finReal) return 0;
  const inicio = reserva.inicioReal ?? reserva.inicioProgramado;
  const total = calcularPrecioHotel({
    inicio,
    fin: reserva.finReal,
    paseosContratados: reserva.paseosContratados,
  }).total;
  return Math.max(0, total - (reserva.cotizacion.abono ?? 0));
}

export async function saldosPorEmitir(
  repo: RepositorioPatoteca,
): Promise<SaldoPorEmitir[]> {
  const [reservas, pagos] = await Promise.all([
    repo.reservasHotel.listar(),
    repo.pagos.listar(),
  ]);

  return reservas
    .filter(
      (r) =>
        r.estado === "finalizada" &&
        !pagos.some(
          (p) => p.referenciaId === r.id && p.concepto === "saldo_hotel",
        ),
    )
    .map((reserva) => ({ reserva, saldo: saldoDe(reserva) }))
    .filter((s) => s.saldo > 0)
    .sort((a, b) =>
      (a.reserva.finReal ?? "").localeCompare(b.reserva.finReal ?? ""),
    );
}

export async function emitirSaldoHotel(
  repo: RepositorioPatoteca,
  reservaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  const reserva = await repo.reservasHotel.obtener(reservaId);
  if (!reserva) throw new DecisionImposible(`No existe la reserva ${reservaId}`);

  const pagos = await repo.pagos.listar();
  if (
    pagos.some(
      (p) => p.referenciaId === reservaId && p.concepto === "saldo_hotel",
    )
  ) {
    throw new DecisionImposible("El saldo de esa estadía ya se emitió.");
  }

  const saldo = saldoDe(reserva);
  if (saldo <= 0) {
    throw new DecisionImposible("Esa estadía no dejó saldo por cobrar.");
  }

  return repo.pagos.crear({
    clienteId: reserva.clienteId,
    concepto: "saldo_hotel",
    referenciaId: reserva.id,
    monto: saldo,
    estado: "pendiente",
    emitidoEn: ahora,
  });
}
