/**
 * Lo que se calcula a partir de la ficha del perro: la edad, hasta cuándo le
 * dura el antiparasitario y cómo se lee su comida en una línea.
 *
 * Funciones puras, como el resto de `lib/rules`: no tocan repositorio ni red.
 */

import { sumarDias } from "@/lib/utils/fecha";
import type {
  Alimentacion,
  Antiparasitario,
  Comida,
  FechaISO,
  PeriodicidadAntiparasitario,
} from "@/lib/types";

/* ── Edad ──────────────────────────────────────────────────────────── */

export interface Edad {
  anios: number;
  meses: number;
}

/** Parte "2019-03-08" en sus tres números. */
function partes(fecha: FechaISO): [number, number, number] {
  const [a, m, d] = fecha.split("-").map(Number);
  return [a, m, d];
}

/**
 * Edad cumplida a esa fecha.
 *
 * Se trabaja sobre los números de la fecha y no sobre `Date`: las dos son
 * fechas de calendario, y meterlas en un `Date` solo agrega husos horarios a
 * una cuenta que no los necesita.
 */
export function calcularEdad(
  nacimiento: FechaISO,
  hoy: FechaISO,
): Edad | null {
  const [aN, mN, dN] = partes(nacimiento);
  const [aH, mH, dH] = partes(hoy);

  let meses = (aH - aN) * 12 + (mH - mN);
  if (dH < dN) meses -= 1;
  if (meses < 0) return null;

  return { anios: Math.floor(meses / 12), meses: meses % 12 };
}

function plural(cantidad: number, singular: string, plural_: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural_}`;
}

/** "3 años y 2 meses", "8 meses", "recién nacido". */
export function describirEdad(
  nacimiento: FechaISO,
  hoy: FechaISO,
): string | null {
  const edad = calcularEdad(nacimiento, hoy);
  if (!edad) return null;

  if (edad.anios === 0 && edad.meses === 0) return "recién nacido";
  if (edad.anios === 0) return plural(edad.meses, "mes", "meses");
  if (edad.meses === 0) return plural(edad.anios, "año", "años");

  return `${plural(edad.anios, "año", "años")} y ${plural(edad.meses, "mes", "meses")}`;
}

/* ── Cumpleaños ────────────────────────────────────────────────────── */

/**
 * Si ese día cumple años.
 *
 * Un perro nacido un 29 de febrero cumple el 28 en los años que no son
 * bisiestos: la fiesta no se salta tres de cada cuatro años.
 */
export function esCumpleanos(nacimiento: FechaISO, fecha: FechaISO): boolean {
  const [, mN, dN] = partes(nacimiento);
  const [aF, mF, dF] = partes(fecha);

  if (mN === mF && dN === dF) return true;

  const bisiesto = (aF % 4 === 0 && aF % 100 !== 0) || aF % 400 === 0;
  return mN === 2 && dN === 29 && !bisiesto && mF === 2 && dF === 28;
}

/** Cuántos cumple ese día. */
export function cumpleQueEdad(
  nacimiento: FechaISO,
  fecha: FechaISO,
): number | null {
  if (!esCumpleanos(nacimiento, fecha)) return null;
  return partes(fecha)[0] - partes(nacimiento)[0];
}

/* ── Antiparasitario ───────────────────────────────────────────────── */

export const DIAS_DE_PERIODICIDAD: Record<
  Exclude<PeriodicidadAntiparasitario, "otro">,
  number
> = {
  mensual: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

export const ETIQUETA_PERIODICIDAD: Record<
  PeriodicidadAntiparasitario,
  string
> = {
  mensual: "cada mes",
  trimestral: "cada 3 meses",
  semestral: "cada 6 meses",
  anual: "una vez al año",
  otro: "otro período",
};

/**
 * Hasta cuándo le dura. Es lo que termina guardado en `desparasitadoHasta`,
 * que es lo que mira la admisión.
 */
export function vigenciaAntiparasitario(
  antiparasitario: Antiparasitario,
): FechaISO {
  const dias =
    antiparasitario.periodicidad === "otro"
      ? (antiparasitario.cadaCuantosDias ?? 0)
      : DIAS_DE_PERIODICIDAD[antiparasitario.periodicidad];

  return sumarDias(antiparasitario.ultimaAplicacion, dias);
}

/* ── Alimentación ──────────────────────────────────────────────────── */

export const ETIQUETA_COMIDA: Record<Comida, string> = {
  desayuno: "desayuno",
  almuerzo: "almuerzo",
  cena: "cena",
};

export const ETIQUETA_UNIDAD = {
  g: "g",
  taza: "taza",
  scoop: "scoop",
} as const;

/** "Pelusa" · "Pelusa y Rocco" · "Pelusa, Rocco y Luna" */
function enumerar(valores: string[]): string {
  if (valores.length === 0) return "";
  if (valores.length === 1) return valores[0];
  return `${valores.slice(0, -1).join(", ")} y ${valores.at(-1)}`;
}

/**
 * La comida en una línea, para la ficha: "Proplan · 1 taza en almuerzo y cena".
 *
 * Devuelve `null` cuando no hay nada anotado, para que la pantalla muestre su
 * propio texto de vacío en vez de una línea a medias.
 */
export function describirAlimentacion(
  alimentacion: Alimentacion | undefined,
): string | null {
  if (!alimentacion) return null;

  const partesTexto: string[] = [];
  if (alimentacion.marca) partesTexto.push(alimentacion.marca);

  if (alimentacion.cantidad && alimentacion.unidad) {
    const unidad =
      alimentacion.unidad === "g"
        ? "g"
        : alimentacion.cantidad === 1
          ? alimentacion.unidad
          : `${alimentacion.unidad}s`;
    const racion = `${alimentacion.cantidad} ${unidad}`;

    partesTexto.push(
      alimentacion.comidas.length > 0
        ? `${racion} en ${enumerar(alimentacion.comidas.map((c) => ETIQUETA_COMIDA[c]))}`
        : racion,
    );
  } else if (alimentacion.comidas.length > 0) {
    partesTexto.push(
      `en ${enumerar(alimentacion.comidas.map((c) => ETIQUETA_COMIDA[c]))}`,
    );
  }

  const linea = partesTexto.join(" · ");
  if (!linea) return alimentacion.notas ?? null;

  return alimentacion.notas ? `${linea}. ${alimentacion.notas}` : linea;
}
