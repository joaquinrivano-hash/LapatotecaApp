import { describe, expect, it } from "vitest";
import { PRECIOS } from "@/lib/config/precios";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  calcularAbono,
  calcularDevolucion,
  calcularPrecioHotel,
  descuentoPorDuracion,
  desglosarEstadiaHotel,
} from "./precio-hotel";

// Junio: fuera del horario de verano chileno, para que los tests no dependan
// del cambio de hora.
const en = (dia: string, hora: string) => instanteEnHora(`2026-06-${dia}`, hora);

describe("desglosarEstadiaHotel", () => {
  it("cuenta bloques completos de 24 h", () => {
    const d = desglosarEstadiaHotel(en("15", "10:00"), en("18", "10:00"));
    expect(d.bloques).toBe(3);
    expect(d.horasSobrantes).toBe(0);
    expect(d.horasExtraCobradas).toBe(0);
  });

  it("perdona las primeras 2 horas de atraso", () => {
    const d = desglosarEstadiaHotel(en("15", "10:00"), en("18", "12:00"));
    expect(d.horasSobrantes).toBe(2);
    expect(d.horasExtraCobradas).toBe(0);
  });

  it("cobra por hora iniciada apenas se pasa la tolerancia", () => {
    const d = desglosarEstadiaHotel(en("15", "10:00"), en("18", "12:01"));
    expect(d.horasExtraCobradas).toBe(1);
  });

  it("descuenta la tolerancia de las horas cobradas", () => {
    // 5 horas de atraso: se cobran 3.
    const d = desglosarEstadiaHotel(en("15", "10:00"), en("18", "15:00"));
    expect(d.horasSobrantes).toBe(5);
    expect(d.horasExtraCobradas).toBe(3);
  });
});

describe("calcularPrecioHotel", () => {
  it("cobra $24.000 por cada bloque de 24 h", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("18", "10:00"),
    });
    expect(c.total).toBe(72_000);
  });

  it("suma las horas extra después de la tolerancia", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("18", "15:00"),
    });
    expect(c.total).toBe(75_000);
    expect(c.lineas.map((l) => l.concepto)).toContain("Horas adicionales");
  });

  it("alargarse nunca cuesta más que reservar otra noche", () => {
    // 1 bloque + 23 h de atraso: el recargo tope (22 h) sigue bajo un bloque.
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("17", "09:00"),
    });
    const extra = c.lineas.find((l) => l.concepto === "Horas adicionales");
    expect(extra!.monto).toBeLessThan(PRECIOS.hotel.bloque24h);
  });

  it("cobra los paseos contratados", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("18", "10:00"),
      paseosContratados: 2,
    });
    expect(c.total).toBe(80_000);
  });

  it("calcula el abono del 30%", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("18", "10:00"),
    });
    expect(c.abono).toBe(21_600);
  });

  it("una estadía de pocas horas paga igual una noche completa", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("15", "13:00"),
    });
    expect(c.total).toBe(24_000);
    expect(c.lineas.map((l) => l.concepto)).not.toContain("Horas adicionales");
  });

  it("dentro del primer bloque la tolerancia no inventa horas extra", () => {
    // 25 h: un bloque más una hora, que cae dentro de la tolerancia.
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("16", "11:00"),
    });
    expect(c.total).toBe(24_000);
  });

  it("pasado el primer bloque y la tolerancia, cobra las horas", () => {
    const c = calcularPrecioHotel({
      inicio: en("15", "10:00"),
      fin: en("16", "13:00"),
    });
    expect(c.total).toBe(25_000);
  });
});

describe("descuentos por duración", () => {
  it("7 días exactos no alcanzan el descuento: el umbral es estricto", () => {
    expect(descuentoPorDuracion(7)).toBeNull();
    const c = calcularPrecioHotel({
      inicio: en("01", "10:00"),
      fin: en("08", "10:00"),
    });
    expect(c.descuentos).toEqual([]);
    expect(c.total).toBe(168_000);
  });

  it("sobre 7 días descuenta 10%", () => {
    const c = calcularPrecioHotel({
      inicio: en("01", "10:00"),
      fin: en("09", "10:00"),
    });
    expect(c.subtotal).toBe(192_000);
    expect(c.total).toBe(172_800);
  });

  it("sobre 14 días descuenta 15% y reemplaza al de 10%", () => {
    const c = calcularPrecioHotel({
      inicio: en("01", "10:00"),
      fin: en("16", "10:00"),
    });
    expect(c.descuentos).toHaveLength(1);
    expect(c.subtotal).toBe(360_000);
    expect(c.total).toBe(306_000);
  });

  it("el segundo perro encadena su 20% sobre el precio ya descontado", () => {
    const c = calcularPrecioHotel({
      inicio: en("01", "10:00"),
      fin: en("16", "10:00"),
      indicePerro: 1,
    });
    expect(c.descuentos.map((d) => d.monto)).toEqual([54_000, 61_200]);
    expect(c.total).toBe(244_800);
  });
});

describe("calcularAbono", () => {
  it("es el 30% redondeado al peso", () => {
    expect(calcularAbono(75_000)).toBe(22_500);
    expect(calcularAbono(13_333)).toBe(4_000);
  });
});

describe("calcularDevolucion", () => {
  it("devuelve el abono completo con 48 h o más de aviso", () => {
    const r = calcularDevolucion(en("20", "10:00"), en("18", "10:00"), 21_600);
    expect(r.devuelve).toBe(true);
    expect(r.monto).toBe(21_600);
  });

  it("48 horas justas alcanzan", () => {
    const r = calcularDevolucion(en("20", "10:00"), en("18", "10:00"), 10_000);
    expect(r.horasDeAviso).toBe(48);
    expect(r.devuelve).toBe(true);
  });

  it("no devuelve nada con menos de 48 h", () => {
    const r = calcularDevolucion(en("20", "10:00"), en("19", "10:00"), 21_600);
    expect(r.devuelve).toBe(false);
    expect(r.monto).toBe(0);
  });

  it("tampoco devuelve si la estadía ya empezó", () => {
    const r = calcularDevolucion(en("20", "10:00"), en("21", "10:00"), 21_600);
    expect(r.devuelve).toBe(false);
    expect(r.motivo).toContain("ya había empezado");
  });
});
