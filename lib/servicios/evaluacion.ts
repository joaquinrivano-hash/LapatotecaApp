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
