import { describe, expect, it } from "vitest";
import {
  comunaDe,
  conDepto,
  leerDireccion,
} from "@/lib/integraciones/direcciones/componentes";
import type { ComponenteDireccion } from "@/lib/integraciones/direcciones/tipos";

function c(texto: string, ...types: string[]): ComponenteDireccion {
  return { longText: texto, shortText: texto, types };
}

const MANUEL_MONTT: ComponenteDireccion[] = [
  c("1234", "street_number"),
  c("Avenida Manuel Montt", "route"),
  c("Providencia", "locality", "political"),
  c("Providencia", "administrative_area_level_3", "political"),
  c("Santiago", "administrative_area_level_2", "political"),
  c("Región Metropolitana", "administrative_area_level_1", "political"),
  c("Chile", "country", "political"),
];

describe("comunaDe", () => {
  it("toma el nivel 3, que en Chile es la comuna", () => {
    expect(comunaDe(MANUEL_MONTT)).toBe("Providencia");
  });

  it("prefiere el nivel 3 cuando la localidad dice otra cosa", () => {
    expect(
      comunaDe([
        c("Santiago", "locality"),
        c("Ñuñoa", "administrative_area_level_3"),
      ]),
    ).toBe("Ñuñoa");
  });

  it("cae a la localidad si no viene el nivel 3", () => {
    expect(comunaDe([c("Las Condes", "locality")])).toBe("Las Condes");
  });

  it("devuelve vacío si no hay con qué", () => {
    expect(comunaDe([c("Chile", "country")])).toBe("");
  });
});

describe("leerDireccion", () => {
  it("arma calle y número, y saca la comuna", () => {
    expect(leerDireccion(MANUEL_MONTT, "Av. Manuel Montt 1234, Providencia")).toEqual({
      direccion: "Avenida Manuel Montt 1234",
      comuna: "Providencia",
      tieneNumero: true,
    });
  });

  it("marca la calle sin número", () => {
    const sinNumero = MANUEL_MONTT.filter(
      (x) => !x.types.includes("street_number"),
    );
    const leida = leerDireccion(sinNumero, "Av. Manuel Montt, Providencia");
    expect(leida.tieneNumero).toBe(false);
    expect(leida.direccion).toBe("Avenida Manuel Montt");
  });

  it("sin calle usa el primer tramo del texto completo", () => {
    expect(
      leerDireccion(
        [c("Providencia", "administrative_area_level_3")],
        "Costanera Center, Providencia, Chile",
      ).direccion,
    ).toBe("Costanera Center");
  });
});

describe("conDepto", () => {
  it("agrega 'depto' cuando escribió solo el número", () => {
    expect(conDepto("Av. Italia 1500", "402")).toBe(
      "Av. Italia 1500, depto 402",
    );
  });

  it("respeta lo que escribió con palabra", () => {
    expect(conDepto("Av. Italia 1500", "casa B")).toBe(
      "Av. Italia 1500, casa B",
    );
  });

  it("sin depto deja la dirección como está", () => {
    expect(conDepto("Av. Italia 1500", "  ")).toBe("Av. Italia 1500");
  });
});
