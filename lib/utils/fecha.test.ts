import { describe, expect, it } from "vitest";
import {
  diasEntre,
  formatearDiaMesCorto,
  esFinDeSemana,
  fechaISO,
  formatearDuracion,
  formatearFecha,
  formatearFechaLarga,
  formatearHora,
  hhmmDesdeMinutos,
  horasEntre,
  instanteEn,
  instanteEnHora,
  minutosDelDia,
  rangoFechas,
  sumarDias,
} from "./fecha";

describe("fechaISO", () => {
  it("asigna el instante al día de Santiago, no al de UTC", () => {
    // 02:30 UTC del 21 son las 23:30 del 20 en Santiago: ese perro se fue ayer.
    expect(fechaISO("2026-09-21T02:30:00.000Z")).toBe("2026-09-20");
  });
});

describe("instanteEn", () => {
  it("resuelve la hora local en horario de verano (UTC-3)", () => {
    expect(instanteEn("2026-09-21", 7 * 60 + 30)).toBe(
      "2026-09-21T10:30:00.000Z",
    );
  });

  it("resuelve la hora local en horario de invierno (UTC-4)", () => {
    // Mismo 07:30 del reloj, una hora distinta en UTC. Por esto no se puede
    // hardcodear el offset.
    expect(instanteEn("2026-06-15", 7 * 60 + 30)).toBe(
      "2026-06-15T11:30:00.000Z",
    );
  });

  it("ida y vuelta: la hora escrita se lee igual", () => {
    const i = instanteEnHora("2026-06-15", "19:00");
    expect(formatearHora(i)).toBe("19:00");
    expect(minutosDelDia(i)).toBe(19 * 60);
  });
});

describe("aritmética de calendario", () => {
  it("suma días cruzando el cambio de hora sin desfase", () => {
    // El 6 de septiembre de 2026 Chile adelanta el reloj.
    expect(sumarDias("2026-09-05", 1)).toBe("2026-09-06");
    expect(sumarDias("2026-09-05", 2)).toBe("2026-09-07");
  });

  it("suma días cruzando fin de mes y de año", () => {
    expect(sumarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("cuenta días entre fechas", () => {
    expect(diasEntre("2026-09-01", "2026-09-21")).toBe(20);
    expect(diasEntre("2026-09-21", "2026-09-01")).toBe(-20);
  });

  it("arma rangos inclusivos", () => {
    expect(rangoFechas("2026-09-19", "2026-09-22")).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
    expect(rangoFechas("2026-09-19", "2026-09-19")).toEqual(["2026-09-19"]);
  });

  it("reconoce el fin de semana", () => {
    expect(esFinDeSemana("2026-09-19")).toBe(true); // sábado
    expect(esFinDeSemana("2026-09-20")).toBe(true); // domingo
    expect(esFinDeSemana("2026-09-21")).toBe(false); // lunes
  });
});

describe("horas", () => {
  it("mide la diferencia en horas entre instantes", () => {
    expect(
      horasEntre(instanteEnHora("2026-09-21", "07:30"), instanteEnHora("2026-09-21", "13:30")),
    ).toBe(6);
  });

  it("convierte minutos a HH:MM", () => {
    expect(hhmmDesdeMinutos(450)).toBe("07:30");
    expect(hhmmDesdeMinutos(19 * 60)).toBe("19:00");
  });

  it("formatea duraciones en lenguaje humano", () => {
    expect(formatearDuracion(45)).toBe("45 min");
    expect(formatearDuracion(300)).toBe("5 h");
    expect(formatearDuracion(210)).toBe("3 h 30 min");
  });
});

describe("formato para ejes", () => {
  it("omite el día de la semana y deja el mes en minúscula", () => {
    expect(formatearDiaMesCorto("2026-09-21T15:00:00.000Z")).toBe("21 sep");
  });
});

describe("una fecha sin hora es un día del calendario", () => {
  // El bug: "2026-09-21" leído como ISO es medianoche UTC, que en Santiago
  // todavía es el día 20. La pantalla mostraba el día anterior en cualquier
  // navegador al este de Chile y en el render del servidor.
  it("no se corre de día al formatear", () => {
    expect(formatearFecha("2026-09-21")).toBe("21 de septiembre");
    expect(formatearFechaLarga("2026-01-01")).toBe(
      "jueves 1 de enero de 2026",
    );
    expect(formatearDiaMesCorto("2026-08-05")).toBe("5 ago");
  });

  it("da la vuelta completa sin perder el día", () => {
    expect(fechaISO("2026-09-21")).toBe("2026-09-21");
    expect(fechaISO("2026-01-01")).toBe("2026-01-01");
    // 6 de septiembre de 2026: el día en que empieza el horario de verano.
    expect(fechaISO("2026-09-06")).toBe("2026-09-06");
  });
});
