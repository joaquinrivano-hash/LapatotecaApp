import { describe, expect, it } from "vitest";
import {
  aplicarDescuentos,
  construirCotizacion,
  descuentoClienteActivo,
  descuentoSegundoPerro,
  soloAplicables,
} from "./descuentos";

describe("aplicarDescuentos", () => {
  it("aplica un descuento simple", () => {
    const r = aplicarDescuentos(100_000, [{ concepto: "x", porcentaje: 0.2 }]);
    expect(r.total).toBe(80_000);
    expect(r.descuentos[0].monto).toBe(20_000);
  });

  it("encadena en cascada: el segundo se calcula sobre lo que quedó", () => {
    // 240.000 → -10% = 216.000 → -20% = 172.800 (equivale a -28%, no a -30%).
    const r = aplicarDescuentos(240_000, [
      { concepto: "Estadía larga", porcentaje: 0.1 },
      { concepto: "Segundo perro", porcentaje: 0.2 },
    ]);
    expect(r.descuentos.map((d) => d.monto)).toEqual([24_000, 43_200]);
    expect(r.total).toBe(172_800);
  });

  it("no es lo mismo que sumar los porcentajes", () => {
    const cascada = aplicarDescuentos(240_000, [
      { concepto: "a", porcentaje: 0.1 },
      { concepto: "b", porcentaje: 0.2 },
    ]);
    const sumados = 240_000 * (1 - 0.3);
    expect(cascada.total).not.toBe(sumados);
    expect(cascada.total).toBeGreaterThan(sumados);
  });

  it("ignora descuentos de 0%", () => {
    const r = aplicarDescuentos(50_000, [{ concepto: "nada", porcentaje: 0 }]);
    expect(r.descuentos).toHaveLength(0);
    expect(r.total).toBe(50_000);
  });

  it("deja los montos en pesos enteros", () => {
    const r = aplicarDescuentos(13_333, [{ concepto: "x", porcentaje: 0.2 }]);
    expect(Number.isInteger(r.total)).toBe(true);
    expect(Number.isInteger(r.descuentos[0].monto)).toBe(true);
  });
});

describe("construirCotizacion", () => {
  it("suma las líneas en el subtotal y descuenta desde ahí", () => {
    const c = construirCotizacion(
      [
        { concepto: "Alojamiento", monto: 72_000 },
        { concepto: "Paseos", monto: 8_000 },
      ],
      [{ concepto: "Segundo perro", porcentaje: 0.2 }],
    );
    expect(c.subtotal).toBe(80_000);
    expect(c.total).toBe(64_000);
  });

  it("sin descuentos, el total es el subtotal", () => {
    const c = construirCotizacion([{ concepto: "Jardín", monto: 18_000 }]);
    expect(c.total).toBe(c.subtotal);
    expect(c.descuentos).toEqual([]);
  });
});

describe("helpers de descuento", () => {
  it("el primer perro no tiene descuento y el segundo sí", () => {
    expect(descuentoSegundoPerro(0)).toBeNull();
    expect(descuentoSegundoPerro(1)?.porcentaje).toBe(0.2);
    expect(descuentoSegundoPerro(2)?.porcentaje).toBe(0.2);
  });

  it("el descuento de cliente activo solo existe si es activo", () => {
    expect(descuentoClienteActivo(false)).toBeNull();
    expect(descuentoClienteActivo(true)?.porcentaje).toBe(0.2);
  });

  it("soloAplicables filtra los nulos", () => {
    expect(
      soloAplicables([descuentoSegundoPerro(0), descuentoClienteActivo(true)]),
    ).toHaveLength(1);
  });
});
