/**
 * Qué le falta a una ficha nueva y qué le impide entrar.
 *
 * Es distinto de `admision.ts`: eso decide si el perro puede quedarse en la
 * casa un día concreto; esto decide si el formulario está completo y si vale
 * la pena seguir. Un perro puede tener la ficha impecable y no ser admitido, y
 * al revés.
 *
 * Qué es obligatorio lo decide Administración (`Configuracion`), así que las
 * reglas la reciben en vez de leerla: siguen siendo puras y se pueden probar
 * con cualquier combinación.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import {
  leCorrespondeEstarCastrado,
  vigenciaVacuna,
} from "@/lib/rules/perro";
import {
  MARCAS_ANTIPARASITARIO,
  MARCAS_COMIDA,
  RAZAS_FRECUENTES,
} from "@/lib/data/catalogos";
import { diasEntre } from "@/lib/utils/fecha";
import type {
  Alimentacion,
  Antiparasitario,
  CampoDeAlta,
  Configuracion,
  FechaISO,
  Sexo,
  TipoVacuna,
} from "@/lib/types";

export interface VacunaDeclarada {
  tipo: TipoVacuna;
  /** Cuándo se la pusieron, que es lo que está escrito en el carnet. */
  fechaAplicacion?: FechaISO;
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
  carnetVacunasUrls?: string[];
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
): Configuracion {
  return {
    vacunasObligatorias: [...NEGOCIO.admision.vacunasObligatorias],
    duracionVacunasMeses: { ...NEGOCIO.admision.duracionVacunasMeses },
    camposObligatorios: [...NEGOCIO.altaDePerro.camposObligatorios],
    catalogos: {
      razas: [...RAZAS_FRECUENTES],
      marcasComida: [...MARCAS_COMIDA],
      marcasAntiparasitario: [...MARCAS_ANTIPARASITARIO],
    },
    actualizadoEn: ahora,
  };
}

function exige(configuracion: Configuracion, campo: CampoDeAlta): boolean {
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

/* ── Lo que falta llenar ───────────────────────────────────────────── */

export function revisarAltaDePerro(
  borrador: BorradorDePerro,
  configuracion: Configuracion,
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

  if (
    exige(configuracion, "carnetVacunas") &&
    (borrador.carnetVacunasUrls ?? []).length === 0
  ) {
    faltan.push({
      campo: "carnetVacunasUrls",
      mensaje: "Faltan las fotos del carnet de vacunación.",
    });
  }

  for (const tipo of configuracion.vacunasObligatorias) {
    const declarada = borrador.vacunas?.find((v) => v.tipo === tipo);
    if (!declarada?.fechaAplicacion) {
      faltan.push({
        campo: `vacuna-${tipo}`,
        mensaje: `Falta cuándo le pusieron la ${nombreVacuna(tipo)}.`,
      });
    } else if (declarada.fechaAplicacion > hoy) {
      faltan.push({
        campo: `vacuna-${tipo}`,
        mensaje: `La ${nombreVacuna(tipo)} no puede tener fecha futura.`,
      });
    }
  }

  if (exige(configuracion, "antiparasitario") && !borrador.antiparasitario) {
    faltan.push({
      campo: "antiparasitario",
      mensaje: "Falta el antiparasitario: cuándo se lo diste y cuánto le dura.",
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

/* ── Lo que impide entrar, y lo que solo avisa ─────────────────────── */

export interface ReparoDeAlta {
  mensaje: string;
  /**
   * `true` cuando no tiene vuelta y por eso impide crear la cuenta.
   *
   * El peso no se negocia y la castración tampoco. Una vacuna vencida sí
   * tiene vuelta —se renueva antes de venir—, así que avisa y deja seguir:
   * rechazar ahí sería perder a un cliente por algo que se arregla en una
   * visita al veterinario.
   */
  bloquea: boolean;
}

export function reparosDeAlta(
  borrador: BorradorDePerro,
  configuracion: Configuracion,
  hoy: FechaISO,
): ReparoDeAlta[] {
  const reparos: ReparoDeAlta[] = [];

  if (borrador.pesoKg && borrador.pesoKg > NEGOCIO.admision.pesoMaximoKg) {
    reparos.push({
      mensaje: `Recibimos perritos de hasta ${NEGOCIO.admision.pesoMaximoKg} kg.`,
      bloquea: true,
    });
  }

  if (
    NEGOCIO.admision.esterilizacionObligatoriaEnMachos &&
    borrador.sexo === "macho" &&
    borrador.esterilizado === false &&
    leCorrespondeEstarCastrado(
      borrador.fechaNacimiento,
      hoy,
      NEGOCIO.admision.mesesParaExigirCastracion,
    )
  ) {
    reparos.push({
      mensaje: `Desde los ${NEGOCIO.admision.mesesParaExigirCastracion} meses los machos tienen que estar castrados para quedarse con nosotros.`,
      bloquea: true,
    });
  }

  const vencidas = vacunasVencidas(borrador, configuracion, hoy);
  if (vencidas.length > 0) {
    reparos.push({
      mensaje: `Según esa fecha, la ${vencidas.map(nombreVacuna).join(" y la ")} ${vencidas.length === 1 ? "está vencida" : "están vencidas"}. Puedes crear la cuenta igual, pero sin ponerla al día no podemos recibirlo el día de prueba.`,
      bloquea: false,
    });
  }

  return reparos;
}

/** Vacunas obligatorias cuya vigencia ya pasó, según lo que declaró el dueño. */
export function vacunasVencidas(
  borrador: BorradorDePerro,
  configuracion: Configuracion,
  hoy: FechaISO,
): TipoVacuna[] {
  return configuracion.vacunasObligatorias.filter((tipo) => {
    const declarada = borrador.vacunas?.find((v) => v.tipo === tipo);
    if (!declarada?.fechaAplicacion) return false;

    const vence = vigenciaVacuna(
      declarada.fechaAplicacion,
      configuracion.duracionVacunasMeses[tipo],
    );
    return diasEntre(hoy, vence) < 0;
  });
}
