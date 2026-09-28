/**
 * Tests del webhook.
 *
 * El GET es el apretón de manos con Meta: si no devuelve el desafío tal cual,
 * el panel no deja suscribir el webhook y no llega ningún estado de entrega.
 * El POST tiene que responder 200 siempre, porque Meta reintenta.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const ENTORNO = { ...process.env };

function verificacion(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/integraciones/whatsapp/webhook");
  for (const [clave, valor] of Object.entries(params)) {
    url.searchParams.set(clave, valor);
  }
  return new Request(url);
}

function aviso(cuerpo: unknown): Request {
  return new Request("http://localhost/api/integraciones/whatsapp/webhook", {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "la-patoteca-2026";
});

afterEach(() => {
  process.env = { ...ENTORNO };
});

describe("la verificación de Meta", () => {
  it("devuelve el desafío cuando el token coincide", async () => {
    const respuesta = await GET(
      verificacion({
        "hub.mode": "subscribe",
        "hub.verify_token": "la-patoteca-2026",
        "hub.challenge": "1158201444",
      }),
    );

    expect(respuesta.status).toBe(200);
    // Tal cual y sin comillas: Meta compara el cuerpo completo.
    expect(await respuesta.text()).toBe("1158201444");
  });

  it("rechaza un token equivocado", async () => {
    const respuesta = await GET(
      verificacion({
        "hub.mode": "subscribe",
        "hub.verify_token": "otro",
        "hub.challenge": "1158201444",
      }),
    );

    expect(respuesta.status).toBe(403);
  });

  it("avisa cuando el token ni siquiera está configurado", async () => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    const respuesta = await GET(
      verificacion({
        "hub.mode": "subscribe",
        "hub.verify_token": "la-patoteca-2026",
        "hub.challenge": "1158201444",
      }),
    );

    expect(respuesta.status).toBe(503);
    expect(await respuesta.text()).toMatch(/WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  });
});

describe("los avisos de entrega", () => {
  it("cuenta los cambios de estado que vienen en el aviso", async () => {
    const respuesta = await POST(
      aviso({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    { id: "wamid.1", status: "delivered" },
                    { id: "wamid.2", status: "read" },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, recibidos: 2 });
  });

  it("responde 200 a un aviso vacío: Meta reintenta si no lo hacemos", async () => {
    const respuesta = await POST(aviso({ entry: [] }));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, recibidos: 0 });
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const respuesta = await POST(aviso("esto no es json"));

    expect(respuesta.status).toBe(400);
  });
});
