/**
 * Las tareas del día: las reglas de `lib/rules/tareas.ts` con el
 * repositorio.
 *
 * El turno marca; Administración arma la rutina y deja encargos. Las dos
 * caras leen lo mismo con `cargarTareasDelDia`.
 */

import { ErrorRepositorio } from "@/lib/repo/error";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  RONDAS,
  armarResumenDelTurno,
  avanceDelDia,
  claveDeMedicamento,
  esAcumulable,
  pasosDeLaRonda,
  rondasEmpezadas,
  rutinaQueFalta,
  tareasDelDia,
  ultimoPorClave,
  CLAVE_EXTRA,
  CLAVE_NOVEDAD,
  type Avance,
  type PasoDelDia,
  type TareaDelDia,
} from "@/lib/rules/tareas";
import type {
  EstadoTarea,
  FechaISO,
  ID,
  InstanteISO,
  Medicamento,
  Perro,
  RegistroDeTarea,
  RondaDelDia,
  Tarea,
} from "@/lib/types";
import { hoyISO } from "@/lib/utils/fecha";

export interface PerroConRemedios {
  perro: Perro;
  medicamentos: Medicamento[];
  /** Las veces que se le dio hoy, en orden. */
  dados: RegistroDeTarea[];
}

export interface DiaDeTareas {
  fecha: FechaISO;
  tareas: TareaDelDia[];
  /** Las tres rondas con sus pasos. */
  rondas: { ronda: RondaDelDia; nombre: string; pasos: PasoDelDia[] }[];
  /** Los perros en la casa ese día que toman algo. */
  remedios: PerroConRemedios[];
  extras: RegistroDeTarea[];
  novedades: RegistroDeTarea[];
  /** Los perros que estuvieron ese día, para decir quién no comió. */
  perros: Perro[];
  /** Todos los registros del día. */
  registros: RegistroDeTarea[];
  /** Hay rutina armada: si no, la pantalla lo dice en vez de mostrar nada. */
  hayRutina: boolean;
  avance: Avance;
}

/** Los perros que están o estuvieron en la casa ese día. */
async function perrosDelDia(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
): Promise<Perro[]> {
  const [estadias, reservas, perros] = await Promise.all([
    repo.estadiasJardin.porFecha(fecha),
    repo.reservasHotel.enRango(fecha, fecha),
    repo.perros.listar(),
  ]);
  const ids = new Set([
    ...estadias
      .filter((e) => e.estado === "presente" || e.estado === "finalizada")
      .map((e) => e.perroId),
    ...reservas
      .filter((r) => r.estado === "en_curso" || r.estado === "finalizada")
      .map((r) => r.perroId),
  ]);
  return perros
    .filter((p) => ids.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Todo lo del día, en una pasada.
 *
 * Los registros se piden por dos lados: los del día, y los de los encargos
 * todavía abiertos en cualquier fecha, que es lo que dice si un encargo del
 * lunes ya se hizo el martes.
 */
export async function cargarTareasDelDia(
  repo: RepositorioPatoteca,
  fecha: FechaISO,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<DiaDeTareas> {
  const [tareas, registrosDelDia, perros] = await Promise.all([
    repo.tareas.listar(),
    repo.registrosDeTareas.enRango(fecha, fecha),
    perrosDelDia(repo, fecha),
  ]);

  const encargos = tareas
    .filter((t) => t.tipo === "encargo" && t.activa && t.fecha && t.fecha < fecha)
    .map((t) => t.id);
  const deEncargos = await repo.registrosDeTareas.porClaves(encargos);

  const registros = [
    ...registrosDelDia,
    ...deEncargos.filter((r) => r.fecha !== fecha),
  ];

  const delDia = tareasDelDia(tareas, registros, fecha);
  const rondas = RONDAS.map((r) => ({
    ronda: r.clave as RondaDelDia,
    nombre: r.nombre as string,
    pasos: pasosDeLaRonda(r.clave, registrosDelDia, fecha),
  }));

  const porHora = (a: RegistroDeTarea, b: RegistroDeTarea) =>
    a.marcadoEn.localeCompare(b.marcadoEn);

  const remedios = perros
    .filter((p) => (p.medicamentos ?? []).length > 0)
    .map((perro) => ({
      perro,
      medicamentos: perro.medicamentos ?? [],
      dados: registrosDelDia
        .filter((r) => r.clave === claveDeMedicamento(perro.id))
        .sort(porHora),
    }));

  // Un día que no es hoy está entero: no hay rondas "por empezar".
  const empezadas =
    fecha < hoyISO(ahora)
      ? RONDAS.map((r) => r.clave as RondaDelDia)
      : fecha > hoyISO(ahora)
        ? []
        : rondasEmpezadas(ahora);

  return {
    fecha,
    tareas: delDia,
    rondas,
    remedios,
    extras: registrosDelDia.filter((r) => r.clave === CLAVE_EXTRA).sort(porHora),
    novedades: registrosDelDia
      .filter((r) => r.clave === CLAVE_NOVEDAD)
      .sort(porHora),
    perros,
    registros: registrosDelDia,
    hayRutina: tareas.some((t) => t.tipo === "rutina" && t.activa),
    avance: avanceDelDia(
      delDia,
      rondas.flatMap((r) => r.pasos),
      empezadas,
    ),
  };
}

/** El reporte del turno, listo para pegar en el grupo. */
export function resumenDelDia(
  dia: DiaDeTareas,
  autor: string,
  ahora: InstanteISO = new Date().toISOString(),
): string {
  return armarResumenDelTurno({
    fecha: dia.fecha,
    ahora,
    autor,
    pasos: dia.rondas.flatMap((r) => r.pasos),
    tareas: dia.tareas,
    registros: dia.registros,
    perros: dia.perros,
  });
}

/* ── Lo que marca el turno ─────────────────────────────────────────── */

export interface Firma {
  autorStaff: string;
  autorId?: ID;
}

export interface Marca {
  fecha: FechaISO;
  clave: string;
  estado: EstadoTarea;
  nota?: string;
  perroIds?: ID[];
}

/**
 * Marca una tarea o un paso de la ronda.
 *
 * Hay un solo registro por clave y día, y volver a marcar lo corrige en el
 * lugar: tocar "hecha" dos veces no deja dos filas, y quien desmarca no deja
 * un "pendiente" encima de un "hecha" que confunda al que lee.
 *
 * Desmarcar guarda "pendiente" en vez de borrar. En la nube cada uno borra
 * solo lo suyo, así que si José marcó las aguas y Flo las desmarca, un
 * borrado no haría nada sin avisar y las aguas seguirían "hechas".
 */
export async function marcarTarea(
  repo: RepositorioPatoteca,
  marca: Marca,
  firma: Firma,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<RegistroDeTarea | null> {
  if (esAcumulable(marca.clave)) {
    throw new ErrorRepositorio(
      "Las novedades, los extras y los remedios se anotan, no se marcan.",
    );
  }
  if (marca.estado === "no_se_hizo" && !marca.nota?.trim()) {
    throw new ErrorRepositorio(
      "Cuéntale al turno que viene por qué no se pudo: si no, lo va a volver a intentar igual.",
    );
  }

  const delDia = await repo.registrosDeTareas.enRango(marca.fecha, marca.fecha);
  const vigente = ultimoPorClave(
    delDia.filter((r) => r.clave === marca.clave),
  ).get(marca.clave);

  if (marca.estado === "pendiente" && !vigente) return null;

  const datos = {
    fecha: marca.fecha,
    clave: marca.clave,
    estado: marca.estado,
    nota: marca.nota?.trim() || undefined,
    perroIds: marca.perroIds?.length ? marca.perroIds : undefined,
    autorStaff: firma.autorStaff,
    autorId: firma.autorId,
    marcadoEn: ahora,
  };

  return vigente
    ? repo.registrosDeTareas.actualizar(vigente.id, datos)
    : repo.registrosDeTareas.crear(datos);
}

/**
 * Los que no comieron, sin tocar la hora en que se marcó la comida.
 *
 * La hora dice cuándo se sirvió; anotar después que Mara no quiso es
 * completar el dato, no volver a servir.
 */
export async function anotarQuienNoComio(
  repo: RepositorioPatoteca,
  registroId: ID,
  perroIds: ID[],
): Promise<RegistroDeTarea> {
  return repo.registrosDeTareas.actualizar(registroId, {
    perroIds: perroIds.length ? perroIds : undefined,
  });
}

/** Una novedad, algo extra que se hizo o un remedio dado. */
export async function anotarEnElDia(
  repo: RepositorioPatoteca,
  entrada: { fecha: FechaISO; clave: string; nota?: string },
  firma: Firma,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<RegistroDeTarea> {
  if (!esAcumulable(entrada.clave)) {
    throw new ErrorRepositorio("Esto se marca, no se anota.");
  }
  const nota = entrada.nota?.trim();
  if ((entrada.clave === CLAVE_NOVEDAD || entrada.clave === CLAVE_EXTRA) && !nota) {
    throw new ErrorRepositorio("Escribe qué pasó.");
  }
  return repo.registrosDeTareas.crear({
    fecha: entrada.fecha,
    clave: entrada.clave,
    estado: "hecha",
    nota: nota || undefined,
    autorStaff: firma.autorStaff,
    autorId: firma.autorId,
    marcadoEn: ahora,
  });
}

export async function borrarAnotacion(
  repo: RepositorioPatoteca,
  id: ID,
): Promise<void> {
  await repo.registrosDeTareas.eliminar(id);
}

/* ── Lo que arma Administración ────────────────────────────────────── */

export interface DatosDeTarea {
  titulo: string;
  instrucciones?: string;
  diasDeLaSemana?: number[];
  fecha?: FechaISO;
  ronda?: RondaDelDia;
}

function validar(tipo: Tarea["tipo"], datos: DatosDeTarea): void {
  if (!datos.titulo.trim()) throw new ErrorRepositorio("Ponle un nombre a la tarea.");
  if (tipo === "rutina" && (datos.diasDeLaSemana ?? []).length === 0) {
    throw new ErrorRepositorio(
      "Elige al menos un día: una rutina sin días no aparece nunca.",
    );
  }
  if (tipo === "encargo" && !datos.fecha) {
    throw new ErrorRepositorio("Elige desde qué día va el encargo.");
  }
}

function limpiar(datos: DatosDeTarea) {
  return {
    titulo: datos.titulo.trim(),
    instrucciones: datos.instrucciones?.trim() || undefined,
    diasDeLaSemana: datos.diasDeLaSemana
      ? [...new Set(datos.diasDeLaSemana)].sort((a, b) => a - b)
      : undefined,
    fecha: datos.fecha,
    ronda: datos.ronda,
  };
}

export async function crearTarea(
  repo: RepositorioPatoteca,
  tipo: Tarea["tipo"],
  datos: DatosDeTarea,
  creadaPor?: string,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Tarea> {
  validar(tipo, datos);
  const existentes = await repo.tareas.listar();
  const orden =
    existentes.reduce((maximo, t) => Math.max(maximo, t.orden), 0) + 1;
  const limpios = limpiar(datos);
  return repo.tareas.crear({
    ...limpios,
    tipo,
    diasDeLaSemana: tipo === "rutina" ? limpios.diasDeLaSemana : undefined,
    fecha: tipo === "encargo" ? limpios.fecha : undefined,
    activa: true,
    orden,
    creadaPor,
    creadaEn: ahora,
  });
}

export async function editarTarea(
  repo: RepositorioPatoteca,
  id: ID,
  datos: DatosDeTarea,
): Promise<Tarea> {
  const tarea = await repo.tareas.obtener(id);
  if (!tarea) throw new ErrorRepositorio("Esa tarea ya no existe.");
  validar(tarea.tipo, datos);
  const limpios = limpiar(datos);
  return repo.tareas.actualizar(id, {
    ...limpios,
    diasDeLaSemana: tarea.tipo === "rutina" ? limpios.diasDeLaSemana : undefined,
    fecha: tarea.tipo === "encargo" ? limpios.fecha : undefined,
  });
}

/**
 * Se archiva, no se borra: lo que ya se marcó de esa tarea sigue apuntando
 * a ella, y un historial con "tarea desconocida" no le explica nada a nadie.
 */
export async function archivarTarea(
  repo: RepositorioPatoteca,
  id: ID,
): Promise<Tarea> {
  return repo.tareas.actualizar(id, { activa: false });
}

/**
 * Carga la rutina sugerida, la que sale de cómo trabaja la casa hoy.
 * Lo que ya está no se duplica: se puede apretar dos veces.
 */
export async function cargarRutinaSugerida(
  repo: RepositorioPatoteca,
  creadaPor?: string,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Tarea[]> {
  const existentes = await repo.tareas.listar();
  const activas = existentes.filter((t) => t.activa);
  let orden = existentes.reduce((maximo, t) => Math.max(maximo, t.orden), 0);

  const creadas: Tarea[] = [];
  for (const sugerida of rutinaQueFalta(activas)) {
    orden += 1;
    creadas.push(
      await repo.tareas.crear({
        titulo: sugerida.titulo,
        instrucciones: "instrucciones" in sugerida ? sugerida.instrucciones : undefined,
        tipo: "rutina",
        diasDeLaSemana: [...sugerida.dias],
        ronda: "ronda" in sugerida ? sugerida.ronda : undefined,
        activa: true,
        orden,
        creadaPor,
        creadaEn: ahora,
      }),
    );
  }
  return creadas;
}

export interface EstadoDeEncargo {
  tarea: Tarea;
  /** Cuándo y quién lo hizo, si ya se hizo. */
  hecho?: RegistroDeTarea;
  /** Lo último que se anotó, aunque no sea "hecha": "no se pudo, llueve". */
  ultimo?: RegistroDeTarea;
}

/**
 * Los encargos vigentes con en qué van, para Administración.
 *
 * Primero los que faltan, del más viejo al más nuevo —lo que se añeja es lo
 * que se termina no haciendo—, y después los hechos, del más reciente.
 */
export async function cargarEncargos(
  repo: RepositorioPatoteca,
): Promise<EstadoDeEncargo[]> {
  const encargos = (await repo.tareas.listar()).filter(
    (t) => t.tipo === "encargo" && t.activa,
  );
  const registros = await repo.registrosDeTareas.porClaves(encargos.map((t) => t.id));

  const estados = encargos.map((tarea) => {
    const suyos = registros
      .filter((r) => r.clave === tarea.id)
      .sort((a, b) => a.marcadoEn.localeCompare(b.marcadoEn));
    const hechos = suyos.filter((r) => r.estado === "hecha");
    return {
      tarea,
      hecho: hechos[hechos.length - 1],
      ultimo: suyos[suyos.length - 1],
    };
  });

  return estados.sort((a, b) => {
    if (!!a.hecho !== !!b.hecho) return a.hecho ? 1 : -1;
    if (a.hecho && b.hecho) return b.hecho.marcadoEn.localeCompare(a.hecho.marcadoEn);
    return (a.tarea.fecha ?? "").localeCompare(b.tarea.fecha ?? "");
  });
}
