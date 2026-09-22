import { describe, expect, it } from "vitest";
import {
  esDataUrl,
  leerDataUrl,
  LIMITE_IMAGEN_MB,
} from "@/lib/integraciones/mensajeria/media";

/** "hola" en base64 es "aG9sYQ==". */
const FOTO = "data:image/jpeg;base64,aG9sYQ==";

describe("esDataUrl", () => {
  it("distingue la foto del celular de un link publicado", () => {
    expect(esDataUrl(FOTO)).toBe(true);
    expect(esDataUrl("https://patoteca.cl/fotos/pelusa.jpg")).toBe(false);
  });
});

describe("leerDataUrl", () => {
  it("devuelve el tipo, los bytes y un nombre de archivo", () => {
    const leida = leerDataUrl(FOTO);

    expect(leida.tipo).toBe("image/jpeg");
    expect(new TextDecoder().decode(leida.bytes)).toBe("hola");
    // Meta exige nombre en el multipart, y jpeg se escribe jpg.
    expect(leida.nombreArchivo).toBe("reporte.jpg");
  });

  it("respeta el tipo de la imagen", () => {
    expect(leerDataUrl("data:image/png;base64,aG9sYQ==").nombreArchivo).toBe(
      "reporte.png",
    );
  });

  it("rechaza algo que no es un data URL", () => {
    expect(() => leerDataUrl("https://patoteca.cl/pelusa.jpg")).toThrow(
      /data URL/,
    );
  });

  it("rechaza un data URL sin base64", () => {
    expect(() => leerDataUrl("data:image/jpeg,hola")).toThrow(/base64/);
  });

  it("avisa cuando la foto pasa el tope de WhatsApp", () => {
    // 8 MB de base64 se decodifican a 6 MB de bytes.
    const enorme = `data:image/jpeg;base64,${"A".repeat(8 * 1024 * 1024)}`;

    expect(() => leerDataUrl(enorme)).toThrow(
      new RegExp(`${LIMITE_IMAGEN_MB} MB`),
    );
  });
});
