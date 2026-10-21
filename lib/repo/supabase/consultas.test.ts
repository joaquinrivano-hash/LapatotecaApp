import { describe, expect, it } from "vitest";

import {
  enRangoDeDias,
  filtroEnColumnas,
  limitesDelRango,
  seTraslapan,
  terminosDeBusqueda,
} from "@/lib/repo/supabase/consultas";
import { fechaISO } from "@/lib/utils/fecha";

describe("terminosDeBusqueda", () => {
  it("parte el texto en palabras", () => {
    expect(terminosDeBusqueda("javiera soto")).toEqual(["javiera", "soto"]);
  });

  it("ignora los espacios de sobra", () => {
    expect(terminosDeBusqueda("  pelusa   ")).toEqual(["pelusa"]);
  });

  it("devuelve vacío cuando no hay nada que buscar", () => {
    expect(terminosDeBusqueda("   ")).toEqual([]);
  });

  // Una coma en "Pérez, Javiera" partiría el filtro en dos condiciones y la
  // consulta devolvería filas que nadie pidió.
  it("saca los caracteres que significan algo en un filtro", () => {
    expect(terminosDeBusqueda("Pérez, Javiera")).toEqual(["Pérez", "Javiera"]);
    expect(terminosDeBusqueda("a*b%c(d)e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(terminosDeBusqueda('co"mi\\llas')).toEqual(["co", "mi", "llas"]);
  });

  it("conserva las tildes y la ñ, que son parte del nombre", () => {
    expect(terminosDeBusqueda("Núñez")).toEqual(["Núñez"]);
  });

  it("conserva el arroba y el punto de un correo", () => {
    expect(terminosDeBusqueda("javi@gmail.com")).toEqual(["javi@gmail.com"]);
  });
});

describe("filtroEnColumnas", () => {
  it("pregunta por el término en cada columna", () => {
    expect(filtroEnColumnas(["nombre", "apellido"], "soto")).toBe(
      'nombre.ilike."*soto*",apellido.ilike."*soto*"',
    );
  });

  // Sin las comillas, el punto del correo se lee como el separador entre
  // columna, operador y valor.
  it("cita el valor para que el punto de un correo no lo parta", () => {
    expect(filtroEnColumnas(["email"], "javi.cl")).toBe(
      'email.ilike."*javi.cl*"',
    );
  });
});

describe("limitesDelRango", () => {
  it("abarca el rango pedido con holgura a los dos lados", () => {
    const limites = limitesDelRango("2026-09-10", "2026-09-12");
    expect(fechaISO(limites.desde)).toBe("2026-09-09");
    expect(fechaISO(limites.hasta)).toBe("2026-09-14");
  });

  // Lo que importa no es el ancho exacto sino que la primera y la última hora
  // del rango de Santiago queden adentro: ahí es donde el desfase con UTC
  // hacía perder estadías.
  it("deja adentro la medianoche del primer día y el final del último", () => {
    const limites = limitesDelRango("2026-09-10", "2026-09-12");
    const primeraHora = new Date("2026-09-10T00:00:00-03:00").toISOString();
    const ultimaHora = new Date("2026-09-12T23:59:59-03:00").toISOString();
    expect(limites.desde <= primeraHora).toBe(true);
    expect(limites.hasta >= ultimaHora).toBe(true);
  });

  it("también funciona con un rango de un solo día", () => {
    const limites = limitesDelRango("2026-09-10", "2026-09-10");
    const primeraHora = new Date("2026-09-10T00:00:00-03:00").toISOString();
    const ultimaHora = new Date("2026-09-10T23:59:59-03:00").toISOString();
    expect(limites.desde <= primeraHora).toBe(true);
    expect(limites.hasta >= ultimaHora).toBe(true);
  });
});

describe("seTraslapan", () => {
  it("reconoce una estadía que empezó antes y sigue adentro", () => {
    expect(seTraslapan("2026-09-08", "2026-09-11", "2026-09-10", "2026-09-12"))
      .toBe(true);
  });

  it("acepta el traslape de un solo día en el borde", () => {
    expect(seTraslapan("2026-09-05", "2026-09-10", "2026-09-10", "2026-09-12"))
      .toBe(true);
    expect(seTraslapan("2026-09-12", "2026-09-20", "2026-09-10", "2026-09-12"))
      .toBe(true);
  });

  it("descarta lo que queda completamente afuera", () => {
    expect(seTraslapan("2026-09-01", "2026-09-09", "2026-09-10", "2026-09-12"))
      .toBe(false);
    expect(seTraslapan("2026-09-13", "2026-09-14", "2026-09-10", "2026-09-12"))
      .toBe(false);
  });
});

describe("enRangoDeDias", () => {
  it("incluye los dos extremos", () => {
    expect(enRangoDeDias("2026-09-10", "2026-09-10", "2026-09-12")).toBe(true);
    expect(enRangoDeDias("2026-09-12", "2026-09-10", "2026-09-12")).toBe(true);
  });

  it("deja afuera el día anterior y el siguiente", () => {
    expect(enRangoDeDias("2026-09-09", "2026-09-10", "2026-09-12")).toBe(false);
    expect(enRangoDeDias("2026-09-13", "2026-09-10", "2026-09-12")).toBe(false);
  });
});
