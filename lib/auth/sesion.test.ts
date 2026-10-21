/**
 * Tests de la sesión del lado del servidor.
 *
 * Lo que importa es que, ante la duda, no haya rol: una ruta que gasta plata
 * tiene que quedar cerrada si falta la configuración, la cookie o el perfil.
 * Supabase no se toca de verdad: `fetch` está reemplazado y responde como lo
 * harían Auth y la API REST.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esEquipo, rolDeLaSesion } from "./sesion";

const ENTORNO = { ...process.env };
const URL_SUPABASE = "https://abcdefgh.supabase.co";

/** La cookie que deja `@supabase/ssr` en el navegador al entrar. */
function cookieDeSesion(): string {
  const sesion = {
    access_token: "jwt-de-prueba",
    refresh_token: "refresh-de-prueba",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "usuario-1" },
  };
  const valor = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  return `sb-abcdefgh-auth-token=base64-${valor}`;
}

function pedir(cookie?: string): Request {
  return new Request("http://localhost/api/integraciones/whatsapp/enviar", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

/** Responde como Supabase: Auth valida el token, REST devuelve el perfil. */
function fingirSupabase({
  usuarioValido = true,
  perfil = { rol: "staff" } as { rol: string } | null,
} = {}) {
  const urls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada instanceof Request ? entrada.url : entrada);
      urls.push(url);

      if (url.includes("/auth/v1/user")) {
        return usuarioValido
          ? Response.json({ id: "usuario-1", aud: "authenticated" })
          : Response.json({ message: "invalid JWT" }, { status: 401 });
      }
      if (url.includes("/rest/v1/perfiles")) {
        return Response.json(perfil ? [perfil] : []);
      }
      return new Response(null, { status: 404 });
    }),
  );

  return urls;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anonima";
});

afterEach(() => {
  process.env = { ...ENTORNO };
  vi.unstubAllGlobals();
});

describe("rolDeLaSesion", () => {
  it("sin Supabase configurado no hay rol, aunque venga una cookie", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const urls = fingirSupabase();

    expect(await rolDeLaSesion(pedir(cookieDeSesion()))).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it("sin cookie no hay rol, y ni siquiera se le pregunta a Supabase", async () => {
    const urls = fingirSupabase();

    expect(await rolDeLaSesion(pedir())).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it("valida el token con Auth y lee el rol de perfiles", async () => {
    const urls = fingirSupabase({ perfil: { rol: "admin" } });

    expect(await rolDeLaSesion(pedir(cookieDeSesion()))).toBe("admin");
    expect(
      urls.some((u) => u.startsWith(`${URL_SUPABASE}/auth/v1/user`)),
    ).toBe(true);
  });

  it("un token que Auth rechaza no da rol, diga lo que diga la cookie", async () => {
    fingirSupabase({ usuarioValido: false });

    expect(await rolDeLaSesion(pedir(cookieDeSesion()))).toBeNull();
  });

  it("un usuario sin perfil no tiene rol", async () => {
    fingirSupabase({ perfil: null });

    expect(await rolDeLaSesion(pedir(cookieDeSesion()))).toBeNull();
  });

  it("si Supabase no responde, la puerta queda cerrada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );

    expect(await rolDeLaSesion(pedir(cookieDeSesion()))).toBeNull();
  });
});

describe("esEquipo", () => {
  it("staff y admin sí; el dueño y el que no entró, no", () => {
    expect(esEquipo("staff")).toBe(true);
    expect(esEquipo("admin")).toBe(true);
    expect(esEquipo("cliente")).toBe(false);
    expect(esEquipo(null)).toBe(false);
  });
});
