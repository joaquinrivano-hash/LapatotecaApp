import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  clasificarPuntualidad,
  distribucionHoraria,
  porcentaje,
  repartirPuntualidad,
} from "./horarios";

const DIA = "2026-06-15";
const en = (hora: string) => instanteEnHora(DIA, hora);

describe("distribucionHoraria", () => {
  it("cuenta llegadas y retiros en su hora", () => {
    const franjas = distribucionHoraria([
      { llegada: en("08:10"), retiro: en("17:40") },
      { llegada: en("08:55"), retiro: en("17:05") },
      { llegada: en("09:30") },
    ]);

    expect(franjas.find((f) => f.hora === 8)).toMatchObject({ llegadas: 2 });
    expect(franjas.find((f) => f.hora === 9)).toMatchObject({ llegadas: 1 });
    expect(franjas.find((f) => f.hora === 17)).toMatchObject({ retiros: 2 });
  });

  it("rellena las horas sin movimiento que quedan en medio", () => {
    // Si no, el gráfico mentiría sobre la distancia entre las 8 y las 17.
    const franjas = distribucionHoraria([
      { llegada: en("08:00"), retiro: en("11:00") },
    ]);
    expect(franjas.map((f) => f.hora)).toEqual([8, 9, 10, 11]);
  });

  it("no devuelve las 24 horas: solo desde la primera hasta la última", () => {
    // Las 24 completas dejan quince barras vacías a los lados y el
    // movimiento real apretado en el medio.
    const franjas = distribucionHoraria([
      { llegada: en("08:00"), retiro: en("17:00") },
    ]);
    expect(franjas[0].hora).toBe(8);
    expect(franjas[franjas.length - 1].hora).toBe(17);
  });

  it("sin datos devuelve una lista vacía, no 24 ceros", () => {
    expect(distribucionHoraria([])).toEqual([]);
  });
});

describe("clasificarPuntualidad", () => {
  it("diez minutos antes es llegar, no llegar temprano", () => {
    expect(clasificarPuntualidad(en("08:00"), en("07:50"))).toBe("a_la_hora");
  });

  it("media hora antes sí es temprano", () => {
    expect(clasificarPuntualidad(en("08:00"), en("07:30"))).toBe("temprano");
  });

  it("media hora después es tarde", () => {
    expect(clasificarPuntualidad(en("08:00"), en("08:30"))).toBe("tarde");
  });

  it("el margen es simétrico", () => {
    expect(clasificarPuntualidad(en("08:00"), en("08:15"))).toBe("a_la_hora");
    expect(clasificarPuntualidad(en("08:00"), en("07:45"))).toBe("a_la_hora");
  });
});

describe("repartirPuntualidad", () => {
  it("cuenta cada caso y el total", () => {
    const reparto = repartirPuntualidad([
      { programado: en("08:00"), real: en("07:00") },
      { programado: en("08:00"), real: en("08:05") },
      { programado: en("08:00"), real: en("09:00") },
      { programado: en("08:00"), real: en("09:30") },
    ]);
    expect(reparto).toEqual({ temprano: 1, a_la_hora: 1, tarde: 2, total: 4 });
  });
});

describe("porcentaje", () => {
  it("redondea al entero", () => {
    expect(porcentaje(1, 3)).toBe(33);
  });

  it("con total cero da cero y no NaN", () => {
    // Una pantalla que dice "NaN%" es peor que una que dice "0%".
    expect(porcentaje(0, 0)).toBe(0);
  });
});
