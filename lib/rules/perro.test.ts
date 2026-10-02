import { describe, expect, it } from "vitest";
import {
  calcularEdad,
  cumpleQueEdad,
  describirAlimentacion,
  describirEdad,
  esCumpleanos,
  leCorrespondeEstarCastrado,
  sumarMeses,
  vigenciaAntiparasitario,
  vigenciaVacuna,
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

describe("sumarMeses", () => {
  it("suma meses de calendario", () => {
    expect(sumarMeses("2026-09-01", 3)).toBe("2026-12-01");
    expect(sumarMeses("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("no se pasa de mes: el 31 de enero más un mes es el 28 de febrero", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    // 2028 sí es bisiesto.
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("vigenciaAntiparasitario", () => {
  it("le suma los meses que dura el formato", () => {
    expect(
      vigenciaAntiparasitario({
        ultimaAplicacion: "2026-09-01",
        mesesDeDuracion: 1,
      }),
    ).toBe("2026-10-01");

    expect(
      vigenciaAntiparasitario({
        ultimaAplicacion: "2026-09-01",
        mesesDeDuracion: 3,
      }),
    ).toBe("2026-12-01");
  });
});

describe("vigenciaVacuna", () => {
  it("cuenta desde el día en que se puso", () => {
    expect(vigenciaVacuna("2026-03-10", 12)).toBe("2027-03-10");
    expect(vigenciaVacuna("2026-03-10", 6)).toBe("2026-09-10");
  });
});

describe("leCorrespondeEstarCastrado", () => {
  const HOY = "2026-09-28";

  it("a un cachorro de cuatro meses todavía no", () => {
    expect(leCorrespondeEstarCastrado("2026-05-28", HOY, 7)).toBe(false);
  });

  it("desde los siete meses sí", () => {
    expect(leCorrespondeEstarCastrado("2026-02-28", HOY, 7)).toBe(true);
  });

  it("justo el día que cumple los siete meses ya cuenta", () => {
    expect(leCorrespondeEstarCastrado("2026-02-28", "2026-09-28", 7)).toBe(true);
    expect(leCorrespondeEstarCastrado("2026-02-28", "2026-09-27", 7)).toBe(false);
  });

  it("sin fecha de nacimiento se asume que ya tiene la edad", () => {
    expect(leCorrespondeEstarCastrado(undefined, HOY, 7)).toBe(true);
  });
});

describe("describirAlimentacion", () => {
  it("arma la línea que se lee a la hora de almuerzo", () => {
    expect(
      describirAlimentacion({
        marca: "Proplan",
        unidad: "taza",
        raciones: [{ cantidad: 1, comidas: ["almuerzo", "cena"] }],
      }),
    ).toBe("Proplan · 1 taza en almuerzo y cena");
  });

  it("junta las porciones distintas en una sola línea", () => {
    expect(
      describirAlimentacion({
        marca: "Royal Canin",
        unidad: "taza",
        raciones: [
          { cantidad: 0.5, comidas: ["desayuno"] },
          { cantidad: 1, comidas: ["cena"] },
        ],
      }),
    ).toBe("Royal Canin · 0.5 tazas en desayuno, 1 taza en cena");
  });

  it("pluraliza la medida, pero no los gramos", () => {
    expect(
      describirAlimentacion({
        unidad: "scoop",
        raciones: [{ cantidad: 2, comidas: ["desayuno"] }],
      }),
    ).toBe("2 scoops en desayuno");

    expect(
      describirAlimentacion({
        unidad: "g",
        raciones: [{ cantidad: 200, comidas: [] }],
      }),
    ).toBe("200 g");
  });

  it("agrega las notas al final", () => {
    expect(
      describirAlimentacion({
        marca: "Royal Canin",
        raciones: [{ comidas: ["almuerzo"] }],
        notas: "Si no come, no insistir.",
      }),
    ).toBe("Royal Canin · en almuerzo. Si no come, no insistir.");
  });

  it("sin nada anotado devuelve null para que la pantalla ponga su vacío", () => {
    expect(describirAlimentacion(undefined)).toBeNull();
    expect(describirAlimentacion({ raciones: [] })).toBeNull();
  });

  it("con solo notas, devuelve las notas", () => {
    expect(
      describirAlimentacion({ raciones: [], notas: "Trae su bolsita." }),
    ).toBe("Trae su bolsita.");
  });
});
