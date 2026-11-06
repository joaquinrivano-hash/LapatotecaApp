import { describe, expect, it } from "vitest";
import {
  cuerpoDeConsulta,
  kmDeRespuesta,
} from "@/lib/integraciones/distancias/google";
import { NEGOCIO } from "@/lib/config/negocio";

describe("cuerpoDeConsulta", () => {
  it("sale de la casa, no de donde esté el servidor", () => {
    const cuerpo = cuerpoDeConsulta("Av. Providencia 1234");
    expect(cuerpo.origin.location.latLng).toEqual({
      latitude: NEGOCIO.ubicacion.lat,
      longitude: NEGOCIO.ubicacion.lng,
    });
  });

  it("acota el destino a Chile", () => {
    // Sin el país, "Providencia 1234" tiene candidatos en varios lados.
    expect(cuerpoDeConsulta("Providencia 1234").destination.address).toBe(
      "Providencia 1234, Chile",
    );
  });
});

describe("kmDeRespuesta", () => {
  it("pasa los metros a kilómetros con un decimal", () => {
    // El precio lo decide el TRAMO, no el metro: "4.231 km" promete una
    // precisión que la tarifa no usa.
    expect(kmDeRespuesta({ routes: [{ distanceMeters: 4231 }] })).toBe(4.2);
    expect(kmDeRespuesta({ routes: [{ distanceMeters: 4280 }] })).toBe(4.3);
  });

  it("una ruta que Google no supo armar vale null, no cero", () => {
    // Cero se leería como "está al lado" y cotizaría el primer tramo.
    expect(kmDeRespuesta({ routes: [] })).toBeNull();
    expect(kmDeRespuesta({ routes: [{}] })).toBeNull();
    expect(kmDeRespuesta({ routes: [{ distanceMeters: 0 }] })).toBeNull();
    expect(kmDeRespuesta({})).toBeNull();
    expect(kmDeRespuesta(null)).toBeNull();
    expect(kmDeRespuesta({ error: { code: 403 } })).toBeNull();
  });
});
