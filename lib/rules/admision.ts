/**
 * Requisitos de admisión de La Patoteca.
 *
 * Se evalúan antes de permitir cualquier reserva. El día de prueba es la única
 * excepción: para agendarlo no se exige tenerlo aprobado, porque justamente es
 * la evaluación.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { diasEntre } from "@/lib/utils/fecha";
import type { FechaISO, Perro, TipoVacuna, Vacuna } from "@/lib/types";

export type MotivoRechazo =
  | "peso"
  | "esterilizacion"
  | "vacunas"
  | "desparasitacion"
  | "sociabilidad"
  | "dia_de_prueba";

export interface ProblemaAdmision {
  motivo: MotivoRechazo;
  mensaje: string;
  /** true si el dueño puede resolverlo (vacunar, esterilizar, agendar). */
  subsanable: boolean;
}

export interface ResultadoAdmision {
  admitido: boolean;
  problemas: ProblemaAdmision[];
}

const NOMBRE_VACUNA: Record<string, string> = {
  octuple: "óctuple",
  antirrabica: "antirrábica",
  kc: "KC (traqueobronquitis)",
};

export function nombreVacuna(tipo: string): string {
  return NOMBRE_VACUNA[tipo] ?? tipo;
}

/** La dosis más reciente de un tipo, o undefined si nunca se puso. */
export function ultimaVacuna(
  perro: Perro,
  tipo: TipoVacuna,
): Vacuna | undefined {
  return perro.vacunas
    .filter((v) => v.tipo === tipo)
    .sort((a, b) => b.fechaAplicacion.localeCompare(a.fechaAplicacion))[0];
}

export function vacunaVigente(
  perro: Perro,
  tipo: TipoVacuna,
  fecha: FechaISO,
): boolean {
  const v = ultimaVacuna(perro, tipo);
  return v !== undefined && diasEntre(fecha, v.fechaVencimiento) >= 0;
}

/** Vacunas obligatorias que faltan o están vencidas a esa fecha. */
export function vacunasFaltantes(perro: Perro, fecha: FechaISO): TipoVacuna[] {
  return NEGOCIO.admision.vacunasObligatorias.filter(
    (tipo) => !vacunaVigente(perro, tipo, fecha),
  );
}

export function tieneVacunasAlDia(perro: Perro, fecha: FechaISO): boolean {
  return vacunasFaltantes(perro, fecha).length === 0;
}

/** true si la desparasitación está registrada y vigente. */
export function desparasitacionAlDia(perro: Perro, fecha: FechaISO): boolean {
  return (
    perro.desparasitadoHasta !== undefined &&
    diasEntre(fecha, perro.desparasitadoHasta) >= 0
  );
}

/** Para las alertas del backoffice: vacunas que vencen dentro de N días. */
export function vacunasPorVencer(
  perro: Perro,
  fecha: FechaISO,
  dentroDeDias = 30,
): { tipo: TipoVacuna; venceEn: FechaISO; diasRestantes: number }[] {
  const porVencer: {
    tipo: TipoVacuna;
    venceEn: FechaISO;
    diasRestantes: number;
  }[] = [];

  for (const tipo of NEGOCIO.admision.vacunasObligatorias) {
    const v = ultimaVacuna(perro, tipo);
    if (!v) continue;
    const diasRestantes = diasEntre(fecha, v.fechaVencimiento);
    if (diasRestantes >= 0 && diasRestantes <= dentroDeDias) {
      porVencer.push({ tipo, venceEn: v.fechaVencimiento, diasRestantes });
    }
  }

  return porVencer;
}

export interface OpcionesAdmision {
  fecha: FechaISO;
  /**
   * Cuando se está agendando el día de prueba mismo, no se exige tenerlo
   * aprobado. El resto de los requisitos sí se exigen igual.
   */
  esDiaDePrueba?: boolean;
}

export function evaluarAdmision(
  perro: Perro,
  { fecha, esDiaDePrueba = false }: OpcionesAdmision,
): ResultadoAdmision {
  const problemas: ProblemaAdmision[] = [];

  if (perro.pesoKg > NEGOCIO.admision.pesoMaximoKg) {
    problemas.push({
      motivo: "peso",
      mensaje: `${perro.nombre} pesa ${perro.pesoKg} kg y el máximo es ${NEGOCIO.admision.pesoMaximoKg} kg.`,
      subsanable: false,
    });
  }

  if (
    NEGOCIO.admision.esterilizacionObligatoriaEnMachos &&
    perro.sexo === "macho" &&
    !perro.esterilizado
  ) {
    problemas.push({
      motivo: "esterilizacion",
      mensaje: `${perro.nombre} necesita estar esterilizado para quedarse con nosotros.`,
      subsanable: true,
    });
  }

  // Desparasitación interna y externa al día. Sin registro se avisa pero no
  // se bloquea: los perros cargados antes de que existiera el campo no tienen
  // por qué quedar rechazados de golpe.
  if (NEGOCIO.admision.exigeDesparasitacion) {
    if (perro.desparasitadoHasta === undefined) {
      problemas.push({
        motivo: "desparasitacion",
        mensaje: `No tenemos registro de la desparasitación de ${perro.nombre}.`,
        subsanable: true,
      });
    } else if (diasEntre(fecha, perro.desparasitadoHasta) < 0) {
      problemas.push({
        motivo: "desparasitacion",
        mensaje: `La desparasitación de ${perro.nombre} está vencida.`,
        subsanable: true,
      });
    }
  }

  if (NEGOCIO.admision.exigeSociabilidad && perro.sociable === false) {
    problemas.push({
      motivo: "sociabilidad",
      mensaje: `${perro.nombre} no pasó la evaluación de sociabilidad.`,
      subsanable: false,
    });
  }

  const faltantes = vacunasFaltantes(perro, fecha);
  if (faltantes.length > 0) {
    const lista = faltantes.map(nombreVacuna).join(", ");
    problemas.push({
      motivo: "vacunas",
      mensaje: `A ${perro.nombre} le falta tener al día: ${lista}.`,
      subsanable: true,
    });
  }

  if (!esDiaDePrueba && perro.diaDePrueba.estado !== "aprobado") {
    problemas.push({
      motivo: "dia_de_prueba",
      mensaje:
        perro.diaDePrueba.estado === "rechazado"
          ? `El día de prueba de ${perro.nombre} no fue aprobado.`
          : `${perro.nombre} necesita hacer su día de prueba antes de la primera reserva.`,
      subsanable: perro.diaDePrueba.estado !== "rechazado",
    });
  }

  return { admitido: problemas.length === 0, problemas };
}
