/**
 * Tests del webhook.
 *
 * El GET es el apretón de manos con Meta: si no devuelve el desafío tal cual,
 * el panel no deja suscribir el webhook y no llega ningún estado de entrega.
 * El POST tiene que responder 200 a todo aviso firmado, porque Meta
 * reintenta; y 401 a todo lo que no venga firmado por Meta.
 */

import { createHmac } from "node:crypto";
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

const SECRETO = "app-secret-de-prueba";

function firmar(cuerpo: string, secreto = SECRETO): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

/**
 * Un aviso como lo manda Meta: firmado con el App Secret. `firma: null` lo
 * manda sin cabecera.
 */
function aviso(
  cuerpo: unknown,
  { firma }: { firma?: string | null } = {},
): Request {
  const crudo = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const cabecera = firma === undefined ? firmar(crudo) : firma;

  return new Request("http://localhost/api/integraciones/whatsapp/webhook", {
    method: "POST",
    headers: cabecera === null ? {} : { "X-Hub-Signature-256": cabecera },
    body: crudo,
  });
}

beforeEach(() => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "la-patoteca-2026";
  process.env.WHATSAPP_APP_SECRET = SECRETO;
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

describe("la firma de Meta", () => {
  const ENTREGADO = {
    entry: [
      {
        changes: [
          { value: { statuses: [{ id: "wamid.1", status: "delivered" }] } },
        ],
      },
    ],
  };

  it("procesa un aviso con la firma correcta", async () => {
    const respuesta = await POST(aviso(ENTREGADO));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, recibidos: 1 });
  });

  it("rechaza un aviso sin firma", async () => {
    const respuesta = await POST(aviso(ENTREGADO, { firma: null }));

    expect(respuesta.status).toBe(401);
  });

  it("rechaza una firma hecha con otro secreto", async () => {
    const crudo = JSON.stringify(ENTREGADO);
    const respuesta = await POST(
      aviso(crudo, { firma: firmar(crudo, "otro-secreto") }),
    );

    expect(respuesta.status).toBe(401);
  });

  it("rechaza un cuerpo cambiado después de firmar", async () => {
    const firma = firmar(JSON.stringify(ENTREGADO));
    const adulterado = JSON.stringify({ ...ENTREGADO, extra: true });

    const respuesta = await POST(aviso(adulterado, { firma }));

    expect(respuesta.status).toBe(401);
  });

  it("rechaza una cabecera mal formada sin reventar", async () => {
    for (const firma of ["", "sha256=", "sha256=zz", "md5=abc", "abc"]) {
      const respuesta = await POST(aviso(ENTREGADO, { firma }));
      expect(respuesta.status).toBe(401);
    }
  });

  it("firma sobre los bytes crudos: un espacio de más ya es otro cuerpo", async () => {
    // Meta no manda el JSON compacto. Si la ruta lo parseara y volviera a
    // serializar antes de verificar, este aviso legítimo se rechazaría.
    const crudo = JSON.stringify(ENTREGADO, null, 2);

    const respuesta = await POST(aviso(crudo));

    expect(respuesta.status).toBe(200);
  });

  it("sin WHATSAPP_APP_SECRET no acepta nada y dice qué falta", async () => {
    delete process.env.WHATSAPP_APP_SECRET;

    const respuesta = await POST(aviso(ENTREGADO));

    expect(respuesta.status).toBe(503);
    expect(await respuesta.text()).toMatch(/WHATSAPP_APP_SECRET/);
  });
});
