import { describe, expect, it } from "vitest";
import { aE164, esTelefonoValido, formatearTelefono } from "./telefono";

describe("aE164", () => {
  it("acepta el formato que escribe la gente", () => {
    expect(aE164("+569 1234 5678")).toBe("+56912345678");
    expect(aE164("+56 9 1234 5678")).toBe("+56912345678");
    expect(aE164("56912345678")).toBe("+56912345678");
  });

  it("le pone el código de país al celular suelto", () => {
    expect(aE164("912345678")).toBe("+56912345678");
    expect(aE164("9 1234 5678")).toBe("+56912345678");
  });

  it("asume celular en el formato antiguo de 8 dígitos", () => {
    expect(aE164("12345678")).toBe("+56912345678");
  });

  it("ignora guiones, puntos y paréntesis", () => {
    expect(aE164("(+56) 9-1234.5678")).toBe("+56912345678");
  });

  it("rechaza lo que no es un teléfono", () => {
    expect(aE164("")).toBeNull();
    expect(aE164("no tengo")).toBeNull();
    expect(aE164("123")).toBeNull();
    expect(esTelefonoValido("123")).toBe(false);
  });
});

describe("formatearTelefono", () => {
  it("lo muestra legible", () => {
    expect(formatearTelefono("+56912345678")).toBe("+569 1234 5678");
  });

  it("deja tal cual lo que no puede normalizar", () => {
    expect(formatearTelefono("no tengo")).toBe("no tengo");
  });
});
