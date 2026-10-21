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

import { armarMensajeDeCobro } from "@/lib/integraciones/mensajeria/armado";
import { despacharArmado } from "@/lib/integraciones/mensajeria/servicio";
import type { CanalMensajeria } from "@/lib/integraciones/tipos";
import { calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import { fechaISO } from "@/lib/utils/fecha";
import { calcularRecargoFueraDeHorario } from "@/lib/rules/precio-jardin";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type {
  Cliente,
  EstadiaJardin,
  FechaISO,
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

/* ── La plata que sale: devoluciones ──────────────────────────────── */

export interface DevolucionPorTransferir {
  pago: Pago;
  cliente: Cliente;
  /** Dónde transferirle. Vacío si el cliente nunca los dejó. */
  cuenta?: Cliente["datosBancarios"];
}

/**
 * Lo que la casa le debe a un cliente y todavía no le transfirió.
 *
 * Un cobro reembolsado con monto en cero NO entra: ese es el caso en que el
 * cliente nunca alcanzó a pagar y anular el cobro ya fue la devolución. Acá
 * solo está la plata que entró y tiene que salir.
 *
 * Existe porque al cancelar le prometemos al dueño una transferencia, y una
 * promesa que nadie ve en ninguna pantalla es una promesa que no se cumple.
 */
export async function devolucionesPorTransferir(
  repo: RepositorioPatoteca,
): Promise<DevolucionPorTransferir[]> {
  const [pagos, clientes] = await Promise.all([
    repo.pagos.listar(),
    repo.clientes.listar(),
  ]);

  return pagos
    .filter(
      (p) =>
        p.estado === "reembolsado" &&
        p.monto > 0 &&
        !p.devolucionTransferidaEn,
    )
    .flatMap((pago) => {
      const cliente = clientes.find((c) => c.id === pago.clienteId);
      if (!cliente) return [];
      return [{ pago, cliente, cuenta: cliente.datosBancarios }];
    })
    .sort((a, b) => a.pago.emitidoEn.localeCompare(b.pago.emitidoEn));
}

/** Deja constancia de que la transferencia salió. */
export async function marcarDevolucionTransferida(
  repo: RepositorioPatoteca,
  pagoId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  const pago = await repo.pagos.obtener(pagoId);
  if (!pago) throw new DecisionImposible(`No existe el cobro ${pagoId}`);
  if (pago.devolucionTransferidaEn) {
    throw new DecisionImposible("Esa devolución ya estaba transferida.");
  }
  return repo.pagos.actualizar(pagoId, { devolucionTransferidaEn: ahora });
}

/* ── Todo junto, por cliente ───────────────────────────────────────── */

export type TipoPendiente = "recargo" | "saldo_hotel" | "dia";

export interface Pendiente {
  tipo: TipoPendiente;
  /** La estadía o reserva que lo originó: es con lo que se decide. */
  referenciaId: ID;
  perroId: ID;
  fecha: FechaISO;
  monto: number;
  /** Solo en el recargo: cuántas horas pasadas del cierre. */
  horas?: number;
}

export interface ClienteConPendientes {
  cliente: Cliente;
  pendientes: Pendiente[];
  total: number;
}

/**
 * Las tres colas agrupadas por dueño.
 *
 * Agrupar por cliente y no por perro no es una preferencia de diseño: es que
 * el cobro se le hace a una persona. Un dueño con dos perros que salieron
 * tarde el mismo día es UNA conversación —y una transferencia—, no dos. Con
 * las filas sueltas por perro, quien cobra tiene que ir juntando mentalmente
 * cuáles son del mismo dueño antes de poder escribirle.
 *
 * Los dueños salen ordenados por lo que lleva más tiempo esperando, no por
 * monto: lo que se añeja es lo que se termina no cobrando.
 */
export async function cobrosPendientesPorCliente(
  repo: RepositorioPatoteca,
): Promise<ClienteConPendientes[]> {
  const [recargos, saldos, dias, clientes] = await Promise.all([
    recargosPorDecidir(repo),
    saldosPorEmitir(repo),
    diasPorCobrar(repo),
    repo.clientes.listar(),
  ]);

  const pendientes: Pendiente[] = [
    ...recargos.map(({ estadia, horas, monto }) => ({
      tipo: "recargo" as const,
      referenciaId: estadia.id,
      perroId: estadia.perroId,
      fecha: estadia.fecha,
      monto,
      horas,
    })),
    ...saldos.map(({ reserva, saldo }) => ({
      tipo: "saldo_hotel" as const,
      referenciaId: reserva.id,
      perroId: reserva.perroId,
      fecha: fechaISO(reserva.finReal!),
      monto: saldo,
    })),
    ...dias.map(({ estadia, monto }) => ({
      tipo: "dia" as const,
      referenciaId: estadia.id,
      perroId: estadia.perroId,
      fecha: estadia.fecha,
      monto,
    })),
  ];

  const porCliente = new Map<ID, Pendiente[]>();
  const duenoDe = new Map<ID, ID>();
  for (const perro of await repo.perros.listar()) {
    duenoDe.set(perro.id, perro.clienteId);
  }

  for (const pendiente of pendientes) {
    const clienteId = duenoDe.get(pendiente.perroId);
    // Un perro borrado deja sus estadías huérfanas. No hay a quién cobrarle,
    // así que no se muestra: una fila sin dueño no lleva a ninguna acción.
    if (!clienteId) continue;
    porCliente.set(clienteId, [...(porCliente.get(clienteId) ?? []), pendiente]);
  }

  return [...porCliente.entries()]
    .flatMap(([clienteId, suyos]) => {
      const cliente = clientes.find((c) => c.id === clienteId);
      if (!cliente) return [];
      return [{
        cliente,
        pendientes: [...suyos].sort((a, b) => a.fecha.localeCompare(b.fecha)),
        total: suyos.reduce((suma, p) => suma + p.monto, 0),
      }];
    })
    .sort((a, b) =>
      a.pendientes[0].fecha.localeCompare(b.pendientes[0].fecha),
    );
}

/** En palabras del dueño, para el mensaje que le llega. */
const POR_QUE: Record<TipoPendiente, string> = {
  recargo: "el retiro fuera de horario",
  saldo_hotel: "el saldo de la estadía en el hotel",
  dia: "el día de jardín",
};

/**
 * Resuelve un pendiente cobrándolo, sea del tipo que sea, y le avisa al dueño.
 *
 * El aviso va acá adentro y no en la pantalla a propósito: emitir un cobro y
 * avisarlo son el mismo acto. Si fueran dos llamadas separadas, el día que
 * alguien agregue otra pantalla que cobre se le va a olvidar la segunda, y el
 * dueño se va a enterar de un cobro cuando le llegue la cuenta del mes.
 *
 * Lo que el dueño agenda desde el portal NO pasa por acá: ya vio el precio
 * antes de confirmar, y avisarle sería contarle algo que acaba de hacer.
 *
 * Sin `canal` no se manda nada. El cobro se emite igual: un mensaje que no
 * sale no puede ser motivo para no cobrar.
 */
export async function cobrarPendiente(
  repo: RepositorioPatoteca,
  pendiente: Pendiente,
  ahora: InstanteISO = new Date().toISOString(),
  canal?: CanalMensajeria,
): Promise<Pago> {
  const { tipo, referenciaId } = pendiente;
  const pago =
    tipo === "recargo"
      ? await cobrarRecargo(repo, referenciaId, ahora)
      : tipo === "saldo_hotel"
        ? await emitirSaldoHotel(repo, referenciaId, ahora)
        : await emitirDiaDeJardin(repo, referenciaId, ahora);

  if (canal) await avisarDelCobro(repo, canal, pago, POR_QUE[tipo], ahora);
  return pago;
}

/**
 * Le manda el aviso al dueño por el canal que esté configurado.
 *
 * Con el canal simulado no toca la red y el mensaje queda igual en la
 * bandeja: cuando se enchufe WhatsApp, lo mismo sale de verdad sin tocar una
 * línea acá. Y si el envío falla, el cobro ya está emitido — queda en la
 * bandeja con su motivo, para reintentarlo.
 */
async function avisarDelCobro(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  pago: Pago,
  motivo: string,
  ahora: InstanteISO,
): Promise<void> {
  const cliente = await repo.clientes.obtener(pago.clienteId);
  if (!cliente) return;

  await despacharArmado(
    repo,
    canal,
    armarMensajeDeCobro({ pago, cliente, motivo, ahora }),
    ahora,
  );
}
