import { describe, expect, it } from "vitest";
import { formatearCLP, formatearMonto, formatearPorcentaje } from "./moneda";

describe("formatearCLP", () => {
  it("usa punto de miles y no muestra decimales", () => {
    expect(formatearCLP(18_000)).toBe("$18.000");
    expect(formatearCLP(200_000)).toBe("$200.000");
    expect(formatearCLP(0)).toBe("$0");
  });

  it("redondea al peso", () => {
    expect(formatearCLP(172_799.6)).toBe("$172.800");
  });

  it("formatea montos negativos (descuentos)", () => {
    expect(formatearCLP(-5_000)).toBe("-$5.000");
  });
});

describe("formatearMonto", () => {
  it("omite el signo para tablas y ejes", () => {
    expect(formatearMonto(18_000)).toBe("18.000");
  });
});

describe("formatearPorcentaje", () => {
  it("muestra la fracción como porcentaje", () => {
    expect(formatearPorcentaje(0.15)).toBe("15%");
    expect(formatearPorcentaje(0.2)).toBe("20%");
  });
});
