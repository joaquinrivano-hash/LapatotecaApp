import { describe, expect, it } from "vitest";
import { PRECIOS } from "@/lib/config/precios";
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
    expect(cotizarSpa({ pesoKg: 8, nivel: "peloCorto" }).total).toBe(18_000);
    expect(cotizarSpa({ pesoKg: 15, nivel: "peloCorto" }).total).toBe(25_000);
  });

  it("el pelo largo cuesta más, en los dos tamaños", () => {
    expect(cotizarSpa({ pesoKg: 8, nivel: "peloLargo" }).total).toBe(24_000);
    expect(cotizarSpa({ pesoKg: 15, nivel: "peloLargo" }).total).toBe(30_000);
  });

  it("los valores del afiche son finales: no hay descuento de cliente", () => {
    // El 20% existía solo en el premium porque el express era un precio de
    // entrada, y ese par dejó de existir.
    expect(cotizarSpa({ pesoKg: 15, nivel: "peloLargo" }).total).toBe(30_000);
  });

  it("pero el segundo perro sí descuenta: es de la casa, no del afiche", () => {
    expect(
      cotizarSpa({ pesoKg: 15, nivel: "peloLargo", indicePerro: 1 }).total,
    ).toBe(24_000);
  });
});

describe("cotizarPaseo", () => {
  it("cobra por tramo de quince minutos", () => {
    expect(cotizarPaseo({ duracionMin: 15 }).total).toBe(2_000);
    expect(cotizarPaseo({ duracionMin: 30 }).total).toBe(4_000);
  });

  it("cada tres entra la promo del flyer", () => {
    expect(cotizarPaseo({ duracionMin: 15, cantidad: 3 }).total).toBe(5_000);
    expect(cotizarPaseo({ duracionMin: 30, cantidad: 3 }).total).toBe(10_000);
  });

  it("lo que sobra del pack se cobra suelto", () => {
    // Cinco de 15 min: un pack de tres (5.000) y dos sueltos (4.000).
    const c = cotizarPaseo({ duracionMin: 15, cantidad: 5 });
    expect(c.total).toBe(9_000);
    expect(c.lineas).toHaveLength(2);
  });

  it("dos packs son dos packs, no uno grande", () => {
    expect(cotizarPaseo({ duracionMin: 15, cantidad: 6 }).total).toBe(10_000);
  });

  it("la promo nunca sale más cara que comprarlos sueltos", () => {
    for (const duracionMin of [15, 30] as const) {
      for (let cantidad = 1; cantidad <= 12; cantidad++) {
        const conPromo = cotizarPaseo({ duracionMin, cantidad }).total;
        const sueltos = cantidad * PRECIOS.paseo[duracionMin];
        expect(conPromo).toBeLessThanOrEqual(sueltos);
      }
    }
  });

  it("dice cuánto se ahorra: en un total no se ve", () => {
    const c = cotizarPaseo({ duracionMin: 30, cantidad: 3 });
    const promo = c.lineas.find((l) => l.concepto.startsWith("Promo"));
    expect(promo!.detalle).toContain("ahorras");
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


  it("ida y vuelta son dos viajes del mismo tramo", () => {
    const ida = cotizarTraslado({ km: 3, fechaHora: "2026-09-28T14:00:00.000Z" });
    const vuelta = cotizarTraslado({
      km: 3,
      fechaHora: "2026-09-28T14:00:00.000Z",
      conRegreso: true,
    });

    expect(vuelta.total).toBe(ida.total * 2);
    expect(vuelta.lineas[0].concepto).toBe("Traslado ida y vuelta");
  });

  it("los traslados no tienen descuento de cliente", () => {
    expect(cotizarTraslado({ km: 3, fechaHora: en("13:00") }).descuentos).toEqual(
      [],
    );
  });
});
