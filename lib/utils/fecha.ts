/**
 * Todo el tiempo del negocio ocurre en America/Santiago.
 *
 * Nunca uses `new Date().getHours()` ni `toLocaleDateString()` sueltos en la
 * app: la hora del navegador no es la hora de La Patoteca, y un check-out a
 * las 19:30 define un cobro.
 */

import { TZDate } from "@date-fns/tz";
import { differenceInMinutes, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { NEGOCIO } from "@/lib/config/negocio";
import type { FechaISO, InstanteISO } from "@/lib/types";

export const ZONA_HORARIA = NEGOCIO.zonaHoraria;

export type EntradaFecha = Date | string | number;

function aDate(valor: EntradaFecha): Date {
  if (valor instanceof Date) return valor;
  if (typeof valor === "number") return new Date(valor);
  return parseISO(valor);
}

/** El mismo instante, leído con el reloj de Santiago. */
export function enZona(valor: EntradaFecha): TZDate {
  return new TZDate(aDate(valor), ZONA_HORARIA);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* ── Día del calendario ────────────────────────────────────────────── */

/** El día de Santiago al que pertenece este instante: "2026-09-21". */
export function fechaISO(valor: EntradaFecha): FechaISO {
  return format(enZona(valor), "yyyy-MM-dd");
}

/** El mes al que pertenece: "2026-09". */
export function mesISO(valor: EntradaFecha): string {
  return format(enZona(valor), "yyyy-MM");
}

export function hoyISO(ahora: EntradaFecha = new Date()): FechaISO {
  return fechaISO(ahora);
}

/**
 * Aritmética de calendario pura (en UTC a propósito: sumar días no debe
 * moverse por cambios de horario de verano).
 */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const [a, m, d] = fecha.split("-").map(Number);
  const r = new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000);
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
}

export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  const t = (f: FechaISO) => {
    const [a, m, d] = f.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((t(hasta) - t(desde)) / 86_400_000);
}

/** Lista inclusiva de días entre dos fechas. */
export function rangoFechas(desde: FechaISO, hasta: FechaISO): FechaISO[] {
  const dias: FechaISO[] = [];
  for (let f = desde; diasEntre(f, hasta) >= 0; f = sumarDias(f, 1)) {
    dias.push(f);
  }
  return dias;
}

/** 0 = domingo … 6 = sábado, según el calendario de Santiago. */
export function diaDeSemana(fecha: FechaISO): number {
  return enZona(instanteEn(fecha, 12 * 60)).getDay();
}

export function esFinDeSemana(fecha: FechaISO): boolean {
  const dia = diaDeSemana(fecha);
  return dia === 0 || dia === 6;
}

/* ── Hora del día ──────────────────────────────────────────────────── */

/** Minutos transcurridos desde la medianoche de Santiago. 07:30 → 450. */
export function minutosDelDia(valor: EntradaFecha): number {
  const z = enZona(valor);
  return z.getHours() * 60 + z.getMinutes();
}

/** "07:30" → 450. */
export function minutosDesdeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 450 → "07:30". */
export function hhmmDesdeMinutos(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Construye el instante exacto que corresponde a una hora local de Santiago.
 * `instanteEn("2026-09-21", 450)` = las 07:30 de ese día en Providencia.
 */
export function instanteEn(fecha: FechaISO, minutosDelDia: number): InstanteISO {
  const [a, m, d] = fecha.split("-").map(Number);
  const z = TZDate.tz(
    ZONA_HORARIA,
    a,
    m - 1,
    d,
    Math.floor(minutosDelDia / 60),
    minutosDelDia % 60,
    0,
    0,
  );
  return new Date(z.getTime()).toISOString();
}

/** Igual que `instanteEn`, pero con la hora escrita: ("2026-09-21", "07:30"). */
export function instanteEnHora(fecha: FechaISO, hhmm: string): InstanteISO {
  return instanteEn(fecha, minutosDesdeHHMM(hhmm));
}

/* ── Diferencias ───────────────────────────────────────────────────── */

export function minutosEntre(desde: EntradaFecha, hasta: EntradaFecha): number {
  return differenceInMinutes(aDate(hasta), aDate(desde));
}

export function horasEntre(desde: EntradaFecha, hasta: EntradaFecha): number {
  return minutosEntre(desde, hasta) / 60;
}

/* ── Formato para la UI ────────────────────────────────────────────── */

function fmt(valor: EntradaFecha, patron: string): string {
  return format(enZona(valor), patron, { locale: es });
}

/** "21-09-2026" */
export function formatearFechaCorta(valor: EntradaFecha): string {
  return fmt(valor, "dd-MM-yyyy");
}

/** "21 de septiembre" */
export function formatearFecha(valor: EntradaFecha): string {
  return fmt(valor, "d 'de' MMMM");
}

/** "domingo 21 de septiembre de 2026" */
export function formatearFechaLarga(valor: EntradaFecha): string {
  return fmt(valor, "EEEE d 'de' MMMM 'de' yyyy");
}

/** "dom 21 sep" */
export function formatearDiaMes(valor: EntradaFecha): string {
  return fmt(valor, "EEE d MMM");
}

/** "07:30" */
export function formatearHora(valor: EntradaFecha): string {
  return fmt(valor, "HH:mm");
}

/** "07:30 a 19:00" */
export function formatearRangoHoras(
  desde: EntradaFecha,
  hasta: EntradaFecha,
): string {
  return `${formatearHora(desde)} a ${formatearHora(hasta)}`;
}

/** "septiembre 2026" */
export function formatearMes(valor: EntradaFecha): string {
  return fmt(valor, "MMMM yyyy");
}

/** "3 h 30 min", "45 min", "5 h" */
export function formatearDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
