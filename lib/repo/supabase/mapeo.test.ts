import { describe, expect, it } from "vitest";
import { aCamel, aEntidad, aFila, aSnake } from "@/lib/repo/supabase/mapeo";

describe("nombres", () => {
  it("van y vuelven", () => {
    for (const campo of ["clienteId", "pesoKg", "inicioProgramado", "nombre"]) {
      expect(aCamel(aSnake(campo))).toBe(campo);
    }
  });

  it("entiende los plurales con id", () => {
    expect(aSnake("perroIds")).toBe("perro_ids");
    expect(aCamel("perro_ids")).toBe("perroIds");
    expect(aCamel("cuenta_mensual_id")).toBe("cuentaMensualId");
  });
});

describe("de la base a la entidad", () => {
  it("omite los nulos en vez de pasarlos", () => {
    // Si el null pasara, `perro.sociable === undefined` daría falso y la
    // admisión trataría "sin evaluar" como "evaluado".
    const perro = aEntidad<{ sociable?: boolean }>({
      nombre: "Lola",
      sociable: null,
    });
    expect("sociable" in perro).toBe(false);
    expect(perro.sociable).toBeUndefined();
  });

  it("canoniza los instantes", () => {
    const r = aEntidad<{ creadoEn: string }>({
      creado_en: "2026-09-21T15:00:00+00:00",
    });
    expect(r.creadoEn).toBe("2026-09-21T15:00:00.000Z");
  });

  it("deja los días del calendario en paz", () => {
    // Pasar "2026-09-21" por toISOString() lo correría al día anterior desde
    // cualquier zona al este de Chile.
    const r = aEntidad<{ fecha: string }>({ fecha: "2026-09-21" });
    expect(r.fecha).toBe("2026-09-21");
  });

  it("no toca un texto que solo se parece a una fecha", () => {
    const r = aEntidad<{ nota: string }>({ nota: "llegó 2026-09-21 tarde" });
    expect(r.nota).toBe("llegó 2026-09-21 tarde");
  });

  it("ordena bien dos instantes guardados con distinto formato", () => {
    const antes = aEntidad<{ creadoEn: string }>({
      creado_en: "2026-09-21T10:00:00+00:00",
    }).creadoEn;
    const despues = aEntidad<{ creadoEn: string }>({
      creado_en: "2026-09-21T12:00:00.000Z",
    }).creadoEn;
    expect([despues, antes].sort()).toEqual([antes, despues]);
  });
});

describe("de la entidad a la fila", () => {
  it("manda null donde el campo está presente y vacío", () => {
    // Borrar la nota es un cambio, no una omisión.
    expect(aFila({ notas: undefined })).toEqual({ notas: null });
  });

  it("no inventa columnas para los campos ausentes", () => {
    expect(aFila({ nombre: "Lola" })).toEqual({ nombre: "Lola" });
  });

  it("deja pasar los objetos tal cual, que van a jsonb", () => {
    const alimentacion = { unidad: "taza", raciones: [{ cantidad: 0.5 }] };
    expect(aFila({ alimentacion })).toEqual({ alimentacion });
  });
});
