/**
 * Pagos y cobranza.
 *
 * La regla que evita cobrar dos veces: un cobro que ya quedó incluido en una
 * cuenta mensual deja de ser cobrable por su cuenta. Se cobra a través de la
 * cuenta, y queda marcado con `cuentaMensualId`.
 */

import { generarCuentaMensual, mesAnterior } from "@/lib/rules/cobro-mensual";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { diasEntre, fechaISO, mesISO } from "@/lib/utils/fecha";
import type {
  Cliente,
  CuentaMensual,
  FechaISO,
  ID,
  InstanteISO,
  MetodoPago,
  Pago,
} from "@/lib/types";

export interface DeudaDeCliente {
  cliente: Cliente;
  pagos: Pago[];
  total: number;
  vencido: number;
  /** Días desde el cobro más antiguo sin pagar. */
  diasDeAtraso: number;
}

export interface ResumenCobranza {
  hoy: FechaISO;
  pendientes: Pago[];
  total: number;
  totalVencido: number;
  porCliente: DeudaDeCliente[];
}

/** Un cobro está vencido si pasó su fecha de vencimiento y sigue impago. */
export function estaVencido(pago: Pago, hoy: FechaISO): boolean {
  if (pago.estado === "pagado" || pago.estado === "reembolsado") return false;
  return pago.venceEn !== undefined && pago.venceEn < hoy;
}

export async function cargarCobranza(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
): Promise<ResumenCobranza> {
  const [todos, clientes] = await Promise.all([
    repo.pagos.porCobrar(),
    repo.clientes.listar(),
  ]);

  // Lo que ya entró en una cuenta mensual se cobra por la cuenta, no suelto.
  const pendientes = todos.filter((p) => !p.cuentaMensualId);

  const porClienteId = new Map<ID, Pago[]>();
  for (const pago of pendientes) {
    porClienteId.set(pago.clienteId, [
      ...(porClienteId.get(pago.clienteId) ?? []),
      pago,
    ]);
  }

  const porCliente: DeudaDeCliente[] = [];
  for (const [clienteId, pagos] of porClienteId) {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) continue;

    const masAntiguo = pagos.reduce(
      (min, p) => (p.emitidoEn < min ? p.emitidoEn : min),
      pagos[0].emitidoEn,
    );

    porCliente.push({
      cliente,
      pagos: [...pagos].sort((a, b) => a.emitidoEn.localeCompare(b.emitidoEn)),
      total: pagos.reduce((suma, p) => suma + p.monto, 0),
      vencido: pagos
        .filter((p) => estaVencido(p, hoy))
        .reduce((suma, p) => suma + p.monto, 0),
      diasDeAtraso: Math.max(0, diasEntre(fechaISO(masAntiguo), hoy)),
    });
  }

  return {
    hoy,
    pendientes,
    total: pendientes.reduce((suma, p) => suma + p.monto, 0),
    totalVencido: pendientes
      .filter((p) => estaVencido(p, hoy))
      .reduce((suma, p) => suma + p.monto, 0),
    porCliente: porCliente.sort((a, b) => b.total - a.total),
  };
}

export async function marcarPagado(
  repo: RepositorioPatoteca,
  pagoId: ID,
  metodo: MetodoPago,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Pago> {
  return repo.pagos.actualizar(pagoId, {
    estado: "pagado",
    metodo,
    pagadoEn: ahora,
  });
}

export interface ResultadoEmision {
  cuentas: CuentaMensual[];
  /** Cobros sueltos que quedaron incluidos en alguna cuenta. */
  consumosIncluidos: number;
  yaEstaba: boolean;
}

/**
 * Emite la cuenta del día 1: junta la renovación de las suscripciones activas
 * con los consumos sueltos del mes anterior, un documento por cliente.
 *
 * La fecha de emisión la pone la regla a partir del periodo (día 1 del mes
 * siguiente), no el reloj: emitir agosto en septiembre o en octubre tiene que
 * dar el mismo documento.
 *
 * Es idempotente: si el periodo ya se emitió, no vuelve a emitirlo. Emitir dos
 * veces significaría cobrarle dos veces al cliente.
 */
export async function emitirCuentasDelMes(
  repo: RepositorioPatoteca,
  periodo: string,
): Promise<ResultadoEmision> {
  const existentes = await repo.cuentasMensuales.porPeriodo(periodo);
  if (existentes.length > 0) {
    return { cuentas: existentes, consumosIncluidos: 0, yaEstaba: true };
  }

  const [clientes, suscripciones, pagos, perros] = await Promise.all([
    repo.clientes.listar(),
    repo.suscripciones.listar(),
    repo.pagos.porCobrar(),
    repo.perros.listar(),
  ]);

  const nombrePerro = (perroId: ID) =>
    perros.find((p) => p.id === perroId)?.nombre;

  const sueltos = pagos.filter(
    (p) => !p.cuentaMensualId && mesISO(p.emitidoEn) === periodo,
  );

  const cuentas: CuentaMensual[] = [];
  let consumosIncluidos = 0;

  for (const cliente of clientes) {
    const borrador = generarCuentaMensual({
      id: "pendiente",
      clienteId: cliente.id,
      periodo,
      suscripciones,
      pagosPendientes: sueltos,
      nombrePerro,
    });

    // Sin movimientos no se emite nada: nadie quiere recibir una cuenta en $0.
    if (borrador.total <= 0) continue;

    const cuenta = await repo.cuentasMensuales.crear({
      clienteId: borrador.clienteId,
      periodo: borrador.periodo,
      emitidaEn: borrador.emitidaEn,
      renovaciones: borrador.renovaciones,
      consumos: borrador.consumos,
      total: borrador.total,
      estado: "pendiente",
    });
    cuentas.push(cuenta);

    // Los consumos que entraron dejan de ser cobrables por separado.
    const incluidos = sueltos.filter((p) => p.clienteId === cliente.id);
    for (const pago of incluidos) {
      await repo.pagos.actualizar(pago.id, { cuentaMensualId: cuenta.id });
    }
    consumosIncluidos += incluidos.length;

    await repo.pagos.crear({
      clienteId: cliente.id,
      concepto: "cuenta_mensual",
      referenciaId: cuenta.id,
      monto: cuenta.total,
      estado: "pendiente",
      emitidoEn: cuenta.emitidaEn,
      venceEn: fechaISO(cuenta.emitidaEn),
    });
  }

  return { cuentas, consumosIncluidos, yaEstaba: false };
}

/** El periodo que toca emitir hoy: el mes anterior al actual. */
export function periodoAEmitir(hoy: FechaISO): string {
  return mesAnterior(hoy.slice(0, 7));
}
