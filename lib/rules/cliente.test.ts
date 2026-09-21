import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import { crearPlanComprado } from "./planes";
import { esClienteActivo } from "./cliente";

const HOY = "2026-06-15";

const planVigente = crearPlanComprado({
  id: "pl1",
  clienteId: "c1",
  perroId: "p1",
  tipo: "dias",
  dias: 20,
  compradoEn: instanteEnHora("2026-06-01", "10:00"),
});

describe("esClienteActivo", () => {
  it("con plan vigente es activo", () => {
    expect(esClienteActivo({ planes: [planVigente], fecha: HOY })).toBe(true);
  });

  it("con plan agotado no basta el plan", () => {
    const agotado = { ...planVigente, diasUsados: 20 };
    expect(esClienteActivo({ planes: [agotado], fecha: HOY })).toBe(false);
  });

  it("con una estadía de los últimos 30 días es activo", () => {
    expect(
      esClienteActivo({ planes: [], ultimaEstadia: "2026-05-20", fecha: HOY }),
    ).toBe(true);
  });

  it("30 días justos todavía cuentan", () => {
    expect(
      esClienteActivo({ planes: [], ultimaEstadia: "2026-05-16", fecha: HOY }),
    ).toBe(true);
  });

  it("más de 30 días sin venir deja de ser activo", () => {
    expect(
      esClienteActivo({ planes: [], ultimaEstadia: "2026-05-01", fecha: HOY }),
    ).toBe(false);
  });

  it("sin plan ni estadías no es activo", () => {
    expect(esClienteActivo({ planes: [], fecha: HOY })).toBe(false);
  });
});
