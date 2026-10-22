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
import {
  calcularDevolucionJardin,
  calcularPrecioJardin,
  type DevolucionJardin,
} from "@/lib/rules/precio-jardin";
import { elegirPlanParaUsar, planesVigentes } from "@/lib/rules/planes";
import { cotizarPaseo, cotizarSpa, cotizarTraslado } from "@/lib/rules/servicios";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { describirAviso, dejarAviso } from "@/lib/servicios/avisos";
import { formatearCLP } from "@/lib/utils/moneda";
import {
  fechaISO,
  formatearFechaCorta,
  instanteEn,
  rangoFechas,
} from "@/lib/utils/fecha";
import type {
  CambioDeCampo,
  Cotizacion,
  DatosBancarios,
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
export async function ocupantesEnRango(
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

/**
 * Toma la reserva y emite el cobro del abono.
 *
 * Queda **por confirmar** hasta que llegue el abono: no hay pasarela, el
 * dueño transfiere y Administración lo marca pagado (`marcarPagado`), que es
 * lo que la confirma. El cupo sí queda tomado desde ya —una reserva
 * pendiente ocupa, ver `ESTADOS_RESERVA_OCUPAN`—, porque si no dos dueños
 * podrían transferir por el mismo lugar.
 */
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
    estado: "pendiente",
    cotizacion: previa.cotizacion,
    abonoPagado: false,
    creadaEn: ahora,
  });

  // Pendiente y sin fecha de pago, igual que exige la base (_permisos): nadie
  // se da por pagado solo.
  const abono = await repo.pagos.crear({
    clienteId: perro.clienteId,
    concepto: "abono_hotel",
    referenciaId: reserva.id,
    monto: previa.abono,
    estado: "pendiente",
    emitidoEn: ahora,
    venceEn: fechaISO(entrada.inicio),
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

  // Con plan, el día del pack se descuenta al AGENDAR, no cuando el perro
  // llega, y el día y el descuento van juntos en `repo.agenda`: en la nube
  // el dueño no toca el saldo de su plan, porque se lo dejaría en cero.
  let estadia: EstadiaJardin;
  let planUsado: PlanComprado | null = null;
  if (previa.planDisponible) {
    ({ estadia, plan: planUsado } = await repo.agenda.agendarDiaConPlan(
      previa.planDisponible.id,
      { fecha: entrada.fecha, inicio: previa.inicio, fin: previa.fin },
      previa.cotizacion,
      ahora,
    ));
  } else {
    estadia = await repo.estadiasJardin.crear({
      clienteId: perro.clienteId,
      perroId: perro.id,
      fecha: entrada.fecha,
      inicioProgramado: previa.inicio,
      finProgramado: previa.fin,
      origen: "dia_suelto",
      estado: "esperada",
      cotizacion: previa.cotizacion,
      creadaEn: ahora,
    });
  }

  // El día suelto se paga POR ADELANTADO, igual que el plan: la jornada se
  // cobra al agendarla, no al cerrarla. Lo que puede aparecer después es el
  // recargo por retiro tarde, y ese no nace solo — lo decide Administración.
  //
  // Con plan el total es cero: el pack ya cubrió el día y lo único que pasó
  // al agendar fue descontarlo del saldo.
  const total = previa.cotizacion.total;
  const pago =
    total > 0
      ? await repo.pagos.crear({
          clienteId: perro.clienteId,
          concepto: "dia_suelto",
          referenciaId: estadia.id,
          monto: total,
          estado: "pendiente",
          emitidoEn: ahora,
        })
      : null;

  return { estadia, planUsado, pago };
}

/**
 * Cancelar un día de jardín ya agendado.
 *
 * Existe porque el día ahora se paga por adelantado: antes cancelar no
 * costaba nada porque no había nada cobrado, y dejarlo así después del
 * cambio habría significado que el dueño paga un día que no usó sin ninguna
 * manera de echarse atrás.
 *
 * Sigue la misma política que el hotel y el día de prueba: con aviso
 * suficiente no se cobra, y pasado el corte el día se pierde. El cupo quedó
 * tomado y a esa altura ya no se alcanza a revender.
 */
export interface ResultadoCancelacionJardin {
  estadia: EstadiaJardin;
  devolucion: DevolucionJardin;
  /** El plan al que se le devolvió el día, si correspondía. */
  planDevuelto: PlanComprado | null;
  /**
   * Lo que hay que transferirle de vuelta al cliente.
   *
   * Cero cuando el cobro estaba pendiente: anularlo YA fue la devolución, no
   * hay plata que mover. Prometerle una transferencia a alguien que nunca
   * pagó es prometerle algo que no va a llegar nunca.
   */
  aDevolver: number;
}

/**
 * Lo que el cliente ya pagó por este día.
 *
 * No depende de la hora, así que la pantalla lo puede pedir una vez y seguir
 * recalculando la política en cada render: lo que cambia con el reloj es si
 * corresponde devolver, no cuánto se pagó.
 */
export async function loPagadoPorElDia(
  repo: RepositorioPatoteca,
  estadiaId: ID,
): Promise<number> {
  const pagos = await repo.pagos.listar();
  return pagos
    .filter((p) => p.referenciaId === estadiaId && p.estado === "pagado")
    .reduce((suma, p) => suma + p.monto, 0);
}

/**
 * Qué pasaría si cancelara ahora, sin cancelar nada.
 *
 * La pantalla lo necesita para decidir si pedirle los datos de transferencia:
 * solo tiene sentido cuando de verdad hay plata que devolver.
 */
export async function simularCancelacionDeJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ devolucion: DevolucionJardin; aDevolver: number }> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new ReservaRechazada("No existe ese día.", []);

  const devolucion = calcularDevolucionJardin(estadia.inicioProgramado, ahora);
  const pagos = await repo.pagos.listar();
  const pagado = pagos
    .filter((p) => p.referenciaId === estadiaId && p.estado === "pagado")
    .reduce((suma, p) => suma + p.monto, 0);

  return { devolucion, aDevolver: devolucion.devuelve ? pagado : 0 };
}

export async function cancelarDiaDeJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  /** Dónde devolverle la plata, si alcanzó a pagar. Se guardan en su ficha. */
  datosBancarios?: DatosBancarios,
): Promise<ResultadoCancelacionJardin> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new ReservaRechazada("No existe ese día.", []);

  // Un perro que ya llegó no se cancela: eso es un retiro, no una
  // cancelación, y lo registra el equipo.
  if (estadia.estado !== "esperada") {
    throw new ReservaRechazada("Ese día ya no se puede cancelar.", [
      estadia.estado === "cancelada"
        ? "Ya estaba cancelado."
        : "El perro ya está en la casa: pídele al equipo que registre el retiro.",
    ]);
  }

  // El día de prueba tiene su propia regla —el cargo tardío— y deja al perro
  // en la fila. Mi cuenta no ofrece cancelarlo por acá; esto es por si
  // alguien lo intenta igual.
  if (estadia.origen === "dia_de_prueba") {
    throw new ReservaRechazada("Ese día se cancela en otra pantalla.", [
      "El día de prueba se cambia o se cancela desde su propia pantalla.",
    ]);
  }

  // El día, el cobro y el pack cambian juntos, en `repo.agenda`: en la nube
  // el dueño no puede tocar un cobro, y por separado la cancelación quedaba
  // a medias —el día cancelado y el cobro todavía pendiente—. El detalle de
  // qué pasa con lo pendiente y con lo pagado está en `agenda-local.ts` y en
  // su gemela en SQL.
  const { estadia: cancelada, devolucion, aDevolver, planDevuelto } =
    await repo.agenda.cancelarDiaDeJardin(estadiaId, ahora);

  // Se guardan en la ficha y no en el cobro: nadie se sabe su número de
  // cuenta de memoria, y pedírselo de nuevo la próxima vez es la manera de
  // que la devolución quede a medias.
  if (aDevolver > 0 && datosBancarios) {
    await repo.clientes.actualizar(estadia.clienteId, { datosBancarios });
  }

  // El aviso sale siempre, y el que MÁS importa es el de fuera de plazo: una
  // cancelación sobre la hora libera un cupo que ya no se alcanza a ofrecer,
  // y es justamente la que la dueña quiere ver.
  await avisarDeLaCancelacion(repo, cancelada, devolucion, aDevolver, ahora);

  return { estadia: cancelada, devolucion, planDevuelto, aDevolver };
}

/**
 * Deja constancia en la bandeja de Administración.
 *
 * Sin esto una cancelación es invisible: el día desaparece del calendario y
 * nadie se entera de quién avisó ni cuándo. Para la dueña eso importa —un
 * cupo que se libera con dos días es otra cosa que uno que se libera a las
 * nueve de la noche—, y el aviso es el único lugar donde queda escrito.
 *
 * Va por el mismo canal que las correcciones de ficha, que es donde ella ya
 * mira lo que hicieron los dueños. Una bandeja aparte sería una bandeja que
 * se deja de abrir.
 */
async function avisarDeLaCancelacion(
  repo: RepositorioPatoteca,
  estadia: EstadiaJardin,
  devolucion: DevolucionJardin,
  aDevolver: number,
  ahora: InstanteISO,
): Promise<void> {
  const [cliente, perro] = await Promise.all([
    repo.clientes.obtener(estadia.clienteId),
    repo.perros.obtener(estadia.perroId),
  ]);

  const cambios: CambioDeCampo[] = [
    { campo: "Día", despues: formatearFechaCorta(estadia.fecha) },
    { campo: "Aviso", despues: describirAviso(devolucion.horasDeAviso) },
    {
      campo: "Cobro",
      despues: !devolucion.devuelve
        ? "se mantiene, canceló fuera de plazo"
        : aDevolver > 0
          ? `hay que devolverle ${formatearCLP(aDevolver)}`
          : "anulado, no alcanzó a pagarlo",
    },
  ];

  await dejarAviso(repo, {
    clienteId: estadia.clienteId,
    perroId: estadia.perroId,
    titulo: `${cliente ? `${cliente.nombre} ${cliente.apellido}` : "Un dueño"} canceló el día de ${perro?.nombre ?? "su perro"}`,
    cambios,
    leida: false,
    creadaEn: ahora,
  });
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

  // Días, precio y vencimiento los pone `repo.agenda`, con las mismas reglas
  // que cotizó la pantalla. Y el cobro nace PENDIENTE: no hay pasarela, el
  // dueño transfiere y Administración lo marca pagado, igual que el abono del
  // hotel. La primera versión lo daba por pagado con "webpay", y en la nube la
  // base lo rechazaba después de crear el plan: quedaba un plan sin cobro.
  return repo.agenda.comprarPlan(
    args.perroId,
    { tipo: args.tipo, dias: args.dias },
    ahora,
  );
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
