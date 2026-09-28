/**
 * Qué le falta a una ficha nueva para poder guardarse.
 *
 * Es distinto de `admision.ts`: eso decide si el perro puede quedarse en la
 * casa (peso, vacunas vigentes, esterilización); esto decide si el formulario
 * está completo. Un perro puede tener la ficha impecable y no ser admitido, y
 * al revés.
 *
 * Qué es obligatorio lo decide Administración (`ConfiguracionAdmision`), así
 * que la regla recibe la configuración en vez de leerla: sigue siendo pura y
 * se puede probar con cualquier combinación.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import type {
  Alimentacion,
  Antiparasitario,
  CampoDeAlta,
  ConfiguracionAdmision,
  FechaISO,
  Sexo,
  TipoVacuna,
} from "@/lib/types";

export interface VacunaDeclarada {
  tipo: TipoVacuna;
  /** Cuándo se la pusieron. */
  fechaAplicacion?: FechaISO;
  /** Hasta cuándo vale. Es lo que mira la admisión. */
  fechaVencimiento?: FechaISO;
}

/**
 * La ficha como viene del formulario: todo puede faltar, incluido
 * `esterilizado`, que arranca sin elegir a propósito.
 */
export interface BorradorDePerro {
  nombre?: string;
  raza?: string;
  pesoKg?: number;
  sexo?: Sexo;
  esterilizado?: boolean;
  fechaNacimiento?: FechaISO;
  fotoUrl?: string;
  carnetVacunasUrl?: string;
  vacunas?: VacunaDeclarada[];
  antiparasitario?: Antiparasitario;
  alimentacion?: Alimentacion;
}

export interface FaltanteDeAlta {
  /** Para que la pantalla marque el campo que falta. */
  campo: string;
  mensaje: string;
}

/** La configuración de fábrica, para la primera vez y para "volver a lo de siempre". */
export function configuracionPorDefecto(
  ahora: string = new Date().toISOString(),
): ConfiguracionAdmision {
  return {
    vacunasObligatorias: [...NEGOCIO.admision.vacunasObligatorias],
    camposObligatorios: [...NEGOCIO.altaDePerro.camposObligatorios],
    actualizadoEn: ahora,
  };
}

function exige(
  configuracion: ConfiguracionAdmision,
  campo: CampoDeAlta,
): boolean {
  return configuracion.camposObligatorios.includes(campo);
}

function alimentacionCompleta(alimentacion: Alimentacion | undefined): boolean {
  return Boolean(
    alimentacion?.marca?.trim() &&
      alimentacion.cantidad &&
      alimentacion.cantidad > 0 &&
      alimentacion.unidad &&
      alimentacion.comidas.length > 0,
  );
}

export function revisarAltaDePerro(
  borrador: BorradorDePerro,
  configuracion: ConfiguracionAdmision,
  hoy: FechaISO,
): FaltanteDeAlta[] {
  const faltan: FaltanteDeAlta[] = [];

  if (!borrador.nombre?.trim()) {
    faltan.push({ campo: "nombre", mensaje: "¿Cómo se llama?" });
  }
  if (!borrador.raza?.trim()) {
    faltan.push({ campo: "raza", mensaje: "Falta la raza." });
  }
  if (!borrador.pesoKg || borrador.pesoKg <= 0) {
    faltan.push({ campo: "pesoKg", mensaje: "Falta el peso." });
  }
  if (!borrador.sexo) {
    faltan.push({ campo: "sexo", mensaje: "Falta decir si es macho o hembra." });
  }

  // Sin valor por defecto: que el dueño lo elija, no que acepte el nuestro.
  if (borrador.esterilizado === undefined) {
    faltan.push({
      campo: "esterilizado",
      mensaje: "Falta decir si está castrado.",
    });
  }

  if (exige(configuracion, "fechaNacimiento") && !borrador.fechaNacimiento) {
    faltan.push({
      campo: "fechaNacimiento",
      mensaje: "Falta la fecha de nacimiento.",
    });
  }
  if (borrador.fechaNacimiento && borrador.fechaNacimiento > hoy) {
    faltan.push({
      campo: "fechaNacimiento",
      mensaje: "La fecha de nacimiento no puede ser futura.",
    });
  }

  if (exige(configuracion, "foto") && !borrador.fotoUrl) {
    faltan.push({ campo: "fotoUrl", mensaje: "Falta la foto del perrito." });
  }

  if (exige(configuracion, "carnetVacunas") && !borrador.carnetVacunasUrl) {
    faltan.push({
      campo: "carnetVacunasUrl",
      mensaje: "Falta la foto del carnet de vacunación.",
    });
  }

  for (const tipo of configuracion.vacunasObligatorias) {
    const declarada = borrador.vacunas?.find((v) => v.tipo === tipo);
    if (!declarada?.fechaVencimiento) {
      faltan.push({
        campo: `vacuna-${tipo}`,
        mensaje: `Falta hasta cuándo vale la ${nombreVacuna(tipo)}.`,
      });
    }
  }

  if (exige(configuracion, "antiparasitario") && !borrador.antiparasitario) {
    faltan.push({
      campo: "antiparasitario",
      mensaje: "Falta el antiparasitario: cuándo se lo diste y cada cuánto.",
    });
  }
  if (
    borrador.antiparasitario?.periodicidad === "otro" &&
    !borrador.antiparasitario.cadaCuantosDias
  ) {
    faltan.push({
      campo: "antiparasitario",
      mensaje: "Falta decir cada cuántos días se lo das.",
    });
  }

  if (
    exige(configuracion, "alimentacion") &&
    !alimentacionCompleta(borrador.alimentacion)
  ) {
    faltan.push({
      campo: "alimentacion",
      mensaje: "Falta la comida: marca, cuánto y en qué comidas.",
    });
  }

  return faltan;
}
