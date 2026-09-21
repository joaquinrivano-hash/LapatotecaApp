import { describe, expect, it } from "vitest";
import {
  listarNombres,
  PLANTILLAS,
  renderizarPlantilla,
} from "./plantillas";

describe("renderizarPlantilla", () => {
  it("reemplaza los parámetros posicionales", () => {
    const texto = renderizarPlantilla(PLANTILLAS.reporte_diario, [
      "Javiera",
      "Pelusa",
      "Durmió toda la tarde.",
    ]);
    expect(texto).toContain("¡Hola Javiera!");
    expect(texto).toContain("Así estuvo hoy Pelusa");
    expect(texto).toContain("Durmió toda la tarde.");
    expect(texto).not.toContain("{{");
  });

  it("deja el marcador si falta un parámetro, en vez de escribir 'undefined'", () => {
    const texto = renderizarPlantilla(PLANTILLAS.aviso_incidente, ["Ana"]);
    expect(texto).toContain("Hola Ana");
    expect(texto).toContain("{{2}}");
  });

  it("toda plantilla declara tantos parámetros como usa", () => {
    for (const plantilla of Object.values(PLANTILLAS)) {
      const usados = new Set(
        [...plantilla.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]),
      );
      expect(usados.size).toBe(plantilla.parametros.length);
    }
  });

  it("toda plantilla se identifica con su propia clave", () => {
    for (const [clave, plantilla] of Object.entries(PLANTILLAS)) {
      expect(plantilla.nombre).toBe(clave);
    }
  });
});

describe("listarNombres", () => {
  it("arma la enumeración como la diría una persona", () => {
    expect(listarNombres(["Pelusa"])).toBe("Pelusa");
    expect(listarNombres(["Pelusa", "Rocco"])).toBe("Pelusa y Rocco");
    expect(listarNombres(["Pelusa", "Rocco", "Luna"])).toBe(
      "Pelusa, Rocco y Luna",
    );
  });

  it("con lista vacía devuelve vacío", () => {
    expect(listarNombres([])).toBe("");
  });
});
