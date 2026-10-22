/**
 * El veredicto del día de prueba.
 *
 * El día de prueba es una evaluación, y hasta ahora la app sabía agendarlo
 * y cobrarlo pero no cerrarlo. El estado se podía cambiar a mano desde la
 * ficha del perro, con dos problemas:
 *
 * - **No se encontraba.** Había que acordarse de qué perro vino, buscar a su
 *   dueño, desplegar el perro y entrar a editar. Nada le avisaba a nadie que
 *   quedaba un veredicto pendiente.
 * - **Pasaba por la validación de la ficha completa.** Aprobar es un juicio
 *   sobre cómo se portó el perro, no sobre si el formulario está completo;
 *   una ficha a la que le faltaba un dato dejaba el veredicto trancado.
 *
 * Por eso el veredicto es su propia acción, con su propia cola.
 */

import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { perdonarCobrosDelDiaDePrueba } from "@/lib/rules/dia-de-prueba";
import { fechaISO } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  Perro,
} from "@/lib/types";

export interface DiaDePruebaPorEvaluar {
  perro: Perro;
  /** Nulo si la ficha del dueño se borró: el perro igual se muestra. */
  cliente: Cliente | null;
  /** La jornada en que vino, para poder mirar a qué hora llegó y se fue. */
  estadia: EstadiaJardin | null;
  fecha: FechaISO;
  /** Hace cuántos días pasó. Lo que se añeja es lo que no se decide. */
  diasEsperando: number;
}

/**
 * Los días de prueba que ya pasaron y siguen sin veredicto.
 *
 * Solo entran los que **ya ocurrieron**: un día de prueba agendado para el
 * jueves no se evalúa el martes. Y se ordenan por el que lleva más tiempo
 * esperando, igual que la cola de cobros: lo que se añeja es lo que se
 * termina no decidiendo.
 */
export async function diasDePruebaPorEvaluar(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
): Promise<DiaDePruebaPorEvaluar[]> {
  const perros = await repo.perros.listar();
  const agendados = perros.filter((p) => p.diaDePrueba.estado === "agendado");
  if (agendados.length === 0) return [];

  const [clientes, estadias] = await Promise.all([
    repo.clientes.listar(),
    repo.estadiasJardin.enRango("0000-01-01", hoy),
  ]);

  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  const deprueba = estadias.filter((e) => e.origen === "dia_de_prueba");

  return agendados
    .map((perro) => {
      const estadia =
        deprueba.find((e) => e.perroId === perro.id) ?? null;
      // La fecha de la jornada manda sobre la de la ficha: si lo
      // reprogramaron, la estadía es la que quedó.
      const fecha = estadia?.fecha ?? perro.diaDePrueba.fecha;
      return { perro, cliente: porCliente.get(perro.clienteId) ?? null, estadia, fecha };
    })
    .filter((x): x is typeof x & { fecha: FechaISO } => Boolean(x.fecha))
    // Un día de prueba del jueves no se evalúa el martes.
    .filter((x) => x.fecha <= hoy)
    .map((x) => ({ ...x, diasEsperando: diasEntreISO(x.fecha, hoy) }))
    .sort((a, b) => b.diasEsperando - a.diasEsperando);
}

export interface DiaDePruebaQueViene {
  perro: Perro;
  cliente: Cliente | null;
  estadia: EstadiaJardin;
  fecha: FechaISO;
  /** Cuántos días faltan. 0 es hoy. */
  diasParaQueLlegue: number;
}

/**
 * Los días de prueba agendados que todavía no ocurren.
 *
 * Existe porque un día de prueba recién agendado no aparecía EN NINGÚN LADO
 * del backoffice: la cola de veredictos solo mira los que ya pasaron —un
 * jueves no se evalúa el martes— y el calendario de ocupación muestra un
 * número, no quién viene. Entonces el dueño agendaba, pagaba, y la casa se
 * enteraba el día que el perro aparecía en la puerta.
 *
 * Es la primera vez que ese dueño le pide algo a la casa, así que es
 * justamente el que no puede pasar desapercibido.
 *
 * Se mira por la estadía y no por `perro.diaDePrueba.fecha`: si lo
 * reprogramaron, la jornada es la que quedó. Un perro sin estadía agendada
 * no entra —no hay nada que venir a esperar— y ahí la cola de veredictos lo
 * recoge cuando corresponda.
 */
export async function diasDePruebaQueVienen(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
): Promise<DiaDePruebaQueViene[]> {
  const perros = await repo.perros.listar();
  const agendados = perros.filter((p) => p.diaDePrueba.estado === "agendado");
  if (agendados.length === 0) return [];

  const porPerro = new Map(agendados.map((p) => [p.id, p]));
  const [clientes, estadias] = await Promise.all([
    repo.clientes.listar(),
    // Sin tope por arriba: un dueño puede agendar para el mes que viene y
    // un rango de "los próximos siete días" lo dejaría invisible otra vez,
    // que es exactamente el problema que esto viene a arreglar.
    repo.estadiasJardin.enRango(hoy, "9999-12-31"),
  ]);

  const porCliente = new Map(clientes.map((c) => [c.id, c]));

  return estadias
    .filter(
      (e) =>
        e.origen === "dia_de_prueba" &&
        e.estado !== "cancelada" &&
        e.fecha >= hoy &&
        porPerro.has(e.perroId),
    )
    .map((estadia) => {
      const perro = porPerro.get(estadia.perroId)!;
      return {
        perro,
        cliente: porCliente.get(perro.clienteId) ?? null,
        estadia,
        fecha: estadia.fecha,
        diasParaQueLlegue: diasEntreISO(hoy, estadia.fecha),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Días de calendario entre dos fechas ya normalizadas a días de Santiago. */
function diasEntreISO(desde: FechaISO, hasta: FechaISO): number {
  const ms = Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type Veredicto = "aprobado" | "rechazado";

/**
 * Cierra el día de prueba.
 *
 * No valida la ficha a propósito: el veredicto dice cómo se portó el perro,
 * no si el formulario está completo. Si falta un dato, eso lo reclama la
 * admisión cuando quiera reservar — que es donde corresponde.
 *
 * La nota se guarda siempre que venga, también al aprobar: "le costó la
 * primera hora pero después jugó bien" es justo lo que el equipo quiere leer
 * el día que llegue.
 */
export async function resolverDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  veredicto: Veredicto,
  nota?: string,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Perro> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error("Ese perro ya no está.");

  if (perro.diaDePrueba.estado !== "agendado") {
    throw new Error(
      "Ese día de prueba no está esperando veredicto: está " +
        `${perro.diaDePrueba.estado}.`,
    );
  }

  return repo.perros.actualizar(perroId, {
    diaDePrueba: {
      ...perro.diaDePrueba,
      estado: veredicto,
      // Si nunca se anotó la fecha en la ficha, queda la de hoy: es cuando
      // se evaluó, y es mejor que no tener ninguna.
      fecha: perro.diaDePrueba.fecha ?? fechaISO(ahora),
      nota: nota?.trim() || perro.diaDePrueba.nota,
    },
  });
}

/* ── El que ya era cliente ─────────────────────────────────────────── */

/**
 * Hay clientes que vienen hace años y entran a la app por primera vez. El
 * alta les crea el perro con el día de prueba pendiente, como a cualquiera,
 * y pedirle una evaluación —y $10.000— a un perro que la casa conoce de
 * memoria sería tratarlo como a un desconocido.
 *
 * Por eso Administración lo puede aprobar sin que venga. Es una decisión de
 * la casa y no del dueño: el dueño no puede declararse cliente antiguo, y el
 * alta sigue naciendo pendiente para todos.
 */

export interface AprobacionSinDiaDePrueba {
  /** El día de prueba que alcanzó a agendar y que se cancela, si había uno. */
  estadia: EstadiaJardin | null;
  /** Lo que ya había pagado por ese día: vuelve entero, en "Por devolver". */
  aDevolver: number;
}

/**
 * Lo que va a pasar si se aprueba sin día de prueba. No cambia nada: es para
 * mostrarlo ANTES de confirmar, igual que las condiciones de una cancelación.
 */
export async function previaDeAprobarSinDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
): Promise<AprobacionSinDiaDePrueba> {
  const { perro, esperadas } = await loQueHayQueSaltarse(repo, perroId);
  if (esperadas.length === 0) return { estadia: null, aDevolver: 0 };

  const pagos = await repo.pagos.porCliente(perro.clienteId);
  const aDevolver = esperadas.reduce(
    (total, e) => total + perdonarCobrosDelDiaDePrueba(pagos, e.id).aDevolver,
    0,
  );
  return { estadia: esperadas[0], aDevolver };
}

/**
 * Aprueba el día de prueba de un perro que ya era cliente, sin que venga y
 * sin cobrarle.
 *
 * Si alcanzó a agendar su día de prueba, se cancela y sus cobros se perdonan
 * enteros (`perdonarCobrosDelDiaDePrueba`): lo pendiente se anula y lo
 * pagado queda en "Por devolver". Sin política de aviso, porque no canceló
 * él: la casa decidió que no le hacía falta.
 *
 * Se puede repetir sin hacer daño, y por eso el orden: primero los cobros,
 * después el día, al final el perro. Si algo falla a mitad de camino, volver
 * a tocar el botón termina lo que faltó — lo ya perdonado no se vuelve a
 * tocar y lo ya cancelado ya no aparece.
 */
export async function aprobarSinDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<AprobacionSinDiaDePrueba & { perro: Perro }> {
  const { perro, esperadas } = await loQueHayQueSaltarse(repo, perroId);

  let aDevolver = 0;
  if (esperadas.length > 0) {
    const pagos = await repo.pagos.porCliente(perro.clienteId);
    for (const estadia of esperadas) {
      const perdon = perdonarCobrosDelDiaDePrueba(pagos, estadia.id);
      for (const cobro of perdon.cobros) {
        await repo.pagos.actualizar(cobro.id, cobro.cambios);
      }
      await repo.estadiasJardin.actualizar(estadia.id, { estado: "cancelada" });
      aDevolver += perdon.aDevolver;
    }
  }

  const aprobado = await repo.perros.actualizar(perroId, {
    diaDePrueba: {
      estado: "aprobado",
      // Es cuando se decidió: no vino ningún día que anotar.
      fecha: fechaISO(ahora),
      nota: "Ya era cliente antes de la app: aprobado sin día de prueba.",
      yaEraCliente: true,
    },
  });

  return { perro: aprobado, estadia: esperadas[0] ?? null, aDevolver };
}

/**
 * Revisa que el perro se pueda aprobar sin venir, y junta los días de prueba
 * agendados que habría que cancelar.
 */
async function loQueHayQueSaltarse(
  repo: RepositorioPatoteca,
  perroId: ID,
): Promise<{ perro: Perro; esperadas: EstadiaJardin[] }> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error("Ese perro ya no está.");

  const { estado } = perro.diaDePrueba;
  if (estado === "aprobado") {
    throw new Error(`${perro.nombre} ya está aprobado.`);
  }
  if (estado === "rechazado") {
    // Saltarse un rechazo no es lo mismo que saltarse una evaluación: la
    // casa ya lo miró y dijo que no. Si fue un error, se corrige en la ficha.
    throw new Error(
      `${perro.nombre} no aprobó su día de prueba. Si fue un error, ` +
        "cámbialo desde su ficha.",
    );
  }

  const delDia = (await repo.estadiasJardin.porPerro(perroId)).filter(
    (e) => e.origen === "dia_de_prueba",
  );
  if (delDia.some((e) => e.estado === "presente")) {
    throw new Error(
      `${perro.nombre} está en la casa en su día de prueba: dale el ` +
        "veredicto cuando termine.",
    );
  }
  // Ya vino: lo que falta es el veredicto, no saltárselo.
  if (estado === "agendado" && delDia.some((e) => e.estado === "finalizada")) {
    throw new Error(
      `${perro.nombre} ya vino a su día de prueba: dale el veredicto en el ` +
        "tablero.",
    );
  }

  return { perro, esperadas: delDia.filter((e) => e.estado === "esperada") };
}

export interface InscritoSinDiaDePrueba {
  perro: Perro;
  cliente: Cliente | null;
  /** Hace cuántos días se inscribió. 0 es hoy. */
  diasInscrito: number;
}

/**
 * Los perros inscritos que todavía no agendan su día de prueba.
 *
 * Es donde aparece el cliente antiguo apenas crea su cuenta, para aprobarlo
 * de un toque sin tener que ir a buscarlo a Clientes. Y también el cliente
 * nuevo que se inscribió y no agendó, que es alguien a quien escribirle.
 *
 * Los más recientes primero: el que se acaba de inscribir es el que está
 * esperando una respuesta.
 */
export async function inscritosSinDiaDePrueba(
  repo: RepositorioPatoteca,
  hoy: FechaISO,
): Promise<InscritoSinDiaDePrueba[]> {
  const perros = await repo.perros.listar();
  const pendientes = perros.filter((p) => p.diaDePrueba.estado === "pendiente");
  if (pendientes.length === 0) return [];

  const clientes = await repo.clientes.listar();
  const porCliente = new Map(clientes.map((c) => [c.id, c]));

  return pendientes
    .map((perro) => ({
      perro,
      cliente: porCliente.get(perro.clienteId) ?? null,
      diasInscrito: diasEntreISO(fechaISO(perro.creadoEn), hoy),
    }))
    .sort((a, b) => b.perro.creadoEn.localeCompare(a.perro.creadoEn));
}

/* ── Lo que el dueño tiene que enterarse ───────────────────────────── */

/**
 * ¿Este perro pasó su día de prueba y todavía no ha reservado nada?
 *
 * Es el momento exacto en que hay algo que avisarle al dueño: ya puede
 * reservar y probablemente no lo sabe, porque lo único que cambió en su
 * pantalla fue que DESAPARECIÓ un aviso. La ausencia de una advertencia no
 * se nota.
 *
 * La condición ES el estado, así que no hace falta guardar si ya lo vio: el
 * aviso se apaga solo cuando reserva, que es justo cuando deja de hacer
 * falta. Una bandeja con leídos y no leídos sería más maquinaria para decir
 * lo mismo peor.
 *
 * Cuentan también las reservas canceladas: quien reservó y se arrepintió ya
 * descubrió que podía hacerlo.
 */
export function esperandoSuPrimeraReserva(
  perro: Perro,
  estadias: EstadiaJardin[],
  reservasHotel: { perroId: ID }[],
): boolean {
  if (perro.diaDePrueba.estado !== "aprobado") return false;

  const tieneHotel = reservasHotel.some((r) => r.perroId === perro.id);
  const tieneJardin = estadias.some(
    (e) => e.perroId === perro.id && e.origen !== "dia_de_prueba",
  );
  return !tieneHotel && !tieneJardin;
}

/** Los perros de ese cliente que acaban de quedar habilitados. */
export async function reciénAprobados(
  repo: RepositorioPatoteca,
  clienteId: ID,
): Promise<Perro[]> {
  const [perros, estadias, reservas] = await Promise.all([
    repo.perros.porCliente(clienteId),
    repo.estadiasJardin.porCliente(clienteId),
    repo.reservasHotel.porCliente(clienteId),
  ]);

  return perros.filter((p) => esperandoSuPrimeraReserva(p, estadias, reservas));
}
