import { describe, expect, it } from "vitest";

import { decidir, puertaDe } from "@/lib/auth/puertas";

describe("puertaDe", () => {
  it("custodia la rama completa, no solo su raíz", () => {
    expect(puertaDe("/admin")?.prefijo).toBe("/admin");
    expect(puertaDe("/admin/pagos")?.prefijo).toBe("/admin");
    expect(puertaDe("/staff/reportes")?.prefijo).toBe("/staff");
  });

  it("deja pasar lo público sin preguntar", () => {
    for (const ruta of ["/", "/tienda", "/reservar", "/ingresar", "/crear-cuenta"]) {
      expect(puertaDe(ruta)).toBeNull();
    }
  });

  // Con `startsWith` pelado una ruta futura con ese prefijo quedaría dentro
  // de la puerta de /admin sin que nadie lo pidiera, y quien la escriba no
  // va a entender por qué lo echa el proxy.
  it("no se queda con una ruta que apenas empieza igual", () => {
    expect(puertaDe("/administracion")).toBeNull();
    expect(puertaDe("/staffing")).toBeNull();
    expect(puertaDe("/mi-cuenta-nueva")).toBeNull();
  });
});

describe("decidir", () => {
  it("sin sesión, al login", () => {
    expect(decidir("/admin", null)).toEqual({ tipo: "al_login" });
    expect(decidir("/staff", null)).toEqual({ tipo: "al_login" });
    expect(decidir("/mi-cuenta", null)).toEqual({ tipo: "al_login" });
  });

  it("el backoffice es solo de Administración", () => {
    expect(decidir("/admin/pagos", "admin")).toEqual({ tipo: "pasa" });
    expect(decidir("/admin/pagos", "staff")).toEqual({
      tipo: "a_su_casa",
      destino: "/staff",
    });
    expect(decidir("/admin/pagos", "cliente")).toEqual({
      tipo: "a_su_casa",
      destino: "/mi-cuenta",
    });
  });

  // El admin también usa la cara del staff: es la misma casa.
  it("la cara del equipo la abre el cuidador y también el admin", () => {
    expect(decidir("/staff", "staff")).toEqual({ tipo: "pasa" });
    expect(decidir("/staff", "admin")).toEqual({ tipo: "pasa" });
    expect(decidir("/staff", "cliente")).toEqual({
      tipo: "a_su_casa",
      destino: "/mi-cuenta",
    });
  });

  it("mi cuenta la abre cualquiera que tenga sesión", () => {
    for (const rol of ["cliente", "staff", "admin"]) {
      expect(decidir("/mi-cuenta", rol)).toEqual({ tipo: "pasa" });
    }
  });

  // Un rol que no reconocemos no puede terminar abriendo una puerta.
  it("un rol desconocido no entra a ninguna parte reservada", () => {
    expect(decidir("/admin", "superadmin")).toMatchObject({ tipo: "a_su_casa" });
    expect(decidir("/staff", "")).toMatchObject({ tipo: "a_su_casa" });
    // Y si no sabemos dónde vive, a la portada: nunca a una rama cerrada.
    expect(decidir("/admin", "vecino")).toEqual({
      tipo: "a_su_casa",
      destino: "/",
    });
  });
});
