/**
 * Alta de un cliente nuevo y su primer día de prueba.
 *
 * Es la puerta de entrada del portal: alguien que nunca ha venido no tiene
 * nada que reservar todavía, porque la casa exige el día de prueba antes de
 * la primera estadía. Por eso "agendar" para un visitante nuevo significa
 * crear la cuenta y tomar ese día, no elegir hotel o jardín.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { evaluarAdmision } from "@/lib/rules/admision";
import { reparosDeAlta, revisarAltaDePerro } from "@/lib/rules/alta-perro";
import { vigenciaAntiparasitario, vigenciaVacuna } from "@/lib/rules/perro";
import {
  bloquesDeEntrada,
  MOTIVO_EN_PALABRAS,
  rangoDelBloque,
  type BloqueDeEntrada,
} from "@/lib/rules/dia-de-prueba";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  fechaISO,
  horasEntre,
  minutosDelDia,
  sumarDias,
} from "@/lib/utils/fecha";
import { aE164 } from "@/lib/utils/telefono";
import { ocupantesEnRango } from "@/lib/servicios/reservas";
import type { ResultadoAdmision } from "@/lib/rules/admision";
import type {
  Alergias,
  Alimentacion,
  Antiparasitario,
  Cliente,
  Cotizacion,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  Medicamento,
  Pago,
  Perro,
  Sexo,
  TipoVacuna,
} from "@/lib/types";

export class RegistroRechazado extends Error {
  constructor(
    mensaje: string,
    readonly motivos: string[],
  ) {
    super(mensaje);
    this.name = "RegistroRechazado";
  }
}

export interface DatosDeCuenta {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  comuna: string;
  direccion?: string;
}

export interface DatosDePerro {
  nombre: string;
  raza: string;
  pesoKg: number;
  sexo: Sexo;
  /**
   * `undefined` = el dueño todavía no eligió.
   *
   * No lleva valor por defecto a propósito: predeterminarlo en "sí" hace que
   * un macho sin castrar pase sin que nadie lo note, y en "no" que la mitad
   * de las fichas nazcan mal.
   */
  esterilizado?: boolean;
  fechaNacimiento?: FechaISO;
  /**
   * Cuándo vence cada vacuna obligatoria, tal como sale del carnet.
   *
   * Se piden al crear la cuenta porque el día de prueba ya es una jornada en
   * la casa con otros perros: sin vacunas al día no se puede agendar.
   */
  /**
   * Cuándo se puso cada vacuna. El vencimiento lo calcula `crearCuenta` con la
   * duración que Administración tenga configurada: el dueño copia del carnet,
   * no hace la cuenta.
   */
  vacunas?: { tipo: TipoVacuna; fechaAplicacion: FechaISO }[];
  /** De acá sale `desparasitadoHasta`: la vigencia se calcula, no se pide. */
  antiparasitario?: Antiparasitario;
  /**
   * La vigencia dicha directamente, para quien solo tiene ese dato a mano.
   * Si viene `antiparasitario`, manda ese: la cuenta hecha le gana al dato
   * copiado.
   */
  desparasitadoHasta?: FechaISO;
  /** La foto la sube el dueño al crear la cuenta; el admin la corrige después. */
  fotoUrl?: string;
  carnetVacunasUrls?: string[];
  alimentacion?: Alimentacion;
  medicamentos?: Medicamento[];
  alergias?: Alergias;
  indicaciones?: string;
  notas?: string;
}

export interface CuentaCreada {
  cliente: Cliente;
  perro: Perro;
}

/** Crea el cliente y su primer perro, con el día de prueba pendiente. */
export async function crearCuenta(
  repo: RepositorioPatoteca,
  datos: { cuenta: DatosDeCuenta; perro: DatosDePerro },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<CuentaCreada> {
  // La ficha se revisa acá y no solo en el formulario: la pantalla puede
  // adelantar el aviso, pero la que no deja pasar una ficha incompleta es
  // esta función, que es por donde entra todo el mundo.
  const configuracion = await repo.configuracion.obtener();
  const hoy = fechaISO(ahora);

  const bloqueos = reparosDeAlta(datos.perro, configuracion, hoy).filter(
    (r) => r.bloquea,
  );
  if (bloqueos.length > 0) {
    throw new RegistroRechazado(
      "Todavía no podemos recibirlo.",
      bloqueos.map((r) => r.mensaje),
    );
  }

  const faltan = revisarAltaDePerro(datos.perro, configuracion, hoy);
  if (faltan.length > 0) {
    throw new RegistroRechazado(
      "Falta completar la ficha.",
      faltan.map((f) => f.mensaje),
    );
  }

  const cliente = await repo.clientes.crear({
    nombre: datos.cuenta.nombre.trim(),
    apellido: datos.cuenta.apellido.trim(),
    email: datos.cuenta.email.trim(),
    // Se guarda en E.164 desde el principio: es lo que exige WhatsApp y así
    // no hay que normalizar en cada envío.
    telefono: aE164(datos.cuenta.telefono) ?? datos.cuenta.telefono.trim(),
    comuna: datos.cuenta.comuna.trim(),
    direccion: datos.cuenta.direccion?.trim() || undefined,
    creadoEn: ahora,
  });

  const perro = await repo.perros.crear({
    clienteId: cliente.id,
    nombre: datos.perro.nombre.trim(),
    raza: datos.perro.raza.trim(),
    pesoKg: datos.perro.pesoKg,
    sexo: datos.perro.sexo,
    // `revisarAltaDePerro` ya se aseguró de que el dueño eligiera.
    esterilizado: datos.perro.esterilizado === true,
    fechaNacimiento: datos.perro.fechaNacimiento,
    vacunas: (datos.perro.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaAplicacion,
      fechaVencimiento: vigenciaVacuna(
        v.fechaAplicacion,
        configuracion.duracionVacunasMeses[v.tipo],
      ),
    })),
    antiparasitario: datos.perro.antiparasitario,
    desparasitadoHasta: datos.perro.antiparasitario
      ? vigenciaAntiparasitario(datos.perro.antiparasitario)
      : datos.perro.desparasitadoHasta,
    fotoUrl: datos.perro.fotoUrl,
    carnetVacunasUrls: datos.perro.carnetVacunasUrls,
    diaDePrueba: { estado: "pendiente" },
    alimentacion: datos.perro.alimentacion,
    medicamentos: datos.perro.medicamentos?.length
      ? datos.perro.medicamentos
      : undefined,
    alergias: datos.perro.alergias,
    indicaciones: datos.perro.indicaciones?.trim() || undefined,
    notas: datos.perro.notas?.trim() || undefined,
    creadoEn: ahora,
  });

  return { cliente, perro };
}

/* ── Día de prueba ─────────────────────────────────────────────────── */

/**
 * El día de prueba es **media jornada** de un día de jardín normal, con hora
 * de llegada a elección en bloques de 30 minutos.
 *
 * A diferencia del día suelto, se **cobra al agendar**: es la evaluación de un
 * perro que todavía no es cliente, y el cupo queda tomado desde ese momento.
 * El cobro nace pendiente con instrucciones de transferencia; Administración
 * lo marca pagado desde la pantalla de pagos.
 */

export interface DisponibilidadDelDia {
  fecha: FechaISO;
  bloques: BloqueDeEntrada[];
  libres: number;
}

/** Los días de prueba ya agendados ese día, por minuto de llegada. */
async function minutosTomados(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
  exceptoPerroId?: ID,
): Promise<number[]> {
  const estadias = await repo.estadiasJardin.porFecha(fecha);

  return estadias
    .filter(
      (e) =>
        e.origen === "dia_de_prueba" &&
        e.estado !== "cancelada" &&
        e.perroId !== exceptoPerroId,
    )
    .map((e) => minutosDelDia(e.inicioProgramado));
}

export async function disponibilidadDeUnDia(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<DisponibilidadDelDia> {
  const [ocupantes, tomados] = await Promise.all([
    ocupantesEnRango(repo, fecha, fecha),
    minutosTomados(repo, fecha, perroId),
  ]);

  const bloques = bloquesDeEntrada({
    fecha,
    // El propio perro no cuenta contra sí mismo al reprogramar.
    ocupantes: ocupantes.filter((o) => o.perroId !== perroId),
    diasDePruebaTomados: tomados,
    perroId,
    minutoActual: fechaISO(ahora) === fecha ? minutosDelDia(ahora) : undefined,
  });

  return { fecha, bloques, libres: bloques.filter((b) => b.disponible).length };
}

/** La tira del calendario: cuántas horas quedan libres cada día. */
export async function disponibilidadDeVariosDias(
  repo: RepositorioPatoteca,
  perroId: ID,
  desde: FechaISO,
  dias: number,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<DisponibilidadDelDia[]> {
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
  return Promise.all(
    fechas.map((fecha) => disponibilidadDeUnDia(repo, perroId, fecha, ahora)),
  );
}

export interface CotizacionDiaDePrueba {
  cotizacion: Cotizacion;
  fecha: FechaISO;
  minutoDeEntrada: number;
  inicio: InstanteISO;
  fin: InstanteISO;
  admision: ResultadoAdmision;
  bloque?: BloqueDeEntrada;
  /** Ya lo tiene agendado o aprobado: no hay nada que tomar. */
  yaLoTiene: boolean;
  sePuede: boolean;
}

function cotizacionDelDiaDePrueba(): Cotizacion {
  return {
    lineas: [
      {
        concepto: "Día de prueba",
        detalle: `Media jornada de jardín (${NEGOCIO.diaDePrueba.horasDeEstadia} horas) para conocernos`,
        monto: PRECIOS.diaDePrueba,
      },
    ],
    subtotal: PRECIOS.diaDePrueba,
    descuentos: [],
    total: PRECIOS.diaDePrueba,
  };
}

export async function cotizarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  minutoDeEntrada: number,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<CotizacionDiaDePrueba> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error(`No existe el perro ${perroId}`);

  const { inicio, fin } = rangoDelBloque(fecha, minutoDeEntrada);
  const dia = await disponibilidadDeUnDia(repo, perroId, fecha, ahora);
  const bloque = dia.bloques.find((b) => b.minutoDelDia === minutoDeEntrada);

  // El día de prueba es la excepción a "necesita día de prueba": se evalúa
  // con esa bandera para que no se pida a sí mismo.
  const admision = evaluarAdmision(perro, { fecha, esDiaDePrueba: true });

  const yaLoTiene =
    perro.diaDePrueba.estado === "agendado" ||
    perro.diaDePrueba.estado === "aprobado";

  return {
    cotizacion: cotizacionDelDiaDePrueba(),
    fecha,
    minutoDeEntrada,
    inicio,
    fin,
    admision,
    bloque,
    yaLoTiene,
    sePuede: admision.admitido && Boolean(bloque?.disponible) && !yaLoTiene,
  };
}

export interface DiaDePruebaAgendado {
  estadia: EstadiaJardin;
  perro: Perro;
  pago: Pago;
}

/**
 * Agenda el día de prueba y emite su cobro.
 *
 * El cobro queda **pendiente**: el prototipo no tiene pasarela, y en la
 * realidad los primeros meses se paga por transferencia. Administración lo
 * marca pagado cuando llega la plata.
 */
export async function agendarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  minutoDeEntrada: number,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<DiaDePruebaAgendado> {
  const previa = await cotizarDiaDePrueba(
    repo,
    perroId,
    fecha,
    minutoDeEntrada,
    ahora,
  );

  if (!previa.sePuede) {
    throw new RegistroRechazado(
      "No pudimos tomar esa hora.",
      motivosDelRechazo(previa),
    );
  }

  const perroActual = (await repo.perros.obtener(perroId))!;

  const estadia = await repo.estadiasJardin.crear({
    clienteId: perroActual.clienteId,
    perroId,
    fecha,
    inicioProgramado: previa.inicio,
    finProgramado: previa.fin,
    origen: "dia_de_prueba",
    estado: "esperada",
    cotizacion: previa.cotizacion,
    creadaEn: ahora,
  });

  const pago = await repo.pagos.crear({
    clienteId: perroActual.clienteId,
    concepto: "dia_de_prueba",
    referenciaId: estadia.id,
    monto: previa.cotizacion.total,
    estado: "pendiente",
    emitidoEn: ahora,
    venceEn: fecha,
  });

  const perro = await repo.perros.actualizar(perroId, {
    diaDePrueba: { estado: "agendado", fecha },
  });

  return { estadia, perro, pago };
}

function motivosDelRechazo(previa: CotizacionDiaDePrueba): string[] {
  if (previa.yaLoTiene) {
    return ["Este perrito ya tiene su día de prueba tomado."];
  }

  const motivos = previa.admision.bloqueos.map((p) => p.mensaje);
  if (previa.bloque && !previa.bloque.disponible) {
    motivos.push(`${MOTIVO_EN_PALABRAS[previa.bloque.motivo!]}, elige otra hora.`);
  } else if (!previa.bloque) {
    motivos.push("Esa hora no es una hora de llegada válida.");
  }
  return motivos;
}

/* ── Cambiar o cancelar ────────────────────────────────────────────── */

export interface PoliticaDeCancelacion {
  /** Horas que faltan para la llegada. Negativo si ya pasó. */
  horasDeAviso: number;
  /** Con aviso suficiente no se cobra nada. */
  sinCosto: boolean;
  /** Lo que cuesta cancelar o cambiar ahora. */
  costo: number;
}

export function politicaDeCancelacion(
  inicioProgramado: InstanteISO,
  ahora: InstanteISO = new Date().toISOString(),
): PoliticaDeCancelacion {
  const horasDeAviso = horasEntre(ahora, inicioProgramado);
  const sinCosto = horasDeAviso >= NEGOCIO.diaDePrueba.horasParaCancelarSinCosto;

  return {
    horasDeAviso,
    sinCosto,
    costo: sinCosto ? 0 : PRECIOS.cancelacionTardiaDiaDePrueba,
  };
}

/** El día de prueba vigente de un perro, si lo tiene. */
export async function diaDePruebaAgendado(
  repo: RepositorioPatoteca,
  perroId: ID,
): Promise<EstadiaJardin | null> {
  const estadias = await repo.estadiasJardin.porPerro(perroId);

  return (
    estadias.find(
      (e) =>
        e.origen === "dia_de_prueba" &&
        e.estado !== "cancelada" &&
        e.estado !== "finalizada",
    ) ?? null
  );
}

/**
 * Cancela el día de prueba.
 *
 * Con 24 horas o más de aviso se anula el cobro —como el cobro está pendiente,
 * anularlo ES la devolución—. Con menos, ese cobro se reemplaza por el de
 * cancelación tardía: no se devuelve la jornada, pero tampoco se cobra entera.
 */
export async function cancelarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ politica: PoliticaDeCancelacion }> {
  const estadia = await diaDePruebaAgendado(repo, perroId);
  if (!estadia) {
    throw new RegistroRechazado("No hay nada que cancelar.", [
      "Este perrito no tiene un día de prueba agendado.",
    ]);
  }

  const politica = politicaDeCancelacion(estadia.inicioProgramado, ahora);

  await repo.estadiasJardin.actualizar(estadia.id, { estado: "cancelada" });
  await ajustarCobro(repo, estadia.id, politica.costo, ahora);
  await repo.perros.actualizar(perroId, { diaDePrueba: { estado: "pendiente" } });

  return { politica };
}

/**
 * Mueve el día de prueba a otra hora.
 *
 * Con menos de 24 horas de aviso se suma el cargo por el cambio tardío: el
 * cupo de ese día ya no se alcanza a llenar con otro perro.
 */
export async function reprogramarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  minutoDeEntrada: number,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ estadia: EstadiaJardin; politica: PoliticaDeCancelacion }> {
  const estadia = await diaDePruebaAgendado(repo, perroId);
  if (!estadia) {
    throw new RegistroRechazado("No hay nada que cambiar.", [
      "Este perrito no tiene un día de prueba agendado.",
    ]);
  }

  const dia = await disponibilidadDeUnDia(repo, perroId, fecha, ahora);
  const bloque = dia.bloques.find((b) => b.minutoDelDia === minutoDeEntrada);
  if (!bloque?.disponible) {
    throw new RegistroRechazado("No pudimos tomar esa hora.", [
      bloque
        ? `${MOTIVO_EN_PALABRAS[bloque.motivo!]}, elige otra hora.`
        : "Esa hora no es una hora de llegada válida.",
    ]);
  }

  const politica = politicaDeCancelacion(estadia.inicioProgramado, ahora);
  const { inicio, fin } = rangoDelBloque(fecha, minutoDeEntrada);

  const movida = await repo.estadiasJardin.actualizar(estadia.id, {
    fecha,
    inicioProgramado: inicio,
    finProgramado: fin,
  });

  if (!politica.sinCosto) {
    await repo.pagos.crear({
      clienteId: estadia.clienteId,
      concepto: "dia_de_prueba",
      referenciaId: estadia.id,
      monto: politica.costo,
      estado: "pendiente",
      emitidoEn: ahora,
      venceEn: fecha,
    });
  }

  await repo.perros.actualizar(perroId, {
    diaDePrueba: { estado: "agendado", fecha },
  });

  return { estadia: movida, politica };
}

/**
 * Deja el cobro del día en el monto que corresponde tras cancelar.
 *
 * En cero se marca reembolsado en vez de borrarse: un cobro que desaparece no
 * deja rastro de que existió, y la cobranza del mes tiene que poder explicarse.
 */
async function ajustarCobro(
  repo: RepositorioPatoteca,
  estadiaId: ID,
  monto: number,
  ahora: InstanteISO,
): Promise<void> {
  const pagos = await repo.pagos.listar();
  const delDia = pagos.filter(
    (p) => p.referenciaId === estadiaId && p.estado === "pendiente",
  );

  for (const [i, pago] of delDia.entries()) {
    // Si hubo cargos por cambios, el monto nuevo se queda en el primero y el
    // resto se anula: lo que se cobra es una cancelación, no varias.
    await repo.pagos.actualizar(pago.id, {
      monto: i === 0 ? monto : 0,
      estado: i === 0 && monto > 0 ? "pendiente" : "reembolsado",
      pagadoEn: undefined,
      venceEn: i === 0 && monto > 0 ? fechaISO(ahora) : undefined,
    });
  }
}
