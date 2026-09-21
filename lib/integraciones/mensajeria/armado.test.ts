import { describe, expect, it } from "vitest";
import type { Cliente, Incidente, Perro, Reporte } from "@/lib/types";
import { armarMensajeDeIncidente, armarMensajesDeReporte } from "./armado";

const AHORA = "2026-09-21T18:00:00.000Z";

function cliente(id: string, nombre: string, telefono: string): Cliente {
  return {
    id,
    nombre,
    apellido: "Soto",
    email: `${nombre.toLowerCase()}@correo.cl`,
    telefono,
    comuna: "Providencia",
    creadoEn: AHORA,
  };
}

function perro(id: string, nombre: string, clienteId: string): Perro {
  return {
    id,
    clienteId,
    nombre,
    raza: "Quiltro",
    pesoKg: 12,
    sexo: "hembra",
    esterilizado: true,
    vacunas: [],
    diaDePrueba: { estado: "aprobado" },
    creadoEn: AHORA,
  };
}

const JAVIERA = cliente("cli-1", "Javiera", "+569 1111 1111");
const MATIAS = cliente("cli-2", "Matías", "+569 2222 2222");
const SIN_TELEFONO = cliente("cli-3", "Rocío", "no tengo");

const PELUSA = perro("perro-1", "Pelusa", JAVIERA.id);
const ROCCO = perro("perro-2", "Rocco", JAVIERA.id);
const LUNA = perro("perro-3", "Luna", MATIAS.id);
const TOBI = perro("perro-4", "Tobi", SIN_TELEFONO.id);

function reporte(perroIds: string[]): Reporte {
  return {
    id: "rep-1",
    perroIds,
    fecha: "2026-09-21",
    nota: "Jugaron toda la mañana y durmieron siesta.",
    fotoUrl: "https://ejemplo.cl/foto.jpg",
    autorStaff: "Cata",
    creadoEn: AHORA,
  };
}

describe("armarMensajesDeReporte", () => {
  it("manda UN mensaje por dueño, no uno por perro", () => {
    const { mensajes } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id, ROCCO.id, LUNA.id]),
      perros: [PELUSA, ROCCO, LUNA],
      clientes: [JAVIERA, MATIAS],
      ahora: AHORA,
    });

    expect(mensajes).toHaveLength(2);
    expect(new Set(mensajes.map((m) => m.clienteId))).toEqual(
      new Set([JAVIERA.id, MATIAS.id]),
    );
  });

  it("nombra a los dos perros del mismo dueño en un solo mensaje", () => {
    const { mensajes } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id, ROCCO.id]),
      perros: [PELUSA, ROCCO],
      clientes: [JAVIERA],
      ahora: AHORA,
    });

    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].vistaPrevia).toContain("Pelusa y Rocco");
    expect(mensajes[0].vistaPrevia).toContain("¡Hola Javiera!");
  });

  it("normaliza el teléfono a E.164 para WhatsApp", () => {
    const { mensajes } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id]),
      perros: [PELUSA],
      clientes: [JAVIERA],
      ahora: AHORA,
    });
    expect(mensajes[0].destino).toBe("+56911111111");
  });

  it("adjunta la foto y deja la referencia al reporte", () => {
    const { mensajes } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id]),
      perros: [PELUSA],
      clientes: [JAVIERA],
      ahora: AHORA,
    });
    expect(mensajes[0].adjuntoUrl).toBe("https://ejemplo.cl/foto.jpg");
    expect(mensajes[0].referencia).toEqual({ tipo: "reporte", id: "rep-1" });
    expect(mensajes[0].estado).toBe("pendiente");
    expect(mensajes[0].intentos).toBe(0);
  });

  it("omite al dueño sin teléfono válido y dice por qué", () => {
    const { mensajes, omitidos } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id, TOBI.id]),
      perros: [PELUSA, TOBI],
      clientes: [JAVIERA, SIN_TELEFONO],
      ahora: AHORA,
    });

    expect(mensajes).toHaveLength(1);
    expect(omitidos).toHaveLength(1);
    expect(omitidos[0].nombre).toContain("Rocío");
    expect(omitidos[0].motivo).toContain("teléfono");
  });

  it("un dueño sin ficha no rompe el envío del resto", () => {
    const { mensajes, omitidos } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id, LUNA.id]),
      perros: [PELUSA, LUNA],
      clientes: [JAVIERA],
      ahora: AHORA,
    });
    expect(mensajes).toHaveLength(1);
    expect(omitidos).toHaveLength(1);
  });

  it("ignora perros que no están en el reporte", () => {
    const { mensajes } = armarMensajesDeReporte({
      reporte: reporte([PELUSA.id]),
      perros: [PELUSA, LUNA],
      clientes: [JAVIERA, MATIAS],
      ahora: AHORA,
    });
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].clienteId).toBe(JAVIERA.id);
  });
});

describe("armarMensajeDeIncidente", () => {
  const incidente: Incidente = {
    id: "inc-1",
    perroId: PELUSA.id,
    fecha: "2026-09-21",
    tipo: "comportamiento",
    gravedad: "leve",
    descripcion: "Gruñó cuando otro perro se acercó a su plato.",
    autorStaff: "Nico",
    creadoEn: AHORA,
  };

  it("avisa al dueño con el detalle de lo que pasó", () => {
    const { mensajes } = armarMensajeDeIncidente({
      incidente,
      perro: PELUSA,
      cliente: JAVIERA,
      ahora: AHORA,
    });

    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].plantilla).toBe("aviso_incidente");
    expect(mensajes[0].vistaPrevia).toContain("Pelusa");
    expect(mensajes[0].vistaPrevia).toContain("Gruñó cuando otro perro");
    expect(mensajes[0].referencia).toEqual({ tipo: "incidente", id: "inc-1" });
  });

  it("sin teléfono válido no manda nada y lo reporta", () => {
    const { mensajes, omitidos } = armarMensajeDeIncidente({
      incidente: { ...incidente, perroId: TOBI.id },
      perro: TOBI,
      cliente: SIN_TELEFONO,
      ahora: AHORA,
    });
    expect(mensajes).toHaveLength(0);
    expect(omitidos).toHaveLength(1);
  });
});
