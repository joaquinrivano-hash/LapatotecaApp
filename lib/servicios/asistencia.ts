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
import { evaluarAdmision, type ResultadoAdmision } from "@/lib/rules/admision";
import { elegirPlanParaUsar } from "@/lib/rules/planes";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  verificarCapacidad,
  type OcupanteRango,
  type ResultadoCapacidad,
} from "@/lib/rules/capacidad";
import { calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import {
  calcularPrecioJardin,
  calcularRecargoFueraDeHorario,
} from "@/lib/rules/precio-jardin";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { fechaISO, instanteEn, minutosDelDia } from "@/lib/utils/fecha";
import type {
  Cliente,
  Cotizacion,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  OcupacionDia,
  Pago,
  Perro,
  PlanComprado,
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

/* ── Ingreso no planificado ────────────────────────────────────────── */

/**
 * El perro que llega sin reserva.
 *
 * Pasa: el dueño se complicó y aparece con el perro en la puerta. La decisión
 * de aceptarlo la toma una persona que está mirando al perro, no el sistema.
 * Lo que hace la app es mostrarle lo que necesita saber antes de decidir
 * —si queda cupo, si las vacunas están al día, si tiene plan con saldo— y
 * después registrar la realidad.
 *
 * Si el sistema bloqueara el registro, el perro igual estaría adentro y la
 * ocupación del día quedaría mal contada. Eso es peor que el problema que el
 * bloqueo intenta evitar.
 */

export interface OpcionesIngreso {
  perroId: ID;
  ahora?: InstanteISO;
  /** Hora estimada de retiro, en minutos del día. Por defecto, el cierre. */
  finEstimadoMinutos?: number;
}

export interface RevisionIngreso {
  perro: Perro;
  cliente: Cliente | null;
  /** Si ya tenía una estadía hoy: entonces no es un ingreso nuevo. */
  estadiaExistente: EstadiaJardin | null;
  admision: ResultadoAdmision;
  capacidad: ResultadoCapacidad;
  cuposDisponibles: number;
  /** Plan vigente con saldo, si lo tiene: la jornada sale gratis. */
  planDisponible: PlanComprado | null;
  cotizacionEstimada: Cotizacion;
  inicio: InstanteISO;
  fin: InstanteISO;
  /** true si no hay ningún reparo. Con reparos igual se puede forzar. */
  sinReparos: boolean;
}

/** Todo lo que el staff necesita ver antes de dejar entrar a un perro. */
export async function revisarIngreso(
  repo: RepositorioPatoteca,
  { perroId, ahora = new Date().toISOString(), finEstimadoMinutos }: OpcionesIngreso,
): Promise<RevisionIngreso> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error(`No existe el perro ${perroId}`);

  const fecha = fechaISO(ahora);
  const [cliente, estadiasDelDia, reservas, planes] = await Promise.all([
    repo.clientes.obtener(perro.clienteId),
    repo.estadiasJardin.porFecha(fecha),
    repo.reservasHotel.enRango(fecha, fecha),
    repo.planes.porPerro(perroId),
  ]);

  const fin = instanteEn(fecha, finEstimadoMinutos ?? NEGOCIO.jardin.horaCierre * 60);
  const planDisponible = elegirPlanParaUsar(planes, perroId, fecha);
  const origen: EstadiaJardin["origen"] = planDisponible ? "plan" : "dia_suelto";

  // El segundo perro del mismo dueño en el día tiene su descuento.
  const indicePerro = estadiasDelDia.filter(
    (e) => e.clienteId === perro.clienteId && e.estado !== "cancelada",
  ).length;

  const existentes: OcupanteRango[] = [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadiasDelDia),
  ];

  const capacidad = verificarCapacidad(
    [{ perroId, linea: "jardin", inicio: ahora, fin }],
    existentes,
  );

  const admision = evaluarAdmision(perro, { fecha });

  return {
    perro,
    cliente,
    estadiaExistente:
      estadiasDelDia.find(
        (e) => e.perroId === perroId && e.estado !== "cancelada",
      ) ?? null,
    admision,
    capacidad,
    cuposDisponibles: Math.max(
      0,
      NEGOCIO.capacidad.maximoSimultaneo -
        calcularOcupacionDia(fecha, existentes).pico,
    ),
    planDisponible,
    cotizacionEstimada: calcularPrecioJardin({
      inicio: ahora,
      fin,
      origen,
      indicePerro,
    }),
    inicio: ahora,
    fin,
    sinReparos: admision.admitido && capacidad.hayCupo,
  };
}

export interface ResultadoIngreso {
  estadia: EstadiaJardin;
  /** El plan al que se le descontó el día, si se usó uno. */
  planUsado: PlanComprado | null;
  revision: RevisionIngreso;
}

export class IngresoBloqueado extends Error {
  constructor(
    mensaje: string,
    readonly revision: RevisionIngreso,
  ) {
    super(mensaje);
    this.name = "IngresoBloqueado";
  }
}

/**
 * Registra al perro que llegó sin reserva, ya adentro y con la hora real.
 *
 * Con reparos (admisión o cupo) hay que pasar `forzar`: así el override queda
 * siendo una decisión explícita de quien está mirando al perro, y no un
 * descuido del sistema.
 */
export async function registrarIngreso(
  repo: RepositorioPatoteca,
  opciones: OpcionesIngreso & { forzar?: boolean },
): Promise<ResultadoIngreso> {
  const revision = await revisarIngreso(repo, opciones);

  if (revision.estadiaExistente) {
    throw new IngresoBloqueado(
      `${revision.perro.nombre} ya está agendado hoy.`,
      revision,
    );
  }

  if (!revision.sinReparos && !opciones.forzar) {
    throw new IngresoBloqueado(
      `${revision.perro.nombre} no cumple algún requisito o no hay cupo.`,
      revision,
    );
  }

  const { perro, planDisponible, inicio, fin, cotizacionEstimada } = revision;

  // El día del pack se descuenta al agendar, y acá agendar y llegar son el
  // mismo momento.
  let planUsado: PlanComprado | null = null;
  if (planDisponible) {
    planUsado = await repo.planes.actualizar(planDisponible.id, {
      diasUsados: planDisponible.diasUsados + 1,
    });
  }

  const estadia = await repo.estadiasJardin.crear({
    clienteId: perro.clienteId,
    perroId: perro.id,
    fecha: fechaISO(inicio),
    inicioProgramado: inicio,
    finProgramado: fin,
    inicioReal: inicio,
    origen: planDisponible ? "plan" : "dia_suelto",
    planId: planDisponible?.id,
    estado: "presente",
    cotizacion: cotizacionEstimada,
    creadaEn: inicio,
  });

  return { estadia, planUsado, revision };
}

/**
 * Opciones de hora de retiro para el ingreso no planificado.
 *
 * La media jornada se redondea a la media hora siguiente: nadie dice "lo paso
 * a buscar a las 17:08". Además el tramo corto define el precio, así que la
 * hora tiene que ser una que el dueño pueda cumplir.
 */
export function opcionesDeRetiro(
  ahora: InstanteISO = new Date().toISOString(),
): { etiqueta: string; minutos: number }[] {
  const cierre = NEGOCIO.jardin.horaCierre * 60;
  const ahoraMin = minutosDelDia(ahora);
  const media = Math.min(
    cierre,
    Math.ceil((ahoraMin + NEGOCIO.jardin.horasJornadaCorta * 60 - 60) / 30) * 30,
  );

  return [
    { etiqueta: "Media jornada", minutos: media },
    { etiqueta: "Jornada completa", minutos: cierre },
  ].filter(
    (opcion, i, todas) =>
      opcion.minutos > ahoraMin &&
      todas.findIndex((o) => o.minutos === opcion.minutos) === i,
  );
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
