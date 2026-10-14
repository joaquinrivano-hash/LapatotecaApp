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

/**
 * Marca la llegada.
 *
 * `horaReal` existe porque el cuidador a veces marca después: el perro llegó
 * a las 8:00 y él alcanzó a tocar el botón a las 8:40, con las manos
 * ocupadas. Por omisión las dos son el mismo instante, que es el caso normal
 * y el que mantiene el check-in de un toque.
 *
 * Volver a llamarla con otra `horaReal` corrige la llegada sin tocar cuándo
 * se marcó por primera vez: lo que se corrige es el dato, no el registro de
 * que alguien lo anotó tarde.
 */
export async function registrarLlegadaJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  horaReal: InstanteISO = ahora,
): Promise<EstadiaJardin> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);

  // La hora de marca se anota SOLO la primera vez. Si ya había una llegada,
  // esto es una corrección y no una marca nueva: ponerle "ahora" le
  // inventaría un atraso a quien solo arregló un dato. Y en una estadía
  // vieja, que nunca tuvo marca, se queda sin ella — "no se sabe" es la
  // respuesta correcta, no la hora en que alguien la editó.
  const esPrimeraMarca = !estadia?.inicioReal;

  return repo.estadiasJardin.actualizar(estadiaId, {
    inicioReal: horaReal,
    inicioMarcadoEn: esPrimeraMarca ? ahora : estadia?.inicioMarcadoEn,
    estado: "presente",
  });
}

export interface ResultadoSalida {
  estadia: EstadiaJardin;
  /** Recargo por retiro tarde, si lo hubo. */
  recargo: number;
  horasFueraDeHorario: number;
}

/**
 * Cierra la jornada con la hora REAL de retiro y vuelve a cotizar: de acá sale
 * el recargo fuera de horario, que no se puede saber antes.
 */
export async function registrarSalidaJardin(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  /** La hora a la que se fue de verdad, si no es el momento de marcarlo. */
  horaReal: InstanteISO = ahora,
): Promise<ResultadoSalida> {
  const estadia = await repo.estadiasJardin.obtener(estadiaId);
  if (!estadia) throw new Error(`No existe la estadía ${estadiaId}`);

  const inicio = estadia.inicioReal ?? estadia.inicioProgramado;
  // Todo lo que define plata mira la hora REAL: el tramo del día y el
  // recargo. El momento en que se apretó el botón no cobra nada.
  const cotizacion = calcularPrecioJardin({
    inicio,
    fin: horaReal,
    origen: estadia.origen,
  });

  const recargo = calcularRecargoFueraDeHorario(inicio, horaReal);

  const actualizada = await repo.estadiasJardin.actualizar(estadiaId, {
    finReal: horaReal,
    finMarcadoEn: estadia.finReal ? estadia.finMarcadoEn : ahora,
    estado: "finalizada",
    cotizacion,
  });

  // Acá NO se emite ningún cobro, y es el punto del cambio.
  //
  // La jornada ya se pagó por adelantado —el plan al comprarlo, el día
  // suelto al agendarlo—, así que cerrar no deja nada que cobrar por el día.
  // Lo único que puede aparecer es el recargo por retiro tarde, y ese no
  // nace solo: lo decide Administración, que es la que ve el total y la que
  // sabe si al dueño se le perdona el atraso de hoy.
  //
  // Lo que sí tiene que quedar guardado es la hora real de salida, porque de
  // ahí sale el cálculo cuando alguien lo decida. El cuidador registra lo que
  // pasó; cobrarlo es otra decisión y de otra persona.
  return {
    estadia: actualizada,
    recargo: recargo.monto,
    horasFueraDeHorario: recargo.horas,
  };
}

/* ── Hotel ─────────────────────────────────────────────────────────── */

export async function registrarLlegadaHotel(
  repo: RepositorioPatoteca,
  reservaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  horaReal: InstanteISO = ahora,
): Promise<ReservaHotel> {
  const reserva = await repo.reservasHotel.obtener(reservaId);

  return repo.reservasHotel.actualizar(reservaId, {
    inicioReal: horaReal,
    inicioMarcadoEn: reserva?.inicioReal ? reserva.inicioMarcadoEn : ahora,
    estado: "en_curso",
  });
}

export interface ResultadoSalidaHotel {
  reserva: ReservaHotel;
  /** Diferencia contra lo cotizado al reservar. Positiva = se pasó. */
  diferencia: number;
  /**
   * Lo que queda por cobrar contra el abono. Está CALCULADO, no emitido: el
   * cobro lo crea Administración desde el backoffice.
   */
  saldoPorCobrar: number;
}

export async function registrarSalidaHotel(
  repo: RepositorioPatoteca,
  reservaId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  /** La hora a la que se lo llevaron de verdad. */
  horaReal: InstanteISO = ahora,
): Promise<ResultadoSalidaHotel> {
  const reserva = await repo.reservasHotel.obtener(reservaId);
  if (!reserva) throw new Error(`No existe la reserva ${reservaId}`);

  const inicio = reserva.inicioReal ?? reserva.inicioProgramado;
  const cotizacionOriginal = reserva.cotizacion;

  const cotizacion = calcularPrecioHotel({
    inicio,
    fin: horaReal,
    paseosContratados: reserva.paseosContratados,
  });

  const actualizada = await repo.reservasHotel.actualizar(reservaId, {
    finReal: horaReal,
    finMarcadoEn: reserva.finReal ? reserva.finMarcadoEn : ahora,
    estado: "finalizada",
    cotizacion,
  });

  // El abono ya se pagó al reservar; lo que queda es el saldo contra el total
  // recalculado con la hora real de salida.
  const abono = cotizacionOriginal.abono ?? 0;
  const saldoPorCobrar = Math.max(0, cotizacion.total - abono);

  // Igual que en el jardín: el cuidador registra la salida y el saldo queda
  // calculado, pero el cobro lo emite Administración desde el backoffice. El
  // que recibe al perro en la puerta no emite documentos.
  return {
    reserva: actualizada,
    diferencia: cotizacion.total - cotizacionOriginal.total,
    saldoPorCobrar,
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

  // Tampoco se cobra acá, y por la misma razón que el cierre: el cuidador no
  // emite documentos.
  //
  // "Por adelantado" tiene sentido cuando alguien reserva con anticipación y
  // elige pagar antes. Un perro que aparece en la puerta no puede pagar por
  // adelantado un día que ya empezó, así que su jornada queda registrada y
  // Administración la emite después, junto con lo demás. Si se olvidara, no
  // se pierde: aparece en la cola de días por cobrar hasta que alguien la
  // emita.
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
