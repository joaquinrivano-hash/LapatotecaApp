/**
 * Tests de la ruta de envío.
 *
 * Acá se arma el JSON que recibe Meta, y un error en ese JSON se ve en la app
 * como "el mensaje no salió" sin más explicación. Por eso se verifica la forma
 * exacta del payload y no solo que la ruta responda 200.
 *
 * No toca la red: `fetch` está reemplazado.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import type { MensajeSaliente } from "@/lib/types";

const MENSAJE: MensajeSaliente = {
  id: "msg-1",
  canal: "whatsapp",
  clienteId: "cli-1",
  destino: "+56912345678",
  plantilla: "reporte_diario",
  idioma: "es",
  parametros: ["Joaquín", "Pelusa", "Durmió toda la tarde."],
  vistaPrevia: "¡Hola Joaquín! 🐾",
  estado: "enviando",
  intentos: 1,
  creadoEn: "2026-09-22T12:00:00.000Z",
  actualizadoEn: "2026-09-22T12:00:00.000Z",
};

const ENTORNO = { ...process.env };

function pedir(cuerpo: unknown): Request {
  return new Request("http://localhost/api/integraciones/whatsapp/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}

/** Deja `fetch` respondiendo lo que se le pida, y guarda cada llamada. */
function fingirFetch(...respuestas: { estado?: number; cuerpo: unknown }[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  let turno = 0;

  const falso = vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const { estado = 200, cuerpo } = respuestas[turno] ?? respuestas.at(-1)!;
    turno += 1;
    return new Response(JSON.stringify(cuerpo), { status: estado });
  });

  vi.stubGlobal("fetch", falso);
  return llamadas;
}

/** El JSON que se le mandó a Meta en la llamada n. */
function payloadDe(llamada: { init: RequestInit }) {
  return JSON.parse(llamada.init.body as string);
}

beforeEach(() => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = "111222";
  process.env.WHATSAPP_ACCESS_TOKEN = "token-secreto";
  process.env.WHATSAPP_API_VERSION = "v21.0";
});

afterEach(() => {
  process.env = { ...ENTORNO };
  vi.unstubAllGlobals();
});

describe("cuando falta configurar la cuenta", () => {
  it("responde 503 y dice qué variable falta, en vez de fallar mudo", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    const respuesta = await POST(pedir(MENSAJE));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(503);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error).toMatch(/WHATSAPP_ACCESS_TOKEN/);
  });
});

describe("validación del mensaje", () => {
  it("rechaza un cuerpo que no es JSON", async () => {
    const respuesta = await POST(pedir("esto no es json"));

    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).error).toMatch(/JSON/);
  });

  it("rechaza un mensaje sin destino ni plantilla", async () => {
    const respuesta = await POST(pedir({ parametros: [] }));

    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).error).toMatch(/destino y plantilla/);
  });
});

describe("el payload que recibe Meta", () => {
  it("manda el teléfono sin el +, que es como lo pide Meta", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(pedir(MENSAJE));

    expect(payloadDe(llamadas[0]).to).toBe("56912345678");
  });

  it("usa la plantilla y el idioma del mensaje", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(pedir(MENSAJE));
    const payload = payloadDe(llamadas[0]);

    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("reporte_diario");
    expect(payload.template.language.code).toBe("es");
  });

  it("manda los parámetros en orden: se leen por posición, no por nombre", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(pedir(MENSAJE));
    const cuerpo = payloadDe(llamadas[0]).template.components.find(
      (c: { type: string }) => c.type === "body",
    );

    expect(cuerpo.parameters).toEqual([
      { type: "text", text: "Joaquín" },
      { type: "text", text: "Pelusa" },
      { type: "text", text: "Durmió toda la tarde." },
    ]);
  });

  it("pega en el número configurado, con el token en la cabecera", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(pedir(MENSAJE));

    expect(llamadas[0].url).toBe(
      "https://graph.facebook.com/v21.0/111222/messages",
    );
    expect(
      (llamadas[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer token-secreto");
  });

  it("devuelve el id del proveedor para cruzarlo después con el webhook", async () => {
    fingirFetch({ cuerpo: { messages: [{ id: "wamid.abc" }] } });

    const cuerpo = await (await POST(pedir(MENSAJE))).json();

    expect(cuerpo).toMatchObject({
      ok: true,
      simulado: false,
      idProveedor: "wamid.abc",
    });
  });
});

describe("la foto del reporte", () => {
  it("sin foto manda un solo componente: el cuerpo", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(pedir(MENSAJE));
    const componentes = payloadDe(llamadas[0]).template.components;

    expect(componentes).toHaveLength(1);
    expect(componentes[0].type).toBe("body");
  });

  it("una foto ya publicada viaja como link, sin subir nada", async () => {
    const llamadas = fingirFetch({ cuerpo: { messages: [{ id: "wamid.1" }] } });

    await POST(
      pedir({ ...MENSAJE, adjuntoUrl: "https://patoteca.cl/pelusa.jpg" }),
    );

    expect(llamadas).toHaveLength(1);
    expect(payloadDe(llamadas[0]).template.components[0]).toEqual({
      type: "header",
      parameters: [
        { type: "image", image: { link: "https://patoteca.cl/pelusa.jpg" } },
      ],
    });
  });

  it("la foto del celular se sube primero y se nombra por id", async () => {
    const llamadas = fingirFetch(
      { cuerpo: { id: "media-99" } },
      { cuerpo: { messages: [{ id: "wamid.1" }] } },
    );

    const respuesta = await POST(
      pedir({ ...MENSAJE, adjuntoUrl: "data:image/jpeg;base64,aG9sYQ==" }),
    );

    // Primero a /media, después a /messages.
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toBe(
      "https://graph.facebook.com/v21.0/111222/media",
    );
    expect(llamadas[0].init.body).toBeInstanceOf(FormData);

    // El encabezado lleva el id, no el data URL: Meta no puede descargarlo.
    expect(payloadDe(llamadas[1]).template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "image", image: { id: "media-99" } }],
    });
    expect((await respuesta.json()).ok).toBe(true);
  });

  it("si la foto no se puede subir, el motivo llega a la bandeja", async () => {
    fingirFetch({
      estado: 400,
      cuerpo: { error: { message: "Media upload failed" } },
    });

    const respuesta = await POST(
      pedir({ ...MENSAJE, adjuntoUrl: "data:image/jpeg;base64,aG9sYQ==" }),
    );

    expect(respuesta.status).toBe(502);
    expect((await respuesta.json()).error).toBe("Media upload failed");
  });
});

describe("cuando Meta rechaza el envío", () => {
  it("devuelve el motivo de Meta tal cual, no uno inventado", async () => {
    fingirFetch({
      estado: 400,
      cuerpo: {
        error: {
          message:
            "template name does not exist in the translation: reporte_diario (es_CL)",
        },
      },
    });

    const respuesta = await POST(pedir(MENSAJE));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(502);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error).toMatch(/does not exist in the translation/);
  });

  it("una caída de red deja el mensaje fallido con su motivo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );

    const respuesta = await POST(pedir(MENSAJE));

    expect(respuesta.status).toBe(502);
    expect((await respuesta.json()).error).toBe("fetch failed");
  });
});
