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
import { fechaISO, formatearHora } from "@/lib/utils/fecha";
import {
  calcularHorasDeMas,
  calcularRecargoFueraDeHorario,
  describirHorasDeMas,
} from "@/lib/rules/precio-jardin";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type {
  Cliente,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  Pago,
  Perro,
  ReservaHotel,
  ServicioAgendado,
} from "@/lib/types";

export class DecisionImposible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DecisionImposible";
  }
}

/* ── Los servicios que pidió el dueño ──────────────────────────────── */

/**
 * Un servicio agendado desde el portal que todavía no tiene precio firme.
 *
 * El dueño vio el afiche y la pantalla le prometió que le hablamos para
 * confirmar el valor: el baño depende del pelo y del peso que se ven acá, y
 * el traslado de los kilómetros y de la hora. Por eso nace sin cobro
 * (`agendarServicio`), y esta es la cola que cierra la promesa.
 *
 * A diferencia de las otras tres, acá el monto NO está decidido. En el
 * recargo la pregunta es si se cobra; en el saldo y en el día, cuándo se
 * emite. Acá la pregunta es cuánto, y la respuesta sale de una conversación
 * que la app no tuvo.
 *
 * Una cola que nadie mira es peor que no prometer nada: sin esto, un
 * servicio pedido desde el portal no se cobra nunca.
 */
export interface ServicioPorConfirmar {
  servicio: ServicioAgendado;
  perro: Perro | null;
  cliente: Cliente | null;
  /** Lo que el dueño vio en el portal, que es por dónde parte la conversación. */
  cotizado: number;
}

export async function serviciosPorConfirmar(
  repo: RepositorioPatoteca,
): Promise<ServicioPorConfirmar[]> {
  const servicios = await repo.servicios.listar();
  const esperando = servicios.filter((s) => s.estado === "por_confirmar");
  if (esperando.length === 0) return [];

  const [perros, clientes] = await Promise.all([
    repo.perros.listar(),
    repo.clientes.listar(),
  ]);

  return esperando
    .map((servicio) => ({
      servicio,
      perro: perros.find((p) => p.id === servicio.perroId) ?? null,
      cliente: clientes.find((c) => c.id === servicio.clienteId) ?? null,
      cotizado: servicio.cotizacion.total,
    }))
    // Lo que lleva más tiempo esperando primero: lo que se añeja es lo que
    // se termina no cobrando, y acá además hay alguien esperando que le
    // hablen.
    .sort((a, b) => a.servicio.creadoEn.localeCompare(b.servicio.creadoEn));
}

/**
 * Le pone precio al servicio y lo cobra.
 *
 * La cotización original NO se toca: es lo que el dueño vio y por eso
 * quedó guardada. Si el valor final es otro, el que manda es el del cobro,
 * igual que en el hotel, donde la cotización es una cosa y el saldo que se
 * emite al retiro es otra. Reescribirla dejaría el desglose sin cuadrar
 * con su propio total y borraría de qué se habló.
 */
export async function confirmarServicio(
  repo: RepositorioPatoteca,
  servicioId: ID,
  monto: number,
  ahora: InstanteISO = new Date().toISOString(),
  canal?: CanalMensajeria,
): Promise<{ servicio: ServicioAgendado; pago: Pago }> {
  const servicio = await repo.servicios.obtener(servicioId);
  if (!servicio) throw new DecisionImposible("Ese servicio ya no está.");
  if (servicio.estado !== "por_confirmar") {
    throw new DecisionImposible("Ese servicio ya tiene su valor confirmado.");
  }
  if (!Number.isFinite(monto) || monto < 0) {
    throw new DecisionImposible("El valor tiene que ser un monto válido.");
  }

  const pago = await repo.pagos.crear({
    clienteId: servicio.clienteId,
    concepto: "servicio",
    referenciaId: servicio.id,
    monto: Math.round(monto),
    estado: "pendiente",
    emitidoEn: ahora,
    venceEn: fechaISO(servicio.fechaHora),
  });

  const confirmado = await repo.servicios.actualizar(servicioId, {
    estado: "agendado",
  });

  // Emitir un cobro es avisarlo, igual que en `cobrarPendiente`: el dueño
  // no estuvo presente cuando se fijó el precio.
  if (canal) {
    await avisarDelCobro(repo, canal, pago, "el servicio que pediste", ahora);
  }

  return { servicio: confirmado, pago };
}

/* ── Lo que decide Administración: el retiro tarde y las horas de más ─ */

/**
 * Dos cosas del jardín que quedan calculadas al cerrar la jornada y nunca se
 * cobran solas. Las dos son una DECISIÓN —cobrarla o perdonarla— y se
 * contestan igual: "¿existe ya un cobro de este concepto para esta estadía?".
 * Perdonar deja un cobro en cero, no un vacío, así que no vuelve a aparecer.
 *
 *   · El **retiro tarde**: con plan desde las 19:00, sin plan desde las
 *     21:00 (`calcularRecargoFueraDeHorario`).
 *   · Las **horas de más**: reservó y pagó menos horas de las que estuvo,
 *     y el tramo real es más caro que el reservado (`calcularHorasDeMas`).
 */
export type ConceptoDecidible = "recargo_jardin" | "horas_de_mas";

export interface DecisionPendiente {
  estadia: EstadiaJardin;
  monto: number;
  /** En palabras, para la planilla y para el aviso al dueño. */
  detalle: string;
}

/** Por compatibilidad con quien ya los llamaba así. */
export type RecargoPorDecidir = DecisionPendiente;

/** El recargo que le corresponde a una estadía ya cerrada, si lo hubo. */
function recargoDe(estadia: EstadiaJardin): { monto: number; detalle: string } {
  if (!estadia.finReal) return { monto: 0, detalle: "" };
  const inicio = estadia.inicioReal ?? estadia.inicioProgramado;
  const { monto } = calcularRecargoFueraDeHorario(
    inicio,
    estadia.finReal,
    estadia.origen,
  );
  return { monto, detalle: `retiro ${formatearHora(estadia.finReal)}` };
}

/**
 * Lo que se cobró POR ADELANTADO por el día, o nulo si no se cobró así.
 *
 * Las horas de más solo existen si hubo una reserva pagada antes de que el
 * perro llegara. Un ingreso sin reserva se cobra después, con las horas
 * reales (`diasPorCobrar`), y ahí no hay nada "de más": mirarlo acá lo
 * cobraría dos veces. La señal es la fecha del cobro, que es lo único que
 * distingue las dos cosas: el día reservado se cobra al agendarlo.
 */
function cobradoPorAdelantado(pagos: Pago[], estadia: EstadiaJardin): number | null {
  const llegada = estadia.inicioReal ?? estadia.inicioProgramado;
  const delDia = pagos.filter(
    (p) =>
      p.referenciaId === estadia.id &&
      p.concepto === "dia_suelto" &&
      p.emitidoEn < llegada &&
      // Anulado en cero: el día no se cobró, no hay contra qué comparar.
      !(p.estado === "reembolsado" && p.monto === 0),
  );
  if (delDia.length === 0) return null;
  return delDia.reduce((suma, p) => suma + p.monto, 0);
}

function horasDeMasDe(
  estadia: EstadiaJardin,
  pagos: Pago[],
): { monto: number; detalle: string } {
  if (!estadia.finReal || estadia.origen !== "dia_suelto") {
    return { monto: 0, detalle: "" };
  }
  const cobrado = cobradoPorAdelantado(pagos, estadia);
  if (cobrado === null) return { monto: 0, detalle: "" };
  const { monto } = calcularHorasDeMas({
    inicioProgramado: estadia.inicioProgramado,
    finProgramado: estadia.finProgramado,
    inicioReal: estadia.inicioReal,
    finReal: estadia.finReal,
    cobrado,
  });
  return { monto, detalle: describirHorasDeMas(estadia) };
}

/**
 * Un cobro de este concepto para esta estadía significa "ya se decidió",
 * tenga monto o no: perdonar deja un cobro en cero, no deja un vacío.
 */
function yaDecidido(pagos: Pago[], estadiaId: ID, concepto: ConceptoDecidible): boolean {
  return pagos.some(
    (p) => p.referenciaId === estadiaId && p.concepto === concepto,
  );
}

async function porDecidir(
  repo: RepositorioPatoteca,
  concepto: ConceptoDecidible,
): Promise<DecisionPendiente[]> {
  const [estadias, pagos] = await Promise.all([
    repo.estadiasJardin.listar(),
    repo.pagos.listar(),
  ]);

  return estadias
    .filter((e) => e.estado === "finalizada" && !yaDecidido(pagos, e.id, concepto))
    .map((estadia) => ({
      estadia,
      ...(concepto === "recargo_jardin"
        ? recargoDe(estadia)
        : horasDeMasDe(estadia, pagos)),
    }))
    .filter((r) => r.monto > 0)
    .sort((a, b) => (a.estadia.finReal ?? "").localeCompare(b.estadia.finReal ?? ""));
}

export function recargosPorDecidir(repo: RepositorioPatoteca) {
  return porDecidir(repo, "recargo_jardin");
}

/** Los días que se pagaron por menos horas de las que el perro estuvo. */
export function horasDeMasPorDecidir(repo: RepositorioPatoteca) {
  return porDecidir(repo, "horas_de_mas");
}

const YA_SE_DECIDIO: Record<ConceptoDecidible, string> = {
  recargo_jardin: "Ese retiro tarde ya se decidió.",
  horas_de_mas: "Esas horas de más ya se decidieron.",
};

const NADA_QUE_COBRAR: Record<ConceptoDecidible, string> = {
  recargo_jardin: "Ese retiro no tiene recargo que cobrar.",
  horas_de_mas: "Ese día no tiene horas de más que cobrar.",
};

async function decidir(
  repo: RepositorioPatoteca,
  concepto: ConceptoDecidible,
  estadiaId: ID,
  cobrar: boolean,
  ahora: InstanteISO,
): Promise<Pago> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new DecisionImposible(`No existe la estadía ${estadiaId}`);

  const pagos = await repo.pagos.listar();
  if (yaDecidido(pagos, estadiaId, concepto)) {
    throw new DecisionImposible(YA_SE_DECIDIO[concepto]);
  }

  const { monto: calculado } =
    concepto === "recargo_jardin" ? recargoDe(estadia) : horasDeMasDe(estadia, pagos);
  if (cobrar && calculado <= 0) {
    throw new DecisionImposible(NADA_QUE_COBRAR[concepto]);
  }
  const monto = cobrar ? calculado : 0;

  return repo.pagos.crear({
    clienteId: estadia.clienteId,
    concepto,
    referenciaId: estadia.id,
    monto,
    // Lo perdonado nace reembolsado en cero, que es como la app ya anula el
    // cobro del día de prueba. Borrarlo sería más limpio de mirar y dejaría
    // la cobranza del mes sin poder explicarse: un cobro que desaparece no
    // deja rastro de que existió ni de que alguien lo perdonó.
    estado: monto > 0 ? "pendiente" : "reembolsado",
    emitidoEn: ahora,
  });
}

/** Lo cobra: nace pendiente y entra en la cuenta del mes como cualquier otro. */
export function cobrarRecargo(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return decidir(repo, "recargo_jardin", estadiaId, true, ahora);
}

/** Lo perdona, dejando constancia de que se perdonó. */
export function perdonarRecargo(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return decidir(repo, "recargo_jardin", estadiaId, false, ahora);
}

export function cobrarHorasDeMas(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return decidir(repo, "horas_de_mas", estadiaId, true, ahora);
}

export function perdonarHorasDeMas(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return decidir(repo, "horas_de_mas", estadiaId, false, ahora);
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

export type TipoPendiente = "recargo" | "horas_de_mas" | "saldo_hotel" | "dia";

export interface Pendiente {
  tipo: TipoPendiente;
  /** La estadía o reserva que lo originó: es con lo que se decide. */
  referenciaId: ID;
  perroId: ID;
  fecha: FechaISO;
  monto: number;
  /**
   * En el recargo y en las horas de más: lo que pasó, en palabras ("retiro
   * 21:40", "Reservó 09:00 a 12:00 · estuvo 09:10 a 18:00"). Es lo que se
   * mira para decidir y lo que se le explica al dueño.
   */
  detalle?: string;
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
  const [recargos, horasDeMas, saldos, dias, clientes] = await Promise.all([
    recargosPorDecidir(repo),
    horasDeMasPorDecidir(repo),
    saldosPorEmitir(repo),
    diasPorCobrar(repo),
    repo.clientes.listar(),
  ]);

  const pendientes: Pendiente[] = [
    ...recargos.map(({ estadia, detalle, monto }) => ({
      tipo: "recargo" as const,
      referenciaId: estadia.id,
      perroId: estadia.perroId,
      fecha: estadia.fecha,
      monto,
      detalle,
    })),
    ...horasDeMas.map(({ estadia, detalle, monto }) => ({
      tipo: "horas_de_mas" as const,
      referenciaId: estadia.id,
      perroId: estadia.perroId,
      fecha: estadia.fecha,
      monto,
      detalle,
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
  horas_de_mas: "las horas de más en el jardín",
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
      : tipo === "horas_de_mas"
        ? await cobrarHorasDeMas(repo, referenciaId, ahora)
        : tipo === "saldo_hotel"
          ? await emitirSaldoHotel(repo, referenciaId, ahora)
          : await emitirDiaDeJardin(repo, referenciaId, ahora);

  // Las horas de más se explican con las horas: "las horas de más" a secas
  // es justo el cobro que hace escribir preguntando qué es.
  const motivo =
    tipo === "horas_de_mas" && pendiente.detalle
      ? `${POR_QUE[tipo]} (${pendiente.detalle.toLowerCase()})`
      : POR_QUE[tipo];
  if (canal) await avisarDelCobro(repo, canal, pago, motivo, ahora);
  return pago;
}

/**
 * Lo perdona. Solo el recargo y las horas de más: un saldo de hotel o un día
 * ya usado no son una decisión, son una deuda.
 */
export async function perdonarPendiente(
  repo: RepositorioPatoteca,
  pendiente: Pendiente,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  if (pendiente.tipo === "recargo") {
    return perdonarRecargo(repo, pendiente.referenciaId, ahora);
  }
  if (pendiente.tipo === "horas_de_mas") {
    return perdonarHorasDeMas(repo, pendiente.referenciaId, ahora);
  }
  throw new DecisionImposible("Eso no se perdona: es una deuda, no una decisión.");
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
