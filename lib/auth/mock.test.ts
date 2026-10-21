/**
 * La identidad del prototipo: la del selector de rol.
 *
 * Importa que exista y que falle a la vista en lo que no puede hacer. Una
 * implementación que devolviera algo plausible donde no hay cuentas haría
 * que una pantalla mal conectada funcionara en la demo y se cayera recién en
 * producción.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { crearAutenticacionMock } from "@/lib/auth/mock";
import { useSesion } from "@/lib/store/sesion";

const auth = crearAutenticacionMock();

beforeEach(() => {
  useSesion.getState().salir();
});

describe("actual", () => {
  it("sin nadie elegido no hay identidad", async () => {
    await expect(auth.actual()).resolves.toBeNull();
  });

  it("devuelve lo que se eligió en el selector", async () => {
    useSesion.getState().entrar({ rol: "cliente", clienteId: "cli-001" });

    await expect(auth.actual()).resolves.toEqual({
      rol: "cliente",
      clienteId: "cli-001",
      staff: undefined,
    });
  });

  it("al staff le conserva con qué firma", async () => {
    useSesion.getState().entrar({ rol: "staff", staff: "María" });
    await expect(auth.actual().then((i) => i?.staff)).resolves.toBe("María");
  });
});

describe("lo que el prototipo no tiene", () => {
  it("entrar, registrar y recuperar fallan diciendo por qué", async () => {
    for (const intento of [
      auth.entrar("a@b.cl", "x"),
      auth.registrar({ email: "a@b.cl", password: "x", nombre: "A" }),
      auth.recuperar("a@b.cl"),
    ]) {
      await expect(intento).rejects.toThrow(/no hay contraseñas/);
    }
  });
});

describe("salir", () => {
  it("deja la sesión vacía", async () => {
    useSesion.getState().entrar({ rol: "admin" });
    await auth.salir();
    await expect(auth.actual()).resolves.toBeNull();
  });
});

describe("alCambiar", () => {
  it("avisa cuando el selector cambia de rol", async () => {
    const vistas: (string | null)[] = [];
    const dejar = auth.alCambiar((i) => vistas.push(i?.rol ?? null));

    useSesion.getState().entrar({ rol: "admin" });
    useSesion.getState().salir();
    dejar();
    useSesion.getState().entrar({ rol: "staff" });

    // La tercera no se ve: ya se había desuscrito.
    expect(vistas).toEqual(["admin", null]);
  });
});

describe("la sesión sabe si ya se resolvió", () => {
  // `rol: null` significa "no hay nadie" Y "todavía no preguntamos". En la
  // nube averiguarlo es una ida al servidor, y una pantalla que no los
  // distinga muestra "no tienes reservas" a alguien que sí las tiene.
  it("en el prototipo nace resuelta, porque la respuesta es inmediata", () => {
    expect(useSesion.getState().resuelta).toBe(true);
  });

  it("sincronizar la deja resuelta, con o sin identidad", () => {
    useSesion.setState({ resuelta: false });
    useSesion.getState().sincronizar(null);
    expect(useSesion.getState().resuelta).toBe(true);
    expect(useSesion.getState().rol).toBeNull();

    useSesion.setState({ resuelta: false });
    useSesion.getState().sincronizar({ rol: "admin", email: "a@b.cl" });
    expect(useSesion.getState()).toMatchObject({
      resuelta: true,
      rol: "admin",
      email: "a@b.cl",
    });
  });

  // Entrar como otra persona no puede dejar restos de la anterior: un
  // clienteId viejo pegado a un rol nuevo le mostraría a un admin la cuenta
  // de un dueño.
  it("entrar limpia lo que había antes", () => {
    useSesion.getState().entrar({ rol: "cliente", clienteId: "cli-001" });
    useSesion.getState().entrar({ rol: "admin" });
    expect(useSesion.getState().clienteId).toBeUndefined();
  });
});
