import { describe, expect, it } from "vitest";
import {
  configuracionPorDefecto,
  reparosDeAlta,
  revisarAltaDePerro,
  vacunasVencidas,
  type BorradorDePerro,
} from "@/lib/rules/alta-perro";
import { NEGOCIO } from "@/lib/config/negocio";
import type { Configuracion } from "@/lib/types";

const HOY = "2026-09-28";

/**
 * La configuración con todo exigido.
 *
 * Se escribe acá y no se toma de `configuracionPorDefecto()` a propósito: la
 * lista por defecto va creciendo a medida que el formulario aprende a pedir
 * cada campo, y estos tests son sobre la regla, no sobre ese calendario.
 */
const CONFIG: Configuracion = {
  ...configuracionPorDefecto("2026-09-01T12:00:00.000Z"),
  vacunasObligatorias: ["octuple", "antirrabica", "kc"],
  camposObligatorios: [
    "fechaNacimiento",
    "foto",
    "carnetVacunas",
    "alimentacion",
    "antiparasitario",
  ],
};

/** Una ficha que pasa todo, para ir sacándole cosas. */
function completo(cambios: Partial<BorradorDePerro> = {}): BorradorDePerro {
  return {
    nombre: "Pelusa",
    raza: "Quiltro",
    pesoKg: 9,
    sexo: "hembra",
    esterilizado: true,
    fechaNacimiento: "2022-03-10",
    fotoUrl: "data:image/jpeg;base64,aG9sYQ==",
    carnetVacunasUrls: ["data:image/jpeg;base64,aG9sYQ=="],
    vacunas: [
      { tipo: "octuple", fechaAplicacion: "2026-06-01" },
      { tipo: "antirrabica", fechaAplicacion: "2026-06-01" },
      { tipo: "kc", fechaAplicacion: "2026-06-01" },
    ],
    antiparasitario: { ultimaAplicacion: "2026-09-01", mesesDeDuracion: 1 },
    alimentacion: {
      marca: "Proplan",
      cantidad: 1,
      unidad: "taza",
      comidas: ["almuerzo"],
    },
    ...cambios,
  };
}

const campos = (borrador: BorradorDePerro, configuracion = CONFIG) =>
  revisarAltaDePerro(borrador, configuracion, HOY).map((f) => f.campo);

describe("revisarAltaDePerro", () => {
  it("no encuentra nada que falte en una ficha completa", () => {
    expect(revisarAltaDePerro(completo(), CONFIG, HOY)).toEqual([]);
  });

  it("exige elegir si está castrado: no hay valor por defecto", () => {
    expect(campos(completo({ esterilizado: undefined }))).toContain(
      "esterilizado",
    );
    // Decir que NO está castrado es una respuesta, no un campo vacío.
    expect(campos(completo({ esterilizado: false }))).not.toContain(
      "esterilizado",
    );
  });

  it("pide los datos básicos", () => {
    expect(
      campos({ nombre: "", raza: "", pesoKg: 0, alimentacion: undefined }),
    ).toEqual(
      expect.arrayContaining(["nombre", "raza", "pesoKg", "sexo", "esterilizado"]),
    );
  });

  it("no acepta una fecha de nacimiento futura", () => {
    expect(campos(completo({ fechaNacimiento: "2027-01-01" }))).toContain(
      "fechaNacimiento",
    );
  });

  it("pide las hojas del carnet y la foto del perro", () => {
    expect(campos(completo({ carnetVacunasUrls: [] }))).toContain(
      "carnetVacunasUrls",
    );
    expect(campos(completo({ fotoUrl: undefined }))).toContain("fotoUrl");
  });

  it("pide cuándo se puso cada vacuna obligatoria, por su nombre", () => {
    const faltan = revisarAltaDePerro(
      completo({ vacunas: [{ tipo: "octuple", fechaAplicacion: "2026-06-01" }] }),
      CONFIG,
      HOY,
    );

    expect(faltan.map((f) => f.campo)).toEqual([
      "vacuna-antirrabica",
      "vacuna-kc",
    ]);
    expect(faltan[0].mensaje).toContain("antirrábica");
    expect(faltan[0].mensaje).toContain("pusieron");
  });

  it("no acepta una vacuna con fecha futura", () => {
    expect(
      campos(
        completo({ vacunas: [{ tipo: "octuple", fechaAplicacion: "2027-01-01" }] }),
      ),
    ).toContain("vacuna-octuple");
  });

  it("la comida está incompleta si le falta cualquiera de los tres datos", () => {
    const base = { marca: "Proplan", cantidad: 1, unidad: "taza" as const };

    expect(campos(completo({ alimentacion: { ...base, comidas: [] } }))).toContain(
      "alimentacion",
    );
    expect(
      campos(completo({ alimentacion: { ...base, marca: "", comidas: ["cena"] } })),
    ).toContain("alimentacion");
    expect(
      campos(
        completo({
          alimentacion: { marca: "Proplan", comidas: ["cena"] },
        }),
      ),
    ).toContain("alimentacion");
  });
});

describe("la configuración de fábrica", () => {
  it("solo exige campos que el formulario sabe pedir", () => {
    const config = configuracionPorDefecto();
    const pide = (campo: string) => config.camposObligatorios.includes(campo as never);

    // Exigir algo que no se puede llenar deja el alta trancada sin explicación.
    expect(pide("foto")).toBe(true);
    expect(config.vacunasObligatorias).toEqual(["octuple", "antirrabica", "kc"]);
  });
});

describe("lo que Administración decide", () => {
  const sinExigencias: Configuracion = {
    ...configuracionPorDefecto("2026-09-01T12:00:00.000Z"),
    vacunasObligatorias: [],
    camposObligatorios: [],
  };

  it("sin exigencias, basta con los datos básicos", () => {
    expect(
      revisarAltaDePerro(
        { nombre: "Pelusa", raza: "Quiltro", pesoKg: 9, sexo: "hembra", esterilizado: true },
        sinExigencias,
        HOY,
      ),
    ).toEqual([]);
  });

  it("agregar un campo obligatorio lo hace aparecer", () => {
    expect(
      campos(completo({ carnetVacunasUrls: [] }), {
        ...sinExigencias,
        camposObligatorios: ["carnetVacunas"],
      }),
    ).toEqual(["carnetVacunasUrls"]);
  });

  it("exigir una sola vacuna deja pasar las otras dos", () => {
    expect(
      campos(completo({ vacunas: [] }), {
        ...sinExigencias,
        vacunasObligatorias: ["antirrabica"],
      }),
    ).toEqual(["vacuna-antirrabica"]);
  });
});

describe("reparosDeAlta", () => {
  const reparos = (borrador: BorradorDePerro) =>
    reparosDeAlta(borrador, CONFIG, HOY);

  it("una ficha sana no tiene reparos", () => {
    expect(reparos(completo())).toEqual([]);
  });

  it("el peso de más bloquea", () => {
    const [reparo] = reparos(completo({ pesoKg: 25 }));

    expect(reparo.bloquea).toBe(true);
    expect(reparo.mensaje).toContain(`${NEGOCIO.admision.pesoMaximoKg} kg`);
  });

  it("un macho sin castrar de más de 7 meses bloquea", () => {
    const [reparo] = reparos(
      completo({ sexo: "macho", esterilizado: false, fechaNacimiento: "2024-01-01" }),
    );

    expect(reparo.bloquea).toBe(true);
    expect(reparo.mensaje).toContain("castrados");
  });

  it("pero un cachorro de cuatro meses no", () => {
    expect(
      reparos(
        completo({
          sexo: "macho",
          esterilizado: false,
          fechaNacimiento: "2026-05-28",
        }),
      ),
    ).toEqual([]);
  });

  it("una hembra sin castrar nunca es un reparo", () => {
    expect(
      reparos(completo({ sexo: "hembra", esterilizado: false })),
    ).toEqual([]);
  });

  it("una vacuna vencida avisa, pero no bloquea: tiene vuelta", () => {
    const [reparo] = reparos(
      completo({ vacunas: [{ tipo: "octuple", fechaAplicacion: "2024-01-01" }] }),
    );

    expect(reparo.bloquea).toBe(false);
    expect(reparo.mensaje).toContain("óctuple");
    expect(reparo.mensaje).toContain("vencida");
  });
});

describe("vacunasVencidas", () => {
  it("compara contra la duración que configuró Administración", () => {
    const puestaHace13Meses = {
      vacunas: [{ tipo: "octuple" as const, fechaAplicacion: "2025-08-01" }],
    };

    // Con 12 meses de duración está vencida…
    expect(vacunasVencidas(puestaHace13Meses, CONFIG, HOY)).toEqual(["octuple"]);

    // …y con 24 no.
    expect(
      vacunasVencidas(
        puestaHace13Meses,
        {
          ...CONFIG,
          duracionVacunasMeses: { ...CONFIG.duracionVacunasMeses, octuple: 24 },
        },
        HOY,
      ),
    ).toEqual([]);
  });

  it("una vacuna que no declaró no cuenta como vencida", () => {
    expect(vacunasVencidas({ vacunas: [] }, CONFIG, HOY)).toEqual([]);
  });
});
