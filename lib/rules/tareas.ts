/**
 * Las tareas del día: qué hay que hacer hoy, cómo va y cómo se cuenta.
 *
 * Sale de cómo trabaja la casa en el grupo "La Patoteca REPORTES": después
 * de cada comida se recogen las cacas, se cambian las aguas, se mandan los
 * reportes y se escribe en el grupo lo hecho (✅), lo que está en curso (🔜),
 * lo pendiente y las novedades. Esto modela eso mismo, sin inventarle pasos.
 *
 * Funciones puras: no saben del repositorio ni de la hora del reloj.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  diaDeSemana,
  formatearHora,
  minutosDelDia,
  minutosDesdeHHMM,
} from "@/lib/utils/fecha";
import type {
  EstadoTarea,
  FechaISO,
  ID,
  InstanteISO,
  RegistroDeTarea,
  RondaDelDia,
  Tarea,
} from "@/lib/types";

export const RONDAS = NEGOCIO.tareas.rondas;
export const PASOS_DE_RONDA = NEGOCIO.tareas.pasosDeRonda;

export type PasoDeRonda = (typeof PASOS_DE_RONDA)[number]["clave"];

/* ── Las claves ────────────────────────────────────────────────────── */

export const CLAVE_NOVEDAD = "novedad";
export const CLAVE_EXTRA = "extra";
const PREFIJO_MEDICAMENTO = "medicamento:";

export function claveDePaso(ronda: RondaDelDia, paso: PasoDeRonda): string {
  return `ronda:${ronda}:${paso}`;
}

export function claveDeMedicamento(perroId: ID): string {
  return `${PREFIJO_MEDICAMENTO}${perroId}`;
}

export function perroDelMedicamento(clave: string): ID | null {
  return clave.startsWith(PREFIJO_MEDICAMENTO)
    ? clave.slice(PREFIJO_MEDICAMENTO.length)
    : null;
}

/**
 * Las claves que se acumulan en vez de corregirse.
 *
 * Una novedad no reemplaza a la anterior, y darle el remedio en la mañana y
 * en la noche son dos registros. Lo demás —una tarea, el paso de una ronda—
 * tiene un solo estado por día, y volver a marcarlo lo corrige.
 */
export function esAcumulable(clave: string): boolean {
  return (
    clave === CLAVE_NOVEDAD ||
    clave === CLAVE_EXTRA ||
    clave.startsWith(PREFIJO_MEDICAMENTO)
  );
}

/* ── Las rondas ────────────────────────────────────────────────────── */

/**
 * Desde qué minuto del día corre cada ronda.
 *
 * Empiezan con la ventana de reportes del mismo orden, salvo la primera, que
 * corre desde que empieza el día: el desayuno se sirve antes de las 8 y
 * marcarlo no puede caer en "ninguna ronda".
 */
export function inicioDeRonda(indice: number): number {
  if (indice <= 0) return 0;
  const ventana = NEGOCIO.reportes.ventanas[indice];
  return ventana ? minutosDesdeHHMM(ventana.desde) : 24 * 60;
}

/** En qué ronda va el día a esta hora de Santiago. */
export function rondaDeLaHora(ahora: InstanteISO): RondaDelDia {
  const minutos = minutosDelDia(ahora);
  let actual: RondaDelDia = RONDAS[0].clave;
  RONDAS.forEach((ronda, i) => {
    if (minutos >= inicioDeRonda(i)) actual = ronda.clave;
  });
  return actual;
}

/** Las rondas que ya empezaron: lo pendiente solo se cuenta en esas. */
export function rondasEmpezadas(ahora: InstanteISO): RondaDelDia[] {
  const minutos = minutosDelDia(ahora);
  return RONDAS.filter((_, i) => minutos >= inicioDeRonda(i)).map(
    (r) => r.clave,
  );
}

function datosDeRonda(ronda: RondaDelDia) {
  return RONDAS.find((r) => r.clave === ronda) ?? RONDAS[0];
}

/* ── El último registro manda ──────────────────────────────────────── */

/**
 * El registro que vale para cada clave: el último que se marcó.
 *
 * En la nube dos celulares pueden marcar lo mismo casi al mismo tiempo y
 * dejar dos filas. Quedarse con la última es lo que haría cualquiera
 * leyendo el grupo: lo que se dijo después corrige lo anterior.
 */
export function ultimoPorClave(
  registros: RegistroDeTarea[],
): Map<string, RegistroDeTarea> {
  const ultimos = new Map<string, RegistroDeTarea>();
  for (const registro of registros) {
    const previo = ultimos.get(registro.clave);
    if (!previo || registro.marcadoEn >= previo.marcadoEn) {
      ultimos.set(registro.clave, registro);
    }
  }
  return ultimos;
}

/* ── Qué toca hoy ──────────────────────────────────────────────────── */

export interface TareaDelDia {
  tarea: Tarea;
  estado: EstadoTarea;
  registro?: RegistroDeTarea;
  /** Un encargo que viene de un día anterior y todavía no se hace. */
  arrastradaDesde?: FechaISO;
}

const ORDEN_DE_RONDA: Record<string, number> = Object.fromEntries(
  RONDAS.map((r, i) => [r.clave, i]),
);

function ordenar(a: TareaDelDia, b: TareaDelDia): number {
  const ra = a.tarea.ronda ? ORDEN_DE_RONDA[a.tarea.ronda] : RONDAS.length;
  const rb = b.tarea.ronda ? ORDEN_DE_RONDA[b.tarea.ronda] : RONDAS.length;
  return (
    ra - rb ||
    a.tarea.orden - b.tarea.orden ||
    a.tarea.titulo.localeCompare(b.tarea.titulo, "es")
  );
}

/**
 * Lo que hay que hacer un día, con cómo va cada cosa.
 *
 * - La **rutina** aparece los días de la semana marcados. Si no se hizo, no
 *   se arrastra: el lunes que viene vuelve a tocar.
 * - El **encargo** aparece desde su fecha y se queda hasta que alguien lo
 *   hace. Es lo que pasaba en el grupo, donde la lista de Sivi se volvía a
 *   pegar al día siguiente con lo que faltaba. "No se pudo hoy" no lo
 *   cierra: mañana vuelve.
 *
 * `registros` tiene que traer los del día y, para los encargos, los de los
 * días anteriores en que se pudo haber hecho.
 */
export function tareasDelDia(
  tareas: Tarea[],
  registros: RegistroDeTarea[],
  fecha: FechaISO,
): TareaDelDia[] {
  const dia = diaDeSemana(fecha);
  const delDia = ultimoPorClave(registros.filter((r) => r.fecha === fecha));
  const hechasAntes = new Set(
    registros
      .filter((r) => r.fecha < fecha && r.estado === "hecha")
      .map((r) => r.clave),
  );

  const resultado: TareaDelDia[] = [];
  for (const tarea of tareas) {
    if (!tarea.activa) continue;

    if (tarea.tipo === "rutina") {
      if (!(tarea.diasDeLaSemana ?? []).includes(dia)) continue;
    } else {
      if (!tarea.fecha || tarea.fecha > fecha) continue;
      if (hechasAntes.has(tarea.id)) continue;
    }

    const registro = delDia.get(tarea.id);
    resultado.push({
      tarea,
      estado: registro?.estado ?? "pendiente",
      registro,
      arrastradaDesde:
        tarea.tipo === "encargo" && tarea.fecha && tarea.fecha < fecha
          ? tarea.fecha
          : undefined,
    });
  }

  return resultado.sort(ordenar);
}

/* ── La rutina de cada comida ──────────────────────────────────────── */

export interface PasoDelDia {
  ronda: RondaDelDia;
  paso: PasoDeRonda;
  clave: string;
  titulo: string;
  estado: EstadoTarea;
  registro?: RegistroDeTarea;
}

/** Los pasos de una ronda, con cómo va cada uno ese día. */
export function pasosDeLaRonda(
  ronda: RondaDelDia,
  registros: RegistroDeTarea[],
  fecha: FechaISO,
): PasoDelDia[] {
  const delDia = ultimoPorClave(registros.filter((r) => r.fecha === fecha));
  const datos = datosDeRonda(ronda);

  return PASOS_DE_RONDA.map((paso) => {
    const clave = claveDePaso(ronda, paso.clave);
    const registro = delDia.get(clave);
    return {
      ronda,
      paso: paso.clave,
      clave,
      titulo: paso.clave === "comida" ? datos.comida : paso.titulo,
      estado: registro?.estado ?? "pendiente",
      registro,
    };
  });
}

/* ── Cómo va ───────────────────────────────────────────────────────── */

/** Hecha o decidida: las dos dejan de esperar a alguien. */
export function estaResuelta(estado: EstadoTarea): boolean {
  return estado === "hecha" || estado === "no_se_hizo";
}

export interface Avance {
  resueltas: number;
  total: number;
}

/**
 * Cuánto va del día.
 *
 * Los pasos de una ronda que todavía no empieza no cuentan: a las 10 de la
 * mañana la cena no está "pendiente", y una barra que parte el día en 30%
 * sin que nadie haya fallado en nada es una barra que se deja de mirar.
 */
export function avanceDelDia(
  tareas: TareaDelDia[],
  pasos: PasoDelDia[],
  empezadas: RondaDelDia[],
): Avance {
  const cuentan = [
    ...tareas.map((t) => t.estado),
    ...pasos
      .filter((p) => empezadas.includes(p.ronda) || estaResuelta(p.estado))
      .map((p) => p.estado),
  ];
  return {
    resueltas: cuentan.filter(estaResuelta).length,
    total: cuentan.length,
  };
}

/* ── El reporte para el grupo ──────────────────────────────────────── */

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** "Mara", "Mara y Oliver", "Mara, Oliver y Togo". */
export function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function entreParentesis(partes: (string | undefined)[]): string {
  const llenas = partes.filter((p): p is string => !!p && p.trim() !== "");
  return llenas.length ? ` (${llenas.join(" · ")})` : "";
}

/** Cómo se dice un paso hecho, igual que en el grupo. */
export function describirPasoHecho(
  paso: PasoDelDia,
  nombreDe: (id: ID) => string,
): string {
  const datos = PASOS_DE_RONDA.find((p) => p.clave === paso.paso);
  const registro = paso.registro;
  const nota = registro?.nota;

  if (paso.paso === "comida") {
    const comieron = datosDeRonda(paso.ronda).comieron;
    const faltaron = (registro?.perroIds ?? []).map(nombreDe);
    if (faltaron.length === 0) return `${comieron} todos${entreParentesis([nota])}`;
    const verbo = faltaron.length === 1 ? "faltó" : "faltaron";
    return `${comieron} casi todos${entreParentesis([
      `${verbo} ${enumerar(faltaron)}`,
      nota,
    ])}`;
  }

  const hora =
    datos?.conHora && registro ? formatearHora(registro.marcadoEn) : undefined;
  return `${datos?.hecho ?? paso.titulo}${entreParentesis([hora, nota])}`;
}

function fechaCorta(fecha: FechaISO): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

export interface EntradaResumen {
  fecha: FechaISO;
  ahora: InstanteISO;
  autor: string;
  pasos: PasoDelDia[];
  tareas: TareaDelDia[];
  /** Los del día: de acá salen los extras, los remedios y las novedades. */
  registros: RegistroDeTarea[];
  perros: { id: ID; nombre: string }[];
}

/**
 * El reporte del turno, escrito como se escribe en el grupo.
 *
 * Es acumulativo, como el de los turnos largos: cada vez que se manda trae
 * todo lo del día hasta ahora. Así quien lo lee a las 8 de la noche no tiene
 * que juntar tres mensajes para saber si alguien barrió.
 *
 *   Reporte lunes 26/10 (Flo)
 *   10:00
 *
 *   ✅ Desayunaron casi todos (faltó Mara)
 *   ✅ Se recogieron cacas y limpiaron pipís (09:30)
 *   🔜 Lavar y enjuagar patio
 *
 *   *Medicamentos*
 *   - Kuky: Fluoxetina (10:05)
 *
 *   *Pendiente*
 *   - Paseo de la mañana
 *
 *   *Novedades*
 *   - Owen llegó sin arnés
 */
export function armarResumenDelTurno(entrada: EntradaResumen): string {
  const { fecha, ahora, autor, pasos, tareas, registros, perros } = entrada;
  const nombreDe = (id: ID) => perros.find((p) => p.id === id)?.nombre ?? "un perrito";
  const empezadas = rondasEmpezadas(ahora);
  const delDia = registros.filter((r) => r.fecha === fecha);
  const porHora = (a: RegistroDeTarea, b: RegistroDeTarea) =>
    a.marcadoEn.localeCompare(b.marcadoEn);

  const hechas: string[] = [];
  const enCurso: string[] = [];
  const pendientes: string[] = [];

  for (const paso of pasos) {
    if (paso.estado === "hecha") hechas.push(describirPasoHecho(paso, nombreDe));
    else if (paso.estado === "en_proceso") enCurso.push(paso.titulo);
    else if (empezadas.includes(paso.ronda)) {
      pendientes.push(
        paso.estado === "no_se_hizo"
          ? `${paso.titulo}${entreParentesis([`no se hizo${paso.registro?.nota ? `: ${paso.registro.nota}` : ""}`])}`
          : paso.titulo,
      );
    }
  }

  for (const { tarea, estado, registro, arrastradaDesde } of tareas) {
    if (estado === "hecha") {
      hechas.push(`${tarea.titulo}${entreParentesis([registro?.nota])}`);
    } else if (estado === "en_proceso") {
      enCurso.push(`${tarea.titulo}${entreParentesis([registro?.nota])}`);
    } else if (estado === "no_se_hizo") {
      pendientes.push(
        `${tarea.titulo}${entreParentesis([
          `no se hizo${registro?.nota ? `: ${registro.nota}` : ""}`,
        ])}`,
      );
    } else {
      pendientes.push(
        `${tarea.titulo}${entreParentesis([
          arrastradaDesde ? `viene del ${fechaCorta(arrastradaDesde)}` : undefined,
        ])}`,
      );
    }
  }

  for (const extra of delDia.filter((r) => r.clave === CLAVE_EXTRA).sort(porHora)) {
    if (extra.nota) hechas.push(extra.nota);
  }

  const remedios = delDia
    .filter((r) => perroDelMedicamento(r.clave))
    .sort(porHora)
    .map((r) => {
      const perro = nombreDe(perroDelMedicamento(r.clave)!);
      return `- ${perro}: ${r.nota || "sus remedios"} (${formatearHora(r.marcadoEn)})`;
    });

  const novedades = delDia
    .filter((r) => r.clave === CLAVE_NOVEDAD && r.nota)
    .sort(porHora)
    .map((r) => `- ${r.nota}`);

  const lineas = [
    `Reporte ${DIAS[diaDeSemana(fecha)]} ${fechaCorta(fecha)} (${autor})`,
    formatearHora(ahora),
  ];

  const bloque = (titulo: string | null, items: string[]) => {
    if (items.length === 0) return;
    lineas.push("");
    if (titulo) lineas.push(`*${titulo}*`);
    lineas.push(...items);
  };

  bloque(null, [
    ...hechas.map((h) => `✅ ${h}`),
    ...enCurso.map((e) => `🔜 ${e}`),
  ]);
  bloque("Medicamentos", remedios);
  bloque("Pendiente", pendientes.map((p) => `- ${p}`));
  bloque("Novedades", novedades);

  return lineas.join("\n");
}

/* ── Cargar la rutina sugerida ─────────────────────────────────────── */

/**
 * Las tareas de la rutina sugerida que todavía no están.
 *
 * Compara por título sin tildes ni mayúsculas, así apretar el botón dos
 * veces —o después de haber escrito "Limpiar baños" a mano— no duplica nada.
 */
export function rutinaQueFalta(
  existentes: Pick<Tarea, "titulo" | "tipo">[],
): (typeof NEGOCIO.tareas.rutinaSugerida)[number][] {
  const normalizar = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const ya = new Set(
    existentes.filter((t) => t.tipo === "rutina").map((t) => normalizar(t.titulo)),
  );
  return NEGOCIO.tareas.rutinaSugerida.filter((t) => !ya.has(normalizar(t.titulo)));
}
