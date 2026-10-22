import { describe, expect, it } from "vitest";
import { leerEnlaceDeCorreo } from "@/lib/auth/enlace";

const BASE = "https://lapatoteca.cl/crear-cuenta/equipo/bienvenida";

describe("leerEnlaceDeCorreo", () => {
  it("lee la sesión que trae la invitación en el fragmento", () => {
    expect(
      leerEnlaceDeCorreo(
        `${BASE}#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer&type=invite`,
      ),
    ).toEqual({ tipo: "sesion", accessToken: "aaa", refreshToken: "bbb" });
  });

  it("lee el token_hash de la plantilla para apps con servidor", () => {
    expect(leerEnlaceDeCorreo(`${BASE}?token_hash=xyz&type=invite`)).toEqual({
      tipo: "verificar",
      tokenHash: "xyz",
      type: "invite",
    });
  });

  it("no acepta un tipo que no conoce", () => {
    expect(leerEnlaceDeCorreo(`${BASE}?token_hash=xyz&type=otra`)).toEqual({
      tipo: "nada",
    });
  });

  it("un enlace vencido dice que venció, en castellano", () => {
    const enlace = leerEnlaceDeCorreo(
      `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    );
    expect(enlace).toEqual({ tipo: "error", mensaje: "El enlace venció o ya se usó." });
  });

  it("sin nada en la URL no inventa una sesión", () => {
    expect(leerEnlaceDeCorreo(BASE)).toEqual({ tipo: "nada" });
  });
});
