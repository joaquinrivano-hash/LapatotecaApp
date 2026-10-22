import { describe, expect, it, vi } from "vitest";
import {
  explicarErrorDeInvitacion,
  invitacionesEsperando,
  mandarInvitacion,
  type PuertoInvitaciones,
} from "./servidor";

const ORIGEN = "https://lapatoteca.cl";

function puerto(cambios: Partial<PuertoInvitaciones> = {}) {
  const base: PuertoInvitaciones = {
    quienPide: vi.fn(async (token: string) =>
      token === "admin" ? { id: "u-admin", rol: "admin" } : token === "staff" ? { id: "u-staff", rol: "staff" } : null,
    ),
    invitacion: vi.fn(async () => ({ rol: "staff", usadaEn: null })),
    invitar: vi.fn(async () => ({ error: null })),
    invitacionesUsadas: vi.fn(async () => ["maria@correo.cl", "pedro@correo.cl"]),
    sinConfirmar: vi.fn(async () => ["maria@correo.cl"]),
  };
  return { ...base, ...cambios };
}

describe("mandarInvitacion", () => {
  it("Administración manda el correo, que vuelve a la bienvenida del equipo", async () => {
    const p = puerto();
    const r = await mandarInvitacion(p, {
      token: "admin",
      email: " Maria@Correo.cl ",
      nombre: "María",
      origen: ORIGEN,
    });

    expect(r).toEqual({ ok: true, datos: { email: "maria@correo.cl" } });
    expect(p.invitar).toHaveBeenCalledWith("maria@correo.cl", {
      nombre: "María",
      redirigirA: `${ORIGEN}/crear-cuenta/equipo/bienvenida`,
    });
  });

  // Con la llave de servicio detrás, esta es la puerta que importa.
  it("un cuidador no puede, aunque llegue a la URL", async () => {
    const p = puerto();
    const r = await mandarInvitacion(p, { token: "staff", email: "a@b.cl", origen: ORIGEN });
    expect(r).toMatchObject({ ok: false, estado: 403 });
    expect(p.invitar).not.toHaveBeenCalled();
  });

  it("sin sesión, tampoco", async () => {
    const p = puerto();
    expect(await mandarInvitacion(p, { token: null, email: "a@b.cl", origen: ORIGEN })).toMatchObject({
      ok: false,
      estado: 401,
    });
    expect(await mandarInvitacion(p, { token: "falso", email: "a@b.cl", origen: ORIGEN })).toMatchObject({
      ok: false,
      estado: 401,
    });
    expect(p.invitar).not.toHaveBeenCalled();
  });

  it("sin invitación anotada no manda nada: la cuenta nacería como dueño", async () => {
    const p = puerto({ invitacion: vi.fn(async () => null) });
    const r = await mandarInvitacion(p, { token: "admin", email: "a@b.cl", origen: ORIGEN });
    expect(r).toMatchObject({ ok: false, estado: 404 });
    expect(p.invitar).not.toHaveBeenCalled();
  });

  it("rechaza un correo que no es correo", async () => {
    const r = await mandarInvitacion(puerto(), { token: "admin", email: "maria", origen: ORIGEN });
    expect(r).toMatchObject({ ok: false, estado: 400 });
  });

  it("si Supabase no lo manda, dice qué hacer", async () => {
    const p = puerto({
      invitar: vi.fn(async () => ({ error: "Email address not authorized" })),
    });
    const r = await mandarInvitacion(p, { token: "admin", email: "a@b.cl", origen: ORIGEN });
    expect(r).toMatchObject({ ok: false, estado: 502 });
    expect(r.ok === false && r.motivo).toMatch(/SMTP propio/);
  });
});

describe("explicarErrorDeInvitacion", () => {
  it("una cuenta que ya existe no es un error de correo", () => {
    expect(
      explicarErrorDeInvitacion("A user with this email address has already been registered"),
    ).toMatchObject({ estado: 409 });
  });

  it("el tope por hora se dice como tope", () => {
    expect(explicarErrorDeInvitacion("email rate limit exceeded").estado).toBe(429);
  });
});

describe("invitacionesEsperando", () => {
  it("devuelve a quien se le mandó el correo y todavía no entra", async () => {
    const p = puerto();
    expect(await invitacionesEsperando(p, "admin")).toEqual({
      ok: true,
      datos: { esperando: ["maria@correo.cl"] },
    });
    expect(p.sinConfirmar).toHaveBeenCalledWith(["maria@correo.cl", "pedro@correo.cl"]);
  });

  it("solo para Administración", async () => {
    expect(await invitacionesEsperando(puerto(), "staff")).toMatchObject({ ok: false, estado: 403 });
  });
});
