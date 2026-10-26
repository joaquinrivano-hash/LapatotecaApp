import { describe, expect, it } from "vitest";
import {
  describirDondeFicho,
  dondeFicho,
  formatearDistancia,
  metrosEntre,
} from "@/lib/rules/ubicacion";

const CASA = { lat: -33.4436, lng: -70.6189 };
// Un milésimo de grado de latitud son 111 metros.
const alNorte = (metros: number) => ({
  lat: CASA.lat + metros / 111_195,
  lng: CASA.lng,
});

describe("metrosEntre", () => {
  it("el mismo punto está a cero", () => {
    expect(metrosEntre(CASA, CASA)).toBe(0);
  });

  it("un milésimo de grado de latitud son unos 111 metros", () => {
    expect(metrosEntre(CASA, { lat: CASA.lat + 0.001, lng: CASA.lng })).toBeCloseTo(
      111.2,
      0,
    );
  });

  it("de la casa al centro de Santiago son unos 3 km", () => {
    const plazaDeArmas = { lat: -33.4378, lng: -70.6505 };
    const km = metrosEntre(CASA, plazaDeArmas) / 1000;
    expect(km).toBeGreaterThan(2.9);
    expect(km).toBeLessThan(3.1);
  });
});

describe("dondeFicho", () => {
  const con = (metros: number, precisionM: number) => ({
    ...alNorte(metros),
    precisionM,
  });

  it("cerca y con buena precisión es en la casa", () => {
    expect(dondeFicho(con(40, 20), CASA, 150, 150).tipo).toBe("en_la_casa");
  });

  // Adentro de una casa el GPS se corre: al borde del radio todavía cuenta.
  it("justo en el borde del radio todavía es en la casa", () => {
    expect(dondeFicho(con(150, 10), CASA, 150, 150).tipo).toBe("en_la_casa");
  });

  it("a 3 km con buena precisión es lejos", () => {
    const donde = dondeFicho(con(3000, 15), CASA, 150, 150);
    expect(donde.tipo).toBe("lejos");
    expect(donde.tipo === "lejos" && Math.round(donde.metros)).toBe(3000);
  });

  // Un GPS movido no puede acusar a nadie de fichar en la calle: a 280 m
  // con ±140 m la persona puede estar en la puerta.
  it("no acusa de lejos si el error alcanza a la casa", () => {
    expect(dondeFicho(con(280, 140), CASA, 150, 150).tipo).toBe("en_la_casa");
  });

  it("lejos igual aunque sea impreciso, si ni el error alcanza", () => {
    expect(dondeFicho(con(5000, 1000), CASA, 150, 150).tipo).toBe("lejos");
  });

  // Con ±2 km cualquier punto del barrio calza: eso no dice nada.
  it("cerca pero con un error enorme es imprecisa", () => {
    expect(dondeFicho(con(100, 2000), CASA, 150, 150).tipo).toBe("imprecisa");
  });

  it("sin ubicación conserva el motivo", () => {
    expect(dondeFicho({ sinUbicacion: "permiso" }, CASA)).toEqual({
      tipo: "sin_ubicacion",
      motivo: "permiso",
    });
  });
});

describe("formatearDistancia", () => {
  it("en metros, redondeado a la decena", () => {
    expect(formatearDistancia(452)).toBe("450 m");
  });

  it("nunca dice cero metros", () => {
    expect(formatearDistancia(2)).toBe("10 m");
  });

  it("desde un kilómetro, en km con coma", () => {
    expect(formatearDistancia(2345)).toBe("2,3 km");
  });

  it("sin decimal cuando es redondo", () => {
    expect(formatearDistancia(3000)).toBe("3 km");
  });
});

describe("describirDondeFicho", () => {
  it("en la casa", () => {
    expect(
      describirDondeFicho({ tipo: "en_la_casa", metros: 30, precisionM: 15 }),
    ).toBe("en la casa");
  });

  it("lejos, con la distancia", () => {
    expect(
      describirDondeFicho({ tipo: "lejos", metros: 2345, precisionM: 15 }),
    ).toBe("a 2,3 km de la casa");
  });

  // Con un error grande el número solo no alcanza: hay que saber cuánto
  // creerle.
  it("lejos con un error grande lo dice", () => {
    expect(
      describirDondeFicho({ tipo: "lejos", metros: 5000, precisionM: 1000 }),
    ).toBe("a 5 km de la casa (±1 km)");
  });

  it("sin ubicación, con el motivo en palabras", () => {
    expect(
      describirDondeFicho({ tipo: "sin_ubicacion", motivo: "permiso" }),
    ).toBe("sin ubicación: el celular no dio permiso");
  });
});
