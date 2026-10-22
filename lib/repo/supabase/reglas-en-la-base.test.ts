/**
 * Las reglas que también están escritas en SQL valen lo mismo que en config.
 *
 * Cancelar, mover, agendar el día de prueba y comprar un plan corren en la
 * base (el dueño no puede tocar cobros ni planes), así que los cortes, los
 * precios y los tramos están escritos dos veces: en `lib/config` y en las
 * migraciones. Si alguien cambia uno y no el otro, la pantalla cotiza una
 * cosa y la base cobra otra.
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
    /--\s*((?:NEGOCIO|PRECIOS)\.[\w.]+)\s*\n\s*\w+\s+constant\s+\w+\s*:=\s*(true|false|[\d.]+)\s*;/g,
  ),
].map(([, ruta, valor]) => ({
  ruta,
  valor: valor === "true" ? true : valor === "false" ? false : Number(valor),
}));

describe("reglas escritas en la base", () => {
  it("están todas las que mueven plata", () => {
    // Si un día se borra la anotación, esta prueba no puede pasar en blanco.
    const rutas = new Set(GEMELAS.map((g) => g.ruta));
    expect(rutas).toEqual(
      new Set([
        "NEGOCIO.diaDePrueba.horasParaCancelarSinCosto",
        "NEGOCIO.diaDePrueba.horasDeEstadia",
        "NEGOCIO.jardin.horasParaCancelarSinCosto",
        "NEGOCIO.planes.minimoDias",
        "NEGOCIO.planes.soloDiasHabiles",
        "PRECIOS.cancelacionTardiaDiaDePrueba",
        "PRECIOS.diaDePrueba",
        "PRECIOS.planes.paseLibre",
        "PRECIOS.planes.tramosPorDia.0.hastaDias",
        "PRECIOS.planes.tramosPorDia.0.precioPorDia",
        "PRECIOS.planes.tramosPorDia.1.precioPorDia",
      ]),
    );
  });

  it("los tramos del plan siguen siendo los dos que sabe calcular la base", () => {
    // `comprar_plan_de_jardin` cobra el primer tramo hasta `hastaDias` y el
    // segundo de ahí en adelante. Un tercer tramo, o un hueco entre los dos,
    // haría que la base cobrara distinto que la pantalla sin que ninguna
    // constante cambiara.
    const [primero, segundo, ...resto] = PRECIOS.planes.tramosPorDia;
    expect(resto).toEqual([]);
    expect(primero.desdeDias).toBe(NEGOCIO.planes.minimoDias);
    expect(segundo.desdeDias).toBe((primero.hastaDias ?? 0) + 1);
    expect(segundo.hastaDias).toBeNull();
  });

  it.each(GEMELAS)("$ruta vale lo mismo en SQL ($valor)", ({ ruta, valor }) => {
    expect(valorEnConfig(ruta)).toBe(valor);
  });
});
