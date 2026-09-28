import { describe, expect, it } from "vitest";
import {
  calcularEdad,
  cumpleQueEdad,
  describirAlimentacion,
  describirEdad,
  esCumpleanos,
  vigenciaAntiparasitario,
} from "@/lib/rules/perro";

describe("calcularEdad", () => {
  it("cuenta años y meses cumplidos", () => {
    expect(calcularEdad("2023-07-15", "2026-09-28")).toEqual({
      anios: 3,
      meses: 2,
    });
  });

  it("no cuenta el mes hasta que llega el día", () => {
    // Del 15 de agosto al 14 de septiembre todavía no cumple el mes.
    expect(calcularEdad("2026-08-15", "2026-09-14")).toEqual({
      anios: 0,
      meses: 0,
    });
    expect(calcularEdad("2026-08-15", "2026-09-15")).toEqual({
      anios: 0,
      meses: 1,
    });
  });

  it("devuelve null si la fecha es del futuro: es un error de tipeo", () => {
    expect(calcularEdad("2027-01-01", "2026-09-28")).toBeNull();
  });
});

describe("describirEdad", () => {
  it("escribe la edad como se dice", () => {
    expect(describirEdad("2023-07-15", "2026-09-28")).toBe("3 años y 2 meses");
    expect(describirEdad("2026-01-28", "2026-09-28")).toBe("8 meses");
    expect(describirEdad("2025-09-28", "2026-09-28")).toBe("1 año");
    expect(describirEdad("2026-09-28", "2026-09-28")).toBe("recién nacido");
  });

  it("usa el singular cuando corresponde", () => {
    expect(describirEdad("2025-08-28", "2026-09-28")).toBe("1 año y 1 mes");
  });
});

describe("esCumpleanos", () => {
  it("reconoce el día", () => {
    expect(esCumpleanos("2020-09-28", "2026-09-28")).toBe(true);
    expect(esCumpleanos("2020-09-27", "2026-09-28")).toBe(false);
  });

  it("al nacido un 29 de febrero lo celebra el 28 en los años normales", () => {
    expect(esCumpleanos("2020-02-29", "2027-02-28")).toBe(true);
    // 2028 sí es bisiesto: ese año cumple el 29.
    expect(esCumpleanos("2020-02-29", "2028-02-28")).toBe(false);
    expect(esCumpleanos("2020-02-29", "2028-02-29")).toBe(true);
  });

  it("dice cuántos cumple", () => {
    expect(cumpleQueEdad("2020-09-28", "2026-09-28")).toBe(6);
    expect(cumpleQueEdad("2020-09-28", "2026-09-27")).toBeNull();
  });
});

describe("vigenciaAntiparasitario", () => {
  it("suma el período a la última aplicación", () => {
    expect(
      vigenciaAntiparasitario({
        ultimaAplicacion: "2026-09-01",
        periodicidad: "mensual",
      }),
    ).toBe("2026-10-01");

    expect(
      vigenciaAntiparasitario({
        ultimaAplicacion: "2026-09-01",
        periodicidad: "trimestral",
      }),
    ).toBe("2026-11-30");
  });

  it("con 'otro' usa los días que indicó el dueño", () => {
    expect(
      vigenciaAntiparasitario({
        ultimaAplicacion: "2026-09-01",
        periodicidad: "otro",
        cadaCuantosDias: 45,
      }),
    ).toBe("2026-10-16");
  });
});

describe("describirAlimentacion", () => {
  it("arma la línea que se lee a la hora de almuerzo", () => {
    expect(
      describirAlimentacion({
        marca: "Proplan",
        cantidad: 1,
        unidad: "taza",
        comidas: ["almuerzo", "cena"],
      }),
    ).toBe("Proplan · 1 taza en almuerzo y cena");
  });

  it("pluraliza la medida, pero no los gramos", () => {
    expect(
      describirAlimentacion({
        cantidad: 2,
        unidad: "scoop",
        comidas: ["desayuno"],
      }),
    ).toBe("2 scoops en desayuno");

    expect(
      describirAlimentacion({ cantidad: 200, unidad: "g", comidas: [] }),
    ).toBe("200 g");
  });

  it("agrega las notas al final", () => {
    expect(
      describirAlimentacion({
        marca: "Royal Canin",
        comidas: ["almuerzo"],
        notas: "Si no come, no insistir.",
      }),
    ).toBe("Royal Canin · en almuerzo. Si no come, no insistir.");
  });

  it("sin nada anotado devuelve null para que la pantalla ponga su vacío", () => {
    expect(describirAlimentacion(undefined)).toBeNull();
    expect(describirAlimentacion({ comidas: [] })).toBeNull();
  });

  it("con solo notas, devuelve las notas", () => {
    expect(
      describirAlimentacion({ comidas: [], notas: "Trae su bolsita." }),
    ).toBe("Trae su bolsita.");
  });
});
