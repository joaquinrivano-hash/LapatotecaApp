import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca, SinId } from "@/lib/repo/tipos";
import type { MensajeSaliente } from "@/lib/types";
import type { ArmadoMensajes } from "./armado";
import { crearCanalSimulado } from "./canal-simulado";
import { despacharArmado, reintentarMensaje } from "./servicio";

const AHORA = "2026-09-21T18:00:00.000Z";

function borrador(destino: string, clienteId: string): SinId<MensajeSaliente> {
  return {
    canal: "whatsapp",
    clienteId,
    destino,
    plantilla: "reporte_diario",
    idioma: "es_CL",
    parametros: ["Javiera", "Pelusa", "Durmió toda la tarde."],
    vistaPrevia: "¡Hola Javiera!",
    estado: "pendiente",
    intentos: 0,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
  };
}

function armado(...borradores: SinId<MensajeSaliente>[]): ArmadoMensajes {
  return { mensajes: borradores, omitidos: [] };
}

let repo: RepositorioPatoteca;

beforeEach(() => {
  // Set mínimo: el repositorio rellena las colecciones que falten, así que no
  // hace falta generar el seed completo para probar la bandeja.
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, { hoy: "2026-09-21" } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
});

const sinDemora = { latenciaMs: 0 };

describe("despacharArmado", () => {
  it("guarda y envía cada mensaje", async () => {
    const resultado = await despacharArmado(
      repo,
      crearCanalSimulado(sinDemora),
      armado(borrador("+56911111111", "cli-1"), borrador("+56922222222", "cli-2")),
      AHORA,
    );

    expect(resultado.enviados).toBe(2);
    expect(resultado.fallidos).toBe(0);
    expect(resultado.mensajes.every((m) => m.estado === "enviado")).toBe(true);
    expect(resultado.mensajes.every((m) => m.idProveedor)).toBeTruthy();
    expect(await repo.mensajes.listar()).toHaveLength(2);
  });

  it("cuenta el intento", async () => {
    const { mensajes } = await despacharArmado(
      repo,
      crearCanalSimulado(sinDemora),
      armado(borrador("+56911111111", "cli-1")),
      AHORA,
    );
    expect(mensajes[0].intentos).toBe(1);
  });

  it("deja el mensaje fallido con su motivo en vez de perderlo", async () => {
    const canal = crearCanalSimulado({
      ...sinDemora,
      falla: () => "El número no tiene WhatsApp.",
    });

    const resultado = await despacharArmado(
      repo,
      canal,
      armado(borrador("+56911111111", "cli-1")),
      AHORA,
    );

    expect(resultado.fallidos).toBe(1);
    expect(resultado.mensajes[0].estado).toBe("fallido");
    expect(resultado.mensajes[0].error).toContain("no tiene WhatsApp");
    // Sigue guardado: se puede reintentar.
    expect(await repo.mensajes.fallidos()).toHaveLength(1);
  });

  it("un teléfono malo no deja sin reporte al resto de los dueños", async () => {
    const canal = crearCanalSimulado({
      ...sinDemora,
      falla: (m) => (m.destino === "+56922222222" ? "Número inválido." : null),
    });

    const resultado = await despacharArmado(
      repo,
      canal,
      armado(
        borrador("+56911111111", "cli-1"),
        borrador("+56922222222", "cli-2"),
        borrador("+56933333333", "cli-3"),
      ),
      AHORA,
    );

    expect(resultado.enviados).toBe(2);
    expect(resultado.fallidos).toBe(1);
  });

  it("arrastra los omitidos para que la pantalla los muestre", async () => {
    const resultado = await despacharArmado(
      repo,
      crearCanalSimulado(sinDemora),
      {
        mensajes: [borrador("+56911111111", "cli-1")],
        omitidos: [
          { clienteId: "cli-9", nombre: "Rocío Soto", motivo: "Sin teléfono." },
        ],
      },
      AHORA,
    );

    expect(resultado.omitidos).toHaveLength(1);
    expect(resultado.omitidos[0].nombre).toBe("Rocío Soto");
  });

  it("guarda la referencia para poder buscar los mensajes de un reporte", async () => {
    await despacharArmado(
      repo,
      crearCanalSimulado(sinDemora),
      armado({
        ...borrador("+56911111111", "cli-1"),
        referencia: { tipo: "reporte", id: "rep-7" },
      }),
      AHORA,
    );

    expect(await repo.mensajes.porReferencia("reporte", "rep-7")).toHaveLength(1);
  });
});

describe("reintentarMensaje", () => {
  it("vuelve a intentar y suma el intento", async () => {
    let debeFallar = true;
    const canal = crearCanalSimulado({
      ...sinDemora,
      falla: () => (debeFallar ? "Se cayó la red." : null),
    });

    const { mensajes } = await despacharArmado(
      repo,
      canal,
      armado(borrador("+56911111111", "cli-1")),
      AHORA,
    );
    expect(mensajes[0].estado).toBe("fallido");

    debeFallar = false;
    const reintentado = await reintentarMensaje(repo, canal, mensajes[0].id);

    expect(reintentado.estado).toBe("enviado");
    expect(reintentado.intentos).toBe(2);
    // El error viejo no queda pegado.
    expect(reintentado.error).toBeUndefined();
    expect(await repo.mensajes.fallidos()).toHaveLength(0);
  });

  it("reclama si el mensaje no existe", async () => {
    await expect(
      reintentarMensaje(repo, crearCanalSimulado(sinDemora), "msg-999"),
    ).rejects.toThrow();
  });
});
