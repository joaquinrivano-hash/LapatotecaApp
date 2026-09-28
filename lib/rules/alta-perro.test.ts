import { describe, expect, it } from "vitest";
import {
  configuracionPorDefecto,
  revisarAltaDePerro,
  type BorradorDePerro,
} from "@/lib/rules/alta-perro";
import type { ConfiguracionAdmision } from "@/lib/types";

const HOY = "2026-09-28";

/**
 * La configuración con todo exigido.
 *
 * Se escribe acá y no se toma de `configuracionPorDefecto()` a propósito: la
 * lista por defecto va creciendo a medida que el formulario aprende a pedir
 * cada campo, y estos tests son sobre la regla, no sobre ese calendario.
 */
const CONFIG: ConfiguracionAdmision = {
  vacunasObligatorias: ["octuple", "antirrabica", "kc"],
  camposObligatorios: [
    "fechaNacimiento",
    "foto",
    "carnetVacunas",
    "alimentacion",
    "antiparasitario",
  ],
  actualizadoEn: "2026-09-01T12:00:00.000Z",
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
    carnetVacunasUrl: "data:image/jpeg;base64,aG9sYQ==",
    vacunas: [
      { tipo: "octuple", fechaVencimiento: "2027-01-01" },
      { tipo: "antirrabica", fechaVencimiento: "2027-01-01" },
      { tipo: "kc", fechaVencimiento: "2027-01-01" },
    ],
    antiparasitario: { ultimaAplicacion: "2026-09-01", periodicidad: "mensual" },
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

  it("pide la foto del carnet y la del perro", () => {
    expect(campos(completo({ carnetVacunasUrl: undefined }))).toContain(
      "carnetVacunasUrl",
    );
    expect(campos(completo({ fotoUrl: undefined }))).toContain("fotoUrl");
  });

  it("pide el vencimiento de cada vacuna obligatoria, por su nombre", () => {
    const faltan = revisarAltaDePerro(
      completo({ vacunas: [{ tipo: "octuple", fechaVencimiento: "2027-01-01" }] }),
      CONFIG,
      HOY,
    );

    expect(faltan.map((f) => f.campo)).toEqual([
      "vacuna-antirrabica",
      "vacuna-kc",
    ]);
    expect(faltan[0].mensaje).toContain("antirrábica");
  });

  it("con 'otro' período, pide los días", () => {
    expect(
      campos(
        completo({
          antiparasitario: { ultimaAplicacion: "2026-09-01", periodicidad: "otro" },
        }),
      ),
    ).toContain("antiparasitario");
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
  const sinExigencias: ConfiguracionAdmision = {
    vacunasObligatorias: [],
    camposObligatorios: [],
    actualizadoEn: "2026-09-01T12:00:00.000Z",
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
      campos(completo({ carnetVacunasUrl: undefined }), {
        ...sinExigencias,
        camposObligatorios: ["carnetVacunas"],
      }),
    ).toEqual(["carnetVacunasUrl"]);
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
