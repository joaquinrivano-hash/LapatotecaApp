import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  cotizarPaseo,
  cotizarSpa,
  cotizarTraslado,
  esHorarioPunta,
  tamanoSpa,
} from "./servicios";

const DIA = "2026-06-15";
const en = (hora: string) => instanteEnHora(DIA, hora);

describe("tamanoSpa", () => {
  it("hasta 10 kg es chico", () => {
    expect(tamanoSpa(8)).toBe("chico");
    expect(tamanoSpa(10)).toBe("chico");
  });

  it("sobre 10 kg es grande", () => {
    expect(tamanoSpa(10.5)).toBe("grande");
    expect(tamanoSpa(18)).toBe("grande");
  });
});

describe("cotizarSpa", () => {
  it("cobra express según el tamaño", () => {
    expect(cotizarSpa({ pesoKg: 8, nivel: "express" }).total).toBe(13_000);
    expect(cotizarSpa({ pesoKg: 15, nivel: "express" }).total).toBe(18_000);
  });

  it("cobra premium según el tamaño", () => {
    expect(cotizarSpa({ pesoKg: 8, nivel: "premium" }).total).toBe(25_000);
    expect(cotizarSpa({ pesoKg: 15, nivel: "premium" }).total).toBe(30_000);
  });

  it("descuenta 20% al cliente activo", () => {
    expect(
      cotizarSpa({ pesoKg: 15, nivel: "express", esClienteActivo: true }).total,
    ).toBe(14_400);
  });

  it("encadena segundo perro y cliente activo", () => {
    // 30.000 → -20% = 24.000 → -20% = 19.200
    const c = cotizarSpa({
      pesoKg: 15,
      nivel: "premium",
      esClienteActivo: true,
      indicePerro: 1,
    });
    expect(c.total).toBe(19_200);
  });
});

describe("cotizarPaseo", () => {
  it("cobra por duración", () => {
    expect(cotizarPaseo({ duracionMin: 30 }).total).toBe(5_000);
    expect(cotizarPaseo({ duracionMin: 60 }).total).toBe(10_000);
  });

  it("descuenta 20% al cliente activo", () => {
    expect(
      cotizarPaseo({ duracionMin: 60, esClienteActivo: true }).total,
    ).toBe(8_000);
  });
});

describe("esHorarioPunta", () => {
  it("reconoce la punta de la mañana", () => {
    expect(esHorarioPunta(en("07:00"))).toBe(true);
    expect(esHorarioPunta(en("08:30"))).toBe(true);
    expect(esHorarioPunta(en("09:29"))).toBe(true);
  });

  it("el fin del tramo ya no es punta", () => {
    expect(esHorarioPunta(en("09:30"))).toBe(false);
    expect(esHorarioPunta(en("20:00"))).toBe(false);
  });

  it("reconoce la punta de la tarde", () => {
    expect(esHorarioPunta(en("18:00"))).toBe(true);
    expect(esHorarioPunta(en("19:45"))).toBe(true);
  });

  it("el mediodía no es punta", () => {
    expect(esHorarioPunta(en("13:00"))).toBe(false);
  });
});

describe("cotizarTraslado", () => {
  it("cobra la base dentro de los km incluidos", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("13:00") }).total).toBe(8_000);
    expect(cotizarTraslado({ km: 5, fechaHora: en("13:00") }).total).toBe(8_000);
  });

  it("suma los km adicionales", () => {
    expect(cotizarTraslado({ km: 8, fechaHora: en("13:00") }).total).toBe(
      10_100,
    );
  });

  it("redondea los km hacia arriba", () => {
    expect(cotizarTraslado({ km: 5.2, fechaHora: en("13:00") }).total).toBe(
      8_700,
    );
  });

  it("recarga el horario punta", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("08:00") }).total).toBe(
      10_000,
    );
  });

  it("nunca pasa del tope de $15.000", () => {
    const c = cotizarTraslado({ km: 20, fechaHora: en("18:30") });
    expect(c.total).toBe(15_000);
    expect(c.lineas.some((l) => l.concepto === "Tope de traslado")).toBe(true);
  });

  it("el desglose siempre suma el total", () => {
    const c = cotizarTraslado({ km: 20, fechaHora: en("18:30") });
    expect(c.lineas.reduce((s, l) => s + l.monto, 0)).toBe(c.total);
  });

  it("los traslados no tienen descuento de cliente", () => {
    const c = cotizarTraslado({ km: 3, fechaHora: en("13:00") });
    expect(c.descuentos).toEqual([]);
  });
});
