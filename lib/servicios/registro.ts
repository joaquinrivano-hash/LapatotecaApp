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
import {
  pasaDelPeso,
  reparosDeAlta,
  revisarAltaDePerro,
} from "@/lib/rules/alta-perro";
import { vigenciaAntiparasitario, vigenciaVacuna } from "@/lib/rules/perro";
import {
  aDevolverAlCancelar,
  bloquesDeEntrada,
  cobroDelDiaDePrueba,
  MOTIVO_EN_PALABRAS,
  politicaDeCancelacion,
  rangoDelBloque,
  type BloqueDeEntrada,
  type PoliticaDeCancelacion,
} from "@/lib/rules/dia-de-prueba";
import type {
  DiaDePruebaAgendado,
  RepositorioPatoteca,
} from "@/lib/repo/tipos";
import {
  fechaISO,
  formatearFechaCorta,
  formatearHora,
  minutosDelDia,
  sumarDias,
} from "@/lib/utils/fecha";
import { formatearCLP } from "@/lib/utils/moneda";
import { aE164 } from "@/lib/utils/telefono";
import { describirAviso, dejarAviso } from "@/lib/servicios/avisos";
import { ocupantesEnRango } from "@/lib/servicios/reservas";
import type { ResultadoAdmision } from "@/lib/rules/admision";
import type {
  Alergias,
  Alimentacion,
  Antiparasitario,
  CambioDeCampo,
  Cliente,
  Cotizacion,
  EstadiaJardin,
  FechaISO,
  ID,
  Configuracion,
  DatosBancarios,
  InstanteISO,
  Medicamento,
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

/**
 * Revisa que la ficha se pueda recibir, sin crear nada.
 *
 * Está separada porque con cuentas reales hay que poder revisar ANTES de
 * crear la cuenta de acceso: si se hiciera al revés, un perro de 30 kg
 * dejaría una cuenta huérfana en Supabase Auth que la app no puede borrar, y
 * esa persona no podría volver a registrarse con su propio correo.
 *
 * Lanza `RegistroRechazado` con los motivos, o no hace nada.
 */
export async function validarAlta(
  repo: RepositorioPatoteca,
  datos: { cuenta: DatosDeCuenta; perro: DatosDePerro },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Configuracion> {
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

  return configuracion;
}

/** Crea el cliente y su primer perro, con el día de prueba pendiente. */
export async function crearCuenta(
  repo: RepositorioPatoteca,
  datos: { cuenta: DatosDeCuenta; perro: DatosDePerro },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<CuentaCreada> {
  const configuracion = await validarAlta(repo, datos, ahora);

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

  // El sobrepeso no impide crear la cuenta, pero sin que alguien lo habilite
  // el perro no puede agendar nada. Si Administración no se entera, el dueño
  // queda esperando una llamada que nadie sabe que tiene que hacer.
  if (pasaDelPeso(datos.perro)) {
    await repo.notificaciones.crear({
      clienteId: cliente.id,
      perroId: perro.id,
      titulo: `${cliente.nombre} ${cliente.apellido} creó la cuenta de ${perro.nombre}, que pasa del peso: hay que conversarlo y habilitarlo para agendar`,
      cambios: [
        {
          campo: "Peso",
          despues: `${perro.pesoKg} kg (máximo ${NEGOCIO.admision.pesoMaximoKg} kg)`,
        },
      ],
      leida: false,
      creadaEn: ahora,
    });
  }

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

export type { DiaDePruebaAgendado };

/**
 * Agenda el día de prueba y emite su cobro.
 *
 * El cobro queda **pendiente**: no hay pasarela, y en la realidad los
 * primeros meses se paga por transferencia. Administración lo marca pagado
 * cuando llega la plata.
 *
 * El día, el cobro y el perro "agendado" van juntos, en `repo.agenda`: en la
 * nube el dueño no puede marcar su día de prueba por su cuenta —si pudiera,
 * se lo daría por aprobado desde la consola—, y el cobro lo pone la base.
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

  return repo.agenda.agendarDiaDePrueba(
    perroId,
    { fecha, inicio: previa.inicio, fin: previa.fin },
    previa.cotizacion,
    ahora,
  );
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

// Las reglas viven en `lib/rules`; se siguen exportando desde acá porque es
// donde las busca la pantalla del día de prueba.
export { aDevolverAlCancelar, politicaDeCancelacion, type PoliticaDeCancelacion };

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

/** El día de prueba que todavía se puede cancelar o mover. */
async function diaQueSePuedeCambiar(
  repo: RepositorioPatoteca,
  perroId: ID,
  queSeHace: "cancelar" | "cambiar",
): Promise<EstadiaJardin> {
  const estadia = await diaDePruebaAgendado(repo, perroId);
  if (!estadia) {
    throw new RegistroRechazado(`No hay nada que ${queSeHace}.`, [
      "Este perrito no tiene un día de prueba agendado.",
    ]);
  }
  // La base lo rechazaría igual; acá se dice en palabras.
  if (estadia.estado !== "esperada") {
    throw new RegistroRechazado(`Ese día ya no se puede ${queSeHace}.`, [
      estadia.estado === "presente"
        ? "Ya está en la casa: el retiro lo registra el equipo."
        : "Ese día ya pasó.",
    ]);
  }
  return estadia;
}

/**
 * Lo que el dueño ya pagó por el día de prueba: el cobro DEL DÍA, si está
 * pagado. Los cargos por moverlo tarde no cuentan, porque cancelar no los
 * devuelve.
 *
 * No depende de la hora, así que la pantalla lo pide una vez y la política la
 * recalcula en cada render: lo que cambia con el reloj es cuánto vuelve, no
 * cuánto se pagó.
 */
export async function loPagadoPorElDiaDePrueba(
  repo: RepositorioPatoteca,
  estadiaId: ID,
): Promise<number> {
  const cobro = cobroDelDiaDePrueba(await repo.pagos.listar(), estadiaId);
  return cobro?.estado === "pagado" ? cobro.monto : 0;
}

/**
 * Cancela el día de prueba.
 *
 * Si no alcanzó a pagarlo, con 24 horas o más de aviso el cobro queda
 * anulado —anularlo ES la devolución— y no se borra: queda reembolsado en
 * cero, que es la constancia de que existió. Con menos, ese mismo cobro queda
 * pendiente por el cargo de cancelación tardía: no se devuelve la jornada,
 * pero tampoco se cobra entera.
 *
 * Si ya lo pagó, la plata está en la casa: a tiempo vuelve entera, y tarde
 * vuelve todo menos el cargo. Lo que vuelve queda reembolsado con su monto,
 * que es lo que aparece en "Por devolver", y los datos de la cuenta se
 * guardan en su ficha.
 *
 * Los cargos que hubo por moverlo encima de la hora no se tocan: cada aviso
 * tardío se cobra, y cancelar después a tiempo no borra el anterior.
 *
 * El día, el cobro y el perro cambian juntos, en `repo.agenda`. Antes iban
 * por separado y en la nube la cancelación quedaba a medias: el día
 * cancelado, el cobro en pie y el perro "agendado" para un día que ya no
 * existía.
 */
export async function cancelarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  ahora: InstanteISO = new Date().toISOString(),
  /** Dónde devolverle la plata, si alcanzó a pagar. Se guardan en su ficha. */
  datosBancarios?: DatosBancarios,
): Promise<{ politica: PoliticaDeCancelacion; aDevolver: number }> {
  const estadia = await diaQueSePuedeCambiar(repo, perroId, "cancelar");

  const {
    estadia: cancelada,
    politica,
    aDevolver,
  } = await repo.agenda.cancelarDiaDePrueba(estadia.id, ahora);

  // En la ficha y no en el cobro, igual que en el día de jardín: nadie se
  // sabe su número de cuenta de memoria.
  if (aDevolver > 0 && datosBancarios) {
    await repo.clientes.actualizar(estadia.clienteId, { datosBancarios });
  }

  await avisarDelDiaDePrueba(repo, cancelada, {
    queHizo: "canceló",
    cambios: [{ campo: "Día", despues: describirLlegada(cancelada) }],
    politica,
    cobro: describirCobroCancelado(politica, aDevolver),
    ahora,
  });

  return { politica, aDevolver };
}

/** En qué quedó el cobro, para la bandeja de Administración. */
function describirCobroCancelado(
  politica: PoliticaDeCancelacion,
  aDevolver: number,
): string {
  if (aDevolver > 0) {
    return politica.sinCosto
      ? `hay que devolverle ${formatearCLP(aDevolver)}, avisó a tiempo`
      : `hay que devolverle ${formatearCLP(aDevolver)}; se queda el cargo de ${formatearCLP(politica.costo)} por cancelar tarde`;
  }
  return politica.sinCosto
    ? "anulado, avisó a tiempo"
    : `queda en ${formatearCLP(politica.costo)} por cancelar tarde`;
}

/**
 * Mueve el día de prueba a otra hora.
 *
 * Con menos de 24 horas de aviso se suma el cargo por el cambio tardío, como
 * un cobro aparte que queda pendiente: el cupo de ese día ya no se alcanza a
 * llenar con otro perro.
 */
export async function reprogramarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  minutoDeEntrada: number,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<{ estadia: EstadiaJardin; politica: PoliticaDeCancelacion }> {
  const estadia = await diaQueSePuedeCambiar(repo, perroId, "cambiar");

  // Que el bloque esté libre se revisa acá, igual que al agendar: es una
  // pregunta de capacidad, no de plata, y la base no la vuelve a hacer.
  const dia = await disponibilidadDeUnDia(repo, perroId, fecha, ahora);
  const bloque = dia.bloques.find((b) => b.minutoDelDia === minutoDeEntrada);
  if (!bloque?.disponible) {
    throw new RegistroRechazado("No pudimos tomar esa hora.", [
      bloque
        ? `${MOTIVO_EN_PALABRAS[bloque.motivo!]}, elige otra hora.`
        : "Esa hora no es una hora de llegada válida.",
    ]);
  }

  const { inicio, fin } = rangoDelBloque(fecha, minutoDeEntrada);
  const { estadia: movida, politica } = await repo.agenda.reprogramarDiaDePrueba(
    estadia.id,
    { fecha, inicio, fin },
    ahora,
  );

  await avisarDelDiaDePrueba(repo, movida, {
    queHizo: "cambió",
    cambios: [
      {
        campo: "Día",
        antes: describirLlegada(estadia),
        despues: describirLlegada(movida),
      },
    ],
    politica,
    cobro: politica.sinCosto
      ? "sin costo, avisó a tiempo"
      : `se suma un cargo de ${formatearCLP(politica.costo)} por cambiarlo tarde`,
    ahora,
  });

  return { estadia: movida, politica };
}

/** "15-06-2026 a las 09:00" */
function describirLlegada(estadia: EstadiaJardin): string {
  return `${formatearFechaCorta(estadia.fecha)} a las ${formatearHora(estadia.inicioProgramado)}`;
}

/**
 * Le cuenta a Administración que el dueño canceló o movió el día de prueba.
 *
 * El día y la anticipación son hechos, no cambios, así que van sin `antes`.
 * El día de un cambio de fecha sí lleva antes y después: eso sí cambió.
 */
async function avisarDelDiaDePrueba(
  repo: RepositorioPatoteca,
  estadia: EstadiaJardin,
  aviso: {
    queHizo: "canceló" | "cambió";
    cambios: CambioDeCampo[];
    politica: PoliticaDeCancelacion;
    cobro: string;
    ahora: InstanteISO;
  },
): Promise<void> {
  const [cliente, perro] = await Promise.all([
    repo.clientes.obtener(estadia.clienteId),
    repo.perros.obtener(estadia.perroId),
  ]);

  await dejarAviso(repo, {
    clienteId: estadia.clienteId,
    perroId: estadia.perroId,
    titulo: `${cliente ? `${cliente.nombre} ${cliente.apellido}` : "Un dueño"} ${aviso.queHizo} el día de prueba de ${perro?.nombre ?? "su perro"}`,
    cambios: [
      ...aviso.cambios,
      { campo: "Aviso", despues: describirAviso(aviso.politica.horasDeAviso) },
      { campo: "Cobro", despues: aviso.cobro },
    ],
    leida: false,
    creadaEn: aviso.ahora,
  });
}
