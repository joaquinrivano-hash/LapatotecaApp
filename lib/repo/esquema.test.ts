/**
 * El esquema de la base tiene que seguir describiendo a los tipos.
 *
 * `RepositorioSupabase` traduce entre el camelCase de TypeScript y el
 * snake_case de Postgres con una regla mecánica, sin un mapeador escrito a
 * mano por entidad. Eso ahorra cientos de líneas y vale exactamente lo que
 * valga esta prueba: si alguien agrega un campo a `Perro` y no agrega la
 * columna, la traducción manda `fecha_castracion` a una tabla que no la
 * tiene y Postgres rechaza la fila entera.
 *
 * El error aparecería recién al guardar, en producción, con el dueño
 * mirando la pantalla. Acá aparece al correr los tests.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(__dirname, "..", "..");
const TS = readFileSync(join(raiz, "lib", "types.ts"), "utf8");

/**
 * Todas las migraciones juntas, en el orden en que las aplica Supabase.
 *
 * No solo la del esquema: una columna agregada por una migración posterior es
 * tan parte de la tabla como las que nacieron con ella, y leer solo el primer
 * archivo haría que esta prueba acusara un desfase que no existe.
 */
const migraciones = join(raiz, "supabase", "migrations");
const SQL = readdirSync(migraciones)
  .filter((archivo) => archivo.endsWith(".sql"))
  .sort()
  .map((archivo) => readFileSync(join(migraciones, archivo), "utf8"))
  .join("\n");

/** Cada interfaz del dominio con la tabla que la guarda. */
const PARES: Record<string, string> = {
  Cliente: "clientes",
  Perro: "perros",
  ReservaHotel: "reservas_hotel",
  EstadiaJardin: "estadias_jardin",
  PlanComprado: "planes",
  Suscripcion: "suscripciones",
  ServicioAgendado: "servicios",
  Pago: "pagos",
  CuentaMensual: "cuentas_mensuales",
  Producto: "productos",
  OrdenTienda: "ordenes",
  Reporte: "reportes",
  Incidente: "incidentes",
  MensajeSaliente: "mensajes",
  Notificacion: "notificaciones",
  Turno: "turnos",
};

/**
 * Columnas que existen en la base y NO tienen campo en TypeScript, a
 * propósito. `perfil_id` amarra el cliente a su cuenta de Supabase: lo usan
 * las políticas de acceso y la app no tiene por qué verlo.
 */
const SOLO_EN_LA_BASE: Record<string, string[]> = {
  clientes: ["perfil_id"],
};

export function aSnake(campo: string): string {
  return campo.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function camposDeLaInterfaz(nombre: string): string[] {
  const m = new RegExp(`^export interface ${nombre} \\{\\n([\\s\\S]*?)^\\}`, "m")
    .exec(TS);
  if (!m) throw new Error(`No encontré la interfaz ${nombre} en types.ts`);
  const cuerpo = m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
  // Solo el primer nivel: lo anidado lleva más sangría y vive en un jsonb.
  return [...cuerpo.matchAll(/^ {2}(\w+)\??:/gm)].map((g) => g[1]);
}

function columnasDeLaTabla(tabla: string): string[] {
  const m = new RegExp(
    `create table if not exists ${tabla} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(SQL);
  if (!m) throw new Error(`No encontré la tabla ${tabla} en el esquema`);
  const reservadas = ["unique", "primary", "foreign", "check", "constraint"];
  const propias = m[1]
    .replace(/--.*/g, "")
    .split("\n")
    .map((linea) => /^(\w+) /.exec(linea.trim())?.[1])
    .filter((col): col is string => !!col && !reservadas.includes(col));

  // Las que agregó una migración posterior cuentan igual. Se toma la
  // sentencia completa y se buscan todos sus `add column`: un ALTER puede
  // agregar varias columnas de una, separadas por coma, y mirar solo la
  // primera haría que esta prueba acusara un desfase que no existe.
  const agregadas = [
    ...SQL.matchAll(new RegExp(`alter table ${tabla}\\b[^;]*;`, "g")),
  ].flatMap((sentencia) =>
    [
      ...sentencia[0].matchAll(/add column(?: if not exists)? (\w+)/g),
    ].map((g) => g[1]),
  );

  return [...propias, ...agregadas];
}

describe("el esquema y los tipos se describen el uno al otro", () => {
  it.each(Object.entries(PARES))("%s ↔ %s", (interfaz, tabla) => {
    const esperadas = camposDeLaInterfaz(interfaz).map(aSnake);
    const reales = columnasDeLaTabla(tabla);
    const extra = SOLO_EN_LA_BASE[tabla] ?? [];

    // Un campo del tipo sin columna: la fila se rechaza al guardar.
    expect(esperadas.filter((c) => !reales.includes(c))).toEqual([]);
    // Una columna sin campo: un dato que se guarda y nadie lee nunca.
    expect(reales.filter((c) => !esperadas.includes(c) && !extra.includes(c)))
      .toEqual([]);
  });

  it("todas las tablas del esquema están cotejadas o son de infraestructura", () => {
    const enElEsquema = [
      ...SQL.matchAll(/create table if not exists (\w+) \(/g),
    ].map((m) => m[1]);
    // No son colecciones del dominio: `perfiles` es el rol de cada cuenta,
    // `configuracion` es un registro único e `invitaciones` es el permiso
    // anotado antes de que la persona exista. Ninguna pasa por el
    // repositorio, así que no tienen interfaz que cotejar — el día que
    // alguna entre a `RepositorioPatoteca`, sale de esta lista.
    const infraestructura = ["perfiles", "configuracion", "invitaciones"];
    const cotejadas = [...Object.values(PARES), ...infraestructura];
    expect(enElEsquema.filter((t) => !cotejadas.includes(t))).toEqual([]);
  });
});

describe("aSnake", () => {
  it("traduce los nombres compuestos", () => {
    expect(aSnake("clienteId")).toBe("cliente_id");
    expect(aSnake("pesoKg")).toBe("peso_kg");
    expect(aSnake("perroIds")).toBe("perro_ids");
    expect(aSnake("inicioProgramado")).toBe("inicio_programado");
  });

  it("deja en paz los simples", () => {
    expect(aSnake("nombre")).toBe("nombre");
    expect(aSnake("km")).toBe("km");
  });
});
