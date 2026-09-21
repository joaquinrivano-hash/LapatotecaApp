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
  it("bajo 10 kg es pequeño", () => {
    expect(tamanoSpa(8)).toBe("chico");
    expect(tamanoSpa(9.9)).toBe("chico");
  });

  it("desde 10 kg es mediano", () => {
    expect(tamanoSpa(10)).toBe("grande");
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

  it("el descuento a clientes es SOLO del baño premium", () => {
    expect(
      cotizarSpa({ pesoKg: 15, nivel: "express", esClienteActivo: true }).total,
    ).toBe(18_000);
    expect(
      cotizarSpa({ pesoKg: 15, nivel: "premium", esClienteActivo: true }).total,
    ).toBe(24_000);
  });

  it("encadena segundo perro y cliente activo en el premium", () => {
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
  it("reconoce la punta de la mañana: de 7 a 9", () => {
    expect(esHorarioPunta(en("07:00"))).toBe(true);
    expect(esHorarioPunta(en("08:30"))).toBe(true);
    expect(esHorarioPunta(en("08:59"))).toBe(true);
  });

  it("el fin del tramo ya no es punta", () => {
    expect(esHorarioPunta(en("09:00"))).toBe(false);
    expect(esHorarioPunta(en("20:00"))).toBe(false);
  });

  it("reconoce la punta de la tarde: de 17 a 20", () => {
    expect(esHorarioPunta(en("17:00"))).toBe(true);
    expect(esHorarioPunta(en("19:45"))).toBe(true);
  });

  it("el mediodía no es punta", () => {
    expect(esHorarioPunta(en("13:00"))).toBe(false);
  });
});

describe("cotizarTraslado", () => {
  it("cobra el tramo de 0 a 5 km", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("13:00") }).total).toBe(8_000);
    expect(cotizarTraslado({ km: 5, fechaHora: en("13:00") }).total).toBe(8_000);
  });

  it("cobra el tramo de 5 a 10 km", () => {
    expect(cotizarTraslado({ km: 5.2, fechaHora: en("13:00") }).total).toBe(
      12_000,
    );
    expect(cotizarTraslado({ km: 10, fechaHora: en("13:00") }).total).toBe(
      12_000,
    );
  });

  it("el horario punta tiene su propia tarifa, no un recargo", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("08:00") }).total).toBe(
      10_000,
    );
    expect(cotizarTraslado({ km: 8, fechaHora: en("18:30") }).total).toBe(
      15_000,
    );
  });

  it("más lejos del último tramo se cobra ese tramo", () => {
    // El folleto solo llega a 10 km: más allá se cotiza aparte, pero la app
    // no puede quedarse sin precio.
    expect(cotizarTraslado({ km: 20, fechaHora: en("13:00") }).total).toBe(
      12_000,
    );
  });

  it("el desglose siempre suma el total", () => {
    const c = cotizarTraslado({ km: 8, fechaHora: en("18:30") });
    expect(c.lineas.reduce((s, l) => s + l.monto, 0)).toBe(c.total);
  });

  it("los traslados no tienen descuento de cliente", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("13:00") }).descuentos).toEqual(
      [],
    );
  });
});
