/**
 * Las reglas que también están escritas en SQL valen lo mismo que en config.
 *
 * Cancelar y mover lo agendado corre en la base (el dueño no puede tocar un
 * cobro), así que el corte de 24 horas y el cargo tardío están escritos dos
 * veces: en `lib/config` y en la migración. Si alguien cambia uno y no el
 * otro, la pantalla promete "sin costo" y la base cobra, o al revés.
 *
 * Cada constante de una función SQL lleva arriba el nombre de su gemela:
 *
 *   -- NEGOCIO.diaDePrueba.horasParaCancelarSinCosto
 *   horas_sin_costo constant numeric := 24;
 *
 * y esta prueba las compara todas.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";

const migraciones = join(__dirname, "..", "..", "..", "supabase", "migrations");
const SQL = readdirSync(migraciones)
  .filter((archivo) => archivo.endsWith(".sql"))
  .sort()
  .map((archivo) => readFileSync(join(migraciones, archivo), "utf8"))
  .join("\n");

const FUENTES: Record<string, unknown> = { NEGOCIO, PRECIOS };

/** `NEGOCIO.diaDePrueba.horasParaCancelarSinCosto` → 24 */
function valorEnConfig(ruta: string): unknown {
  return ruta
    .split(".")
    .reduce<unknown>(
      (objeto, clave) => (objeto as Record<string, unknown> | undefined)?.[clave],
      FUENTES,
    );
}

const GEMELAS = [
  ...SQL.matchAll(
    /--\s*((?:NEGOCIO|PRECIOS)\.[\w.]+)\s*\n\s*\w+\s+constant\s+\w+\s*:=\s*([\d.]+)\s*;/g,
  ),
].map(([, ruta, valor]) => ({ ruta, valor: Number(valor) }));

describe("reglas escritas en la base", () => {
  it("están las que mueven plata al cancelar y mover", () => {
    // Si un día se borra la anotación, esta prueba no puede pasar en blanco.
    const rutas = new Set(GEMELAS.map((g) => g.ruta));
    expect(rutas).toEqual(
      new Set([
        "NEGOCIO.diaDePrueba.horasParaCancelarSinCosto",
        "NEGOCIO.jardin.horasParaCancelarSinCosto",
        "PRECIOS.cancelacionTardiaDiaDePrueba",
      ]),
    );
  });

  it.each(GEMELAS)("$ruta vale lo mismo en SQL ($valor)", ({ ruta, valor }) => {
    expect(valorEnConfig(ruta)).toBe(valor);
  });
});
