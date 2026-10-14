/**
 * Lo que se calcula a partir de la ficha del perro: la edad, hasta cuándo le
 * dura el antiparasitario y cómo se lee su comida en una línea.
 *
 * Funciones puras, como el resto de `lib/rules`: no tocan repositorio ni red.
 */

import { rangoFechas } from "@/lib/utils/fecha";
import type {
  Alimentacion,
  Racion,
  UnidadRacion,
  Antiparasitario,
  Comida,
  FechaISO,
  Perro,
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

export interface CumpleanosDePerro {
  perro: Perro;
  fecha: FechaISO;
  /** Cuántos cumple ese día. */
  cumple: number;
}

/**
 * Quién cumple años entre esas dos fechas, en orden.
 *
 * Se recorre día por día en vez de comparar mes y día a mano porque el rango
 * puede cruzar el fin de año, y porque así el 29 de febrero se resuelve con la
 * misma regla que usa `esCumpleanos` en vez de con un caso aparte.
 */
export function cumpleanosEntre(
  perros: Perro[],
  desde: FechaISO,
  hasta: FechaISO,
): CumpleanosDePerro[] {
  const encontrados: CumpleanosDePerro[] = [];

  for (const fecha of rangoFechas(desde, hasta)) {
    for (const perro of perros) {
      if (!perro.fechaNacimiento) continue;
      const cumple = cumpleQueEdad(perro.fechaNacimiento, fecha);
      if (cumple !== null) encontrados.push({ perro, fecha, cumple });
    }
  }

  return encontrados;
}

/* ── Antiparasitario ───────────────────────────────────────────────── */

/**
 * Suma meses a una fecha de calendario, sin pasarse de mes.
 *
 * El 31 de enero más un mes es el 28 de febrero, no el 3 de marzo: una
 * vigencia que se corre de mes confunde a quien la lee en el carnet.
 */
export function sumarMeses(fecha: FechaISO, meses: number): FechaISO {
  const [anio, mes, dia] = partes(fecha);
  const total = (anio * 12 + (mes - 1)) + meses;
  const anioFinal = Math.floor(total / 12);
  const mesFinal = (total % 12) + 1;

  const diasDelMes = new Date(Date.UTC(anioFinal, mesFinal, 0)).getUTCDate();
  const diaFinal = Math.min(dia, diasDelMes);

  return `${anioFinal}-${String(mesFinal).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

/** "cada mes" · "cada 3 meses" */
export function describirDuracion(meses: number): string {
  return meses === 1 ? "cada mes" : `cada ${meses} meses`;
}

/**
 * Hasta cuándo le dura. Es lo que termina guardado en `desparasitadoHasta`,
 * que es lo que mira la admisión.
 */
export function vigenciaAntiparasitario(
  antiparasitario: Antiparasitario,
): FechaISO {
  return sumarMeses(
    antiparasitario.ultimaAplicacion,
    antiparasitario.mesesDeDuracion,
  );
}

/**
 * Hasta cuándo vale una vacuna puesta ese día.
 *
 * Al dueño se le pide la fecha de aplicación —la que está escrita en el
 * carnet— y el vencimiento se calcula con la duración que Administración
 * tenga configurada para esa vacuna.
 */
export function vigenciaVacuna(
  fechaAplicacion: FechaISO,
  mesesDeDuracion: number,
): FechaISO {
  return sumarMeses(fechaAplicacion, mesesDeDuracion);
}

/**
 * Si a esa fecha ya se le exige estar castrado.
 *
 * Antes de los 7 meses el veterinario todavía no la indica, así que rechazar a
 * un cachorro sería rechazarlo por algo que ni siquiera puede hacer. Sin fecha
 * de nacimiento se asume que ya tiene la edad: es lo prudente, y el dueño
 * siempre puede agregar la fecha.
 */
export function leCorrespondeEstarCastrado(
  nacimiento: FechaISO | undefined,
  hoy: FechaISO,
  mesesMinimos: number,
): boolean {
  if (!nacimiento) return true;
  const edad = calcularEdad(nacimiento, hoy);
  if (!edad) return false;
  return edad.anios * 12 + edad.meses >= mesesMinimos;
}

/* ── Alimentación ──────────────────────────────────────────────────── */

export const ETIQUETA_COMIDA: Record<Comida, string> = {
  desayuno: "desayuno",
  almuerzo: "almuerzo",
  cena: "cena",
};

/** "Pelusa" · "Pelusa y Rocco" · "Pelusa, Rocco y Luna" */
function enumerar(valores: string[]): string {
  if (valores.length === 0) return "";
  if (valores.length === 1) return valores[0];
  return `${valores.slice(0, -1).join(", ")} y ${valores.at(-1)}`;
}

/* ── Cantidades: números y fracciones ──────────────────────────────── */

const FRACCIONES: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
};

/**
 * Lo que escribió el dueño, como número.
 *
 * Media taza se escribe de muchas maneras —"1/2", "½", "0,5"— y todas son
 * correctas para quien las escribe. Rechazar una por no ser la que esperaba
 * el campo es culpar a la persona de una limitación nuestra.
 */
export function parsearCantidad(texto: string): number | undefined {
  const limpio = texto.trim();
  if (!limpio) return undefined;

  // "1½" o "½"
  const conGlifo = /^(\d+)?\s*([½⅓⅔¼¾])$/.exec(limpio);
  if (conGlifo) {
    return Number(conGlifo[1] ?? 0) + FRACCIONES[conGlifo[2]];
  }

  // "1 1/2" o "1/2"
  const conBarra = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(limpio);
  if (conBarra) {
    const denominador = Number(conBarra[3]);
    if (denominador === 0) return undefined;
    return Number(conBarra[1] ?? 0) + Number(conBarra[2]) / denominador;
  }

  // "1,5" o "1.5"
  const decimal = /^\d+(?:[.,]\d+)?$/.exec(limpio);
  if (!decimal) return undefined;

  const valor = Number(limpio.replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/** El número como se lee: "½", "1½", "1,3". */
export function formatearCantidad(cantidad: number): string {
  const entero = Math.floor(cantidad);
  const resto = cantidad - entero;

  const glifo = Object.entries(FRACCIONES).find(
    ([, valor]) => Math.abs(valor - resto) < 0.01,
  )?.[0];

  if (glifo) return entero > 0 ? `${entero}${glifo}` : glifo;
  if (Number.isInteger(cantidad)) return String(cantidad);

  return cantidad
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

export const ETIQUETA_UNIDAD: Record<UnidadRacion, { una: string; varias: string }> =
  {
    medida: { una: "medida", varias: "medidas" },
    g: { una: "g", varias: "g" },
    taza: { una: "taza", varias: "tazas" },
  };

/**
 * La comida en una línea, para la ficha:
 * "Proplan · 1 taza en almuerzo" o "Proplan · media taza en desayuno y 1 taza
 * en cena".
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

  const raciones = (alimentacion.raciones ?? [])
    .map((racion) => describirRacion(racion, alimentacion.unidad))
    .filter((texto): texto is string => texto !== null);

  if (raciones.length > 0) partesTexto.push(raciones.join(", "));

  const linea = partesTexto.join(" · ");
  if (!linea) return alimentacion.notas ?? null;

  return alimentacion.notas ? `${linea}. ${alimentacion.notas}` : linea;
}

/** "1 taza en almuerzo y cena" · "en desayuno" · "200 g" */
function describirRacion(
  racion: Racion,
  unidad: UnidadRacion | undefined,
): string | null {
  const medida =
    racion.cantidad && unidad
      ? `${formatearCantidad(racion.cantidad)} ${pluralizarUnidad(racion.cantidad, unidad)}`
      : null;

  const cuando =
    racion.comidas.length > 0
      ? `en ${enumerar(racion.comidas.map((c) => ETIQUETA_COMIDA[c]))}`
      : null;

  if (medida && cuando) return `${medida} ${cuando}`;
  return medida ?? cuando;
}

/**
 * "1 taza", "½ taza", "2 tazas".
 *
 * Media taza va en singular: "½ tazas" no lo dice nadie.
 */
function pluralizarUnidad(cantidad: number, unidad: UnidadRacion): string {
  const etiqueta = ETIQUETA_UNIDAD[unidad];
  return cantidad <= 1 ? etiqueta.una : etiqueta.varias;
}
