import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  describirDesfase,
  desfaseDeMarca,
  marcaFueraDeTiempo,
} from "./marca-de-asistencia";

const DIA = "2026-06-15";
const en = (hora: string) => instanteEnHora(DIA, hora);

describe("desfaseDeMarca", () => {
  it("cuenta los minutos entre lo que pasó y cuándo se anotó", () => {
    expect(desfaseDeMarca(en("08:00"), en("08:40"))).toBe(40);
  });

  it("es negativo si se anotó antes de que pasara", () => {
    // Pasa cuando se deja todo listo de antemano.
    expect(desfaseDeMarca(en("08:00"), en("07:50"))).toBe(-10);
  });

  it("sin hora de marca no hay desfase que medir", () => {
    // Las estadías cargadas antes de que el campo existiera.
    expect(desfaseDeMarca(en("08:00"), undefined)).toBe(0);
  });
});

describe("cuándo vale la pena decirlo", () => {
  it("un par de minutos no es un atraso, es la vida real", () => {
    expect(marcaFueraDeTiempo(en("08:00"), en("08:03"))).toBe(false);
    expect(describirDesfase(en("08:00"), en("08:03"))).toBeNull();
  });

  it("cuarenta minutos sí", () => {
    expect(describirDesfase(en("08:00"), en("08:40"))).toBe(
      "marcado 40 min después",
    );
  });

  it("pasada la hora lo dice en horas", () => {
    expect(describirDesfase(en("08:00"), en("10:00"))).toBe(
      "marcado 2 h después",
    );
    expect(describirDesfase(en("08:00"), en("09:30"))).toBe(
      "marcado 1 h 30 min después",
    );
  });

  it("distingue el que anotó antes", () => {
    expect(describirDesfase(en("09:00"), en("08:00"))).toBe(
      "marcado 1 h antes",
    );
  });

  it("sin hora de marca no dice nada", () => {
    expect(describirDesfase(en("08:00"), undefined)).toBeNull();
  });
});
