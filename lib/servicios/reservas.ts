/**
 * Lo que el cliente compra: reservas de hotel, días y planes de jardín,
 * servicios spot y órdenes de tienda.
 *
 * Todo pasa por la misma puerta: se COTIZA primero (con capacidad y admisión
 * ya revisadas) y recién después se confirma. Así la pantalla puede mostrar el
 * precio en vivo y los reparos sin haber creado nada.
 *
 * A diferencia del ingreso no planificado del staff —donde el perro ya está en
 * la puerta— acá sí se bloquea: el cliente está reservando a futuro y no hay
 * nada que registrar todavía.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { evaluarAdmision, type ResultadoAdmision } from "@/lib/rules/admision";
import {
  cuposDisponibles,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  verificarCapacidad,
  type OcupanteRango,
  type ResultadoCapacidad,
} from "@/lib/rules/capacidad";
import { esClienteActivo } from "@/lib/rules/cliente";
import { calcularAbono, calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import { calcularPrecioJardin } from "@/lib/rules/precio-jardin";
import { comprarPlan, elegirPlanParaUsar, planesVigentes } from "@/lib/rules/planes";
import { cotizarPaseo, cotizarSpa, cotizarTraslado } from "@/lib/rules/servicios";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { fechaISO, instanteEn, rangoFechas } from "@/lib/utils/fecha";
import type {
  Cotizacion,
  DuracionPaseo,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  NivelSpa,
  OrdenTienda,
  Pago,
  PlanComprado,
  ReservaHotel,
  ServicioAgendado,
  TipoPlan,
} from "@/lib/types";

export class ReservaRechazada extends Error {
  constructor(
    mensaje: string,
    readonly motivos: string[],
  ) {
    super(mensaje);
    this.name = "ReservaRechazada";
  }
}

/** Ocupantes ya comprometidos en un rango de días. */
async function ocupantesEnRango(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<OcupanteRango[]> {
  const [reservas, estadias] = await Promise.all([
    repo.reservasHotel.enRango(desde, hasta),
    repo.estadiasJardin.enRango(desde, hasta),
  ]);
  return [...ocupantesDeReservas(reservas), ...ocupantesDeEstadias(estadias)];
}

export interface Disponibilidad {
  admision: ResultadoAdmision;
  capacidad: ResultadoCapacidad;
  /** true si no hay ningún reparo: se puede confirmar. */
  sePuede: boolean;
}

function motivosDe(d: Disponibilidad): string[] {
  return [
    ...d.admision.problemas.map((p) => p.mensaje),
    ...(d.capacidad.hayCupo
      ? []
      : ["No queda cupo en alguna de las horas que elegiste."]),
  ];
}

/* ── Hotel ─────────────────────────────────────────────────────────── */

export interface EntradaReservaHotel {
  perroId: ID;
  inicio: InstanteISO;
  fin: InstanteISO;
  paseosContratados?: number;
}

export interface CotizacionHotel extends Disponibilidad {
  cotizacion: Cotizacion;
  abono: number;
  /** Aplicó el 10% por tener plan de jardín vigente. */
  conPlanDeJardin: boolean;
}

export async function cotizarReservaHotel(
  repo: RepositorioPatoteca,
  entrada: EntradaReservaHotel,
): Promise<CotizacionHotel> {
  const perro = await repo.perros.obtener(entrada.perroId);
  if (!perro) throw new Error(`No existe el perro ${entrada.perroId}`);

  const desde = fechaISO(entrada.inicio);
  const hasta = fechaISO(entrada.fin);

  const [existentes, planes, estadiasDelDia] = await Promise.all([
    ocupantesEnRango(repo, desde, hasta),
    repo.planes.porPerro(entrada.perroId),
    repo.estadiasJardin.porFecha(desde),
  ]);

  const conPlanDeJardin = planesVigentes(planes, desde).length > 0;

  // El descuento de segundo perro aplica si el dueño ya tiene otro perro
  // comprometido ese día.
  const indicePerro = estadiasDelDia.filter(
    (e) => e.clienteId === perro.clienteId && e.perroId !== perro.id,
  ).length;

  const cotizacion = calcularPrecioHotel({
    inicio: entrada.inicio,
    fin: entrada.fin,
    paseosContratados: entrada.paseosContratados,
    conPlanDeJardin,
    indicePerro,
  });

  const capacidad = verificarCapacidad(
    [
      {
        perroId: entrada.perroId,
        linea: "hotel",
        inicio: entrada.inicio,
        fin: entrada.fin,
      },
    ],
    existentes,
  );

  const admision = evaluarAdmision(perro, { fecha: desde });

  return {
    cotizacion,
    abono: cotizacion.abono ?? calcularAbono(cotizacion.total),
    conPlanDeJardin,
    admision,
    capacidad,
    sePuede: admision.admitido && capacidad.hayCupo,
  };
}

export interface ResultadoReservaHotel {
  reserva: ReservaHotel;
  abono: Pago;
}

/** Confirma la reserva y deja pagado el abono del 30% (mock). */
export async function crearReservaHotel(
  repo: RepositorioPatoteca,
  entrada: EntradaReservaHotel,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoReservaHotel> {
  const previa = await cotizarReservaHotel(repo, entrada);
  if (!previa.sePuede) {
    throw new ReservaRechazada(
      "No pudimos tomar la reserva.",
      motivosDe(previa),
    );
  }

  const perro = (await repo.perros.obtener(entrada.perroId))!;

  const reserva = await repo.reservasHotel.crear({
    clienteId: perro.clienteId,
    perroId: perro.id,
    inicioProgramado: entrada.inicio,
    finProgramado: entrada.fin,
    paseosContratados: entrada.paseosContratados ?? 0,
    estado: "confirmada",
    cotizacion: previa.cotizacion,
    abonoPagado: true,
    creadaEn: ahora,
  });

  const abono = await repo.pagos.crear({
    clienteId: perro.clienteId,
    concepto: "abono_hotel",
    referenciaId: reserva.id,
    monto: previa.abono,
    estado: "pagado",
    metodo: "webpay",
    emitidoEn: ahora,
    pagadoEn: ahora,
  });

  return { reserva, abono };
}

/* ── Jardín: día suelto ────────────────────────────────────────────── */

export interface EntradaDiaJardin {
  perroId: ID;
  fecha: FechaISO;
  /** Minutos del día. Por defecto, apertura a cierre. */
  desdeMinuto?: number;
  hastaMinuto?: number;
}

export interface CotizacionJardin extends Disponibilidad {
  cotizacion: Cotizacion;
  /** Plan que cubriría el día, si tiene uno con saldo. */
  planDisponible: PlanComprado | null;
  inicio: InstanteISO;
  fin: InstanteISO;
}

export async function cotizarDiaJardin(
  repo: RepositorioPatoteca,
  entrada: EntradaDiaJardin,
): Promise<CotizacionJardin> {
  const perro = await repo.perros.obtener(entrada.perroId);
  if (!perro) throw new Error(`No existe el perro ${entrada.perroId}`);

  const inicio = instanteEn(
    entrada.fecha,
    entrada.desdeMinuto ?? NEGOCIO.jardin.horaApertura * 60,
  );
  const fin = instanteEn(
    entrada.fecha,
    entrada.hastaMinuto ?? NEGOCIO.jardin.horaCierre * 60,
  );

  const [existentes, planes, delDia] = await Promise.all([
    ocupantesEnRango(repo, entrada.fecha, entrada.fecha),
    repo.planes.porPerro(entrada.perroId),
    repo.estadiasJardin.porFecha(entrada.fecha),
  ]);

  const planDisponible = elegirPlanParaUsar(
    planes,
    entrada.perroId,
    entrada.fecha,
  );

  const indicePerro = delDia.filter(
    (e) => e.clienteId === perro.clienteId && e.perroId !== perro.id,
  ).length;

  const cotizacion = calcularPrecioJardin({
    inicio,
    fin,
    origen: planDisponible ? "plan" : "dia_suelto",
    indicePerro,
  });

  const capacidad = verificarCapacidad(
    [{ perroId: entrada.perroId, linea: "jardin", inicio, fin }],
    existentes,
  );
  const admision = evaluarAdmision(perro, { fecha: entrada.fecha });

  // Un perro no puede tener dos jornadas el mismo día.
  const yaAgendado = delDia.some(
    (e) => e.perroId === entrada.perroId && e.estado !== "cancelada",
  );

  return {
    cotizacion,
    planDisponible,
    inicio,
    fin,
    admision,
    capacidad,
    sePuede: admision.admitido && capacidad.hayCupo && !yaAgendado,
  };
}

export interface ResultadoDiaJardin {
  estadia: EstadiaJardin;
  planUsado: PlanComprado | null;
  pago: Pago | null;
}

export async function reservarDiaJardin(
  repo: RepositorioPatoteca,
  entrada: EntradaDiaJardin,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoDiaJardin> {
  const previa = await cotizarDiaJardin(repo, entrada);
  if (!previa.sePuede) {
    throw new ReservaRechazada(
      "No pudimos tomar el día.",
      motivosDe(previa).length > 0
        ? motivosDe(previa)
        : ["Ese perro ya tiene el día agendado."],
    );
  }

  const perro = (await repo.perros.obtener(entrada.perroId))!;

  // El día del plan se descuenta al AGENDAR, no cuando el perro llega.
  let planUsado: PlanComprado | null = null;
  if (previa.planDisponible) {
    planUsado = await repo.planes.actualizar(previa.planDisponible.id, {
      diasUsados: previa.planDisponible.diasUsados + 1,
    });
  }

  const estadia = await repo.estadiasJardin.crear({
    clienteId: perro.clienteId,
    perroId: perro.id,
    fecha: entrada.fecha,
    inicioProgramado: previa.inicio,
    finProgramado: previa.fin,
    origen: previa.planDisponible ? "plan" : "dia_suelto",
    planId: previa.planDisponible?.id,
    estado: "esperada",
    cotizacion: previa.cotizacion,
    creadaEn: ahora,
  });

  // El día suelto se cobra al cerrar la jornada, con la hora real: acá solo
  // queda agendado.
  return { estadia, planUsado, pago: null };
}

/* ── Jardín: plan ──────────────────────────────────────────────────── */

export async function comprarPlanDeJardin(
  repo: RepositorioPatoteca,
  args: { perroId: ID; tipo: TipoPlan; dias?: number },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ plan: PlanComprado; pago: Pago }> {
  const perro = await repo.perros.obtener(args.perroId);
  if (!perro) throw new Error(`No existe el perro ${args.perroId}`);

  const admision = evaluarAdmision(perro, { fecha: fechaISO(ahora) });
  if (!admision.admitido) {
    throw new ReservaRechazada(
      "Este perro todavía no puede comprar un plan.",
      admision.problemas.map((p) => p.mensaje),
    );
  }

  const planesActuales = await repo.planes.porPerro(args.perroId);
  const { plan, cerrados, cotizacion } = comprarPlan({
    id: "pendiente",
    clienteId: perro.clienteId,
    perroId: perro.id,
    tipo: args.tipo,
    dias: args.dias,
    compradoEn: ahora,
    planesActuales,
  });

  // Comprar uno nuevo cierra el anterior: los días no son acumulables.
  if (cerrados.length > 0) await repo.planes.guardarVarios(cerrados);

  const { id: _descartado, ...sinId } = plan;
  void _descartado;
  const guardado = await repo.planes.crear(sinId);

  const pago = await repo.pagos.crear({
    clienteId: perro.clienteId,
    concepto: "plan",
    referenciaId: guardado.id,
    monto: cotizacion.total,
    estado: "pagado",
    metodo: "webpay",
    emitidoEn: ahora,
    pagadoEn: ahora,
  });

  return { plan: guardado, pago };
}

/* ── Servicios spot ────────────────────────────────────────────────── */

export interface EntradaServicio {
  perroId: ID;
  fechaHora: InstanteISO;
  tipo: "spa" | "paseo" | "traslado";
  nivelSpa?: NivelSpa;
  duracionMin?: DuracionPaseo;
  km?: number;
}

export async function cotizarServicio(
  repo: RepositorioPatoteca,
  entrada: EntradaServicio,
): Promise<Cotizacion> {
  const perro = await repo.perros.obtener(entrada.perroId);
  if (!perro) throw new Error(`No existe el perro ${entrada.perroId}`);

  const [planes, estadias] = await Promise.all([
    repo.planes.porPerro(entrada.perroId),
    repo.estadiasJardin.porCliente(perro.clienteId),
  ]);

  const hoy = fechaISO(entrada.fechaHora);
  const ultimaEstadia = estadias
    .map((e) => e.fecha)
    .filter((f) => f <= hoy)
    .sort()
    .at(-1);

  const activo = esClienteActivo({ planes, ultimaEstadia, fecha: hoy });

  if (entrada.tipo === "spa") {
    return cotizarSpa({
      pesoKg: perro.pesoKg,
      nivel: entrada.nivelSpa ?? "express",
      esClienteActivo: activo,
    });
  }
  if (entrada.tipo === "paseo") {
    return cotizarPaseo({
      duracionMin: entrada.duracionMin ?? 30,
      esClienteActivo: activo,
    });
  }
  return cotizarTraslado({ km: entrada.km ?? 0, fechaHora: entrada.fechaHora });
}

export async function agendarServicio(
  repo: RepositorioPatoteca,
  entrada: EntradaServicio,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ servicio: ServicioAgendado; pago: Pago }> {
  const perro = (await repo.perros.obtener(entrada.perroId))!;
  const cotizacion = await cotizarServicio(repo, entrada);

  const servicio = await repo.servicios.crear({
    clienteId: perro.clienteId,
    perroId: perro.id,
    tipo: entrada.tipo,
    fechaHora: entrada.fechaHora,
    nivelSpa: entrada.nivelSpa,
    duracionMin: entrada.duracionMin,
    km: entrada.km,
    estado: "agendado",
    cotizacion,
    creadoEn: ahora,
  });

  const pago = await repo.pagos.crear({
    clienteId: perro.clienteId,
    concepto: "servicio",
    referenciaId: servicio.id,
    monto: cotizacion.total,
    estado: "pendiente",
    emitidoEn: ahora,
    venceEn: fechaISO(entrada.fechaHora),
  });

  return { servicio, pago };
}

/* ── Tienda ────────────────────────────────────────────────────────── */

export interface ItemDeCarrito {
  productoId: ID;
  cantidad: number;
}

/**
 * Cierra la compra: descuenta stock y deja la orden pagada.
 *
 * Si un producto no alcanza, se compra lo que hay en vez de fallar entera:
 * en una tienda de mostrador eso es lo que pasa de verdad.
 */
export async function comprarEnTienda(
  repo: RepositorioPatoteca,
  clienteId: ID,
  items: ItemDeCarrito[],
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ orden: OrdenTienda; pago: Pago; ajustados: string[] }> {
  const productos = await repo.productos.listar();
  const ajustados: string[] = [];
  const lineas = [];

  for (const item of items) {
    const producto = productos.find((p) => p.id === item.productoId);
    if (!producto || producto.stock === 0) {
      if (producto) ajustados.push(`${producto.nombre} quedó sin stock.`);
      continue;
    }

    const cantidad = Math.min(item.cantidad, producto.stock);
    if (cantidad < item.cantidad) {
      ajustados.push(
        `De ${producto.nombre} quedaban ${producto.stock}: se cobraron esos.`,
      );
    }

    lineas.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad,
      precioUnitario: producto.precio,
    });
    await repo.productos.ajustarStock(producto.id, -cantidad);
  }

  if (lineas.length === 0) {
    throw new ReservaRechazada("No pudimos cerrar la compra.", [
      "Ninguno de los productos tiene stock.",
    ]);
  }

  const total = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);

  const orden = await repo.ordenes.crear({
    clienteId,
    items: lineas,
    total,
    estado: "pagada",
    creadaEn: ahora,
  });

  const pago = await repo.pagos.crear({
    clienteId,
    concepto: "tienda",
    referenciaId: orden.id,
    monto: total,
    estado: "pagado",
    metodo: "webpay",
    emitidoEn: ahora,
    pagadoEn: ahora,
  });

  return { orden, pago, ajustados };
}

/**
 * Cupos libres por día, para pintar el selector.
 *
 * Es el tope menos el PICO del día: la respuesta conservadora, que es la
 * correcta cuando lo que se va a reservar es una jornada completa.
 */
export async function diasConCupo(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<Record<FechaISO, number>> {
  const existentes = await ocupantesEnRango(repo, desde, hasta);
  const libres: Record<FechaISO, number> = {};

  for (const fecha of rangoFechas(desde, hasta)) {
    libres[fecha] = cuposDisponibles(fecha, existentes);
  }

  return libres;
}
