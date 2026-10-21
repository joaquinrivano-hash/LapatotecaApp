import { describe, expect, it } from "vitest";
import { borradorDesde, leerEntero, revisarProducto } from "@/lib/rules/producto";

const BASE = {
  ...borradorDesde(),
  nombre: "Snack de pollo",
  precio: "4.500",
  stock: "12",
};

describe("leerEntero", () => {
  it("lee los montos como se escriben en Chile", () => {
    expect(leerEntero("18.000")).toBe(18_000);
    expect(leerEntero("$18.000")).toBe(18_000);
    expect(leerEntero("18000")).toBe(18_000);
    expect(leerEntero(" 0 ")).toBe(0);
  });

  it("rechaza decimales y texto", () => {
    expect(leerEntero("18,5")).toBeUndefined();
    expect(leerEntero("-3")).toBeUndefined();
    expect(leerEntero("diez")).toBeUndefined();
    expect(leerEntero("")).toBeUndefined();
  });
});

describe("revisarProducto", () => {
  it("un producto completo sale listo para guardar", () => {
    const { datos, errores } = revisarProducto(BASE);
    expect(errores).toEqual({});
    expect(datos).toMatchObject({ nombre: "Snack de pollo", precio: 4_500, stock: 12 });
  });

  it("sin nombre no se guarda", () => {
    expect(revisarProducto({ ...BASE, nombre: "  " }).errores.nombre).toBeDefined();
  });

  it("el precio tiene que ser mayor que cero", () => {
    expect(revisarProducto({ ...BASE, precio: "0" }).errores.precio).toBeDefined();
    expect(revisarProducto({ ...BASE, precio: "" }).errores.precio).toBeDefined();
  });

  it("el stock puede ser cero: es un producto agotado", () => {
    expect(revisarProducto({ ...BASE, stock: "0" }).datos?.stock).toBe(0);
  });
});
