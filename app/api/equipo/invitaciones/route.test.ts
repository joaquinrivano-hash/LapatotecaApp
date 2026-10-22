/**
 * La ruta sin la llave: es lo primero que va a pasar al desplegarla, y la
 * pantalla tiene que poder decir qué falta en vez de "no se pudo".
 */

import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const ENTORNO = { ...process.env };

afterEach(() => {
  process.env = { ...ENTORNO };
});

describe("sin SUPABASE_SERVICE_ROLE_KEY", () => {
  it("POST responde 503 diciendo qué variable falta", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await POST(
      new Request("http://localhost/api/equipo/invitaciones", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.cl" }),
      }),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).motivo).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("GET también", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await GET(new Request("http://localhost/api/equipo/invitaciones"));
    expect(r.status).toBe(503);
  });
});
