import { beforeEach, describe, expect, it } from "vitest";

import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  diasDePruebaPorEvaluar,
  diasDePruebaQueVienen,
  esperandoSuPrimeraReserva,
  reciénAprobados,
  resolverDiaDePrueba,
} from "@/lib/servicios/evaluacion";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { Cliente, EstadiaJardin, Perro } from "@/lib/types";

const HOY = "2026-10-22";
let repo: RepositorioPatoteca;

const CLIENTE: Cliente = {
  id: "cli-1",
  nombre: "Camila",
  apellido: "Rojas",
  email: "camila@correo.cl",
  telefono: "+56987654321",
  comuna: "Providencia",
  creadoEn: "2026-10-01T12:00:00.000Z",
};

const perro = (extra: Partial<Perro> = {}): Perro => ({
  id: "perro-1",
  clienteId: "cli-1",
  nombre: "Trufa",
  raza: "Quiltro",
  pesoKg: 9,
  sexo: "hembra",
  esterilizado: true,
  vacunas: [],
  diaDePrueba: { estado: "agendado", fecha: "2026-10-20" },
  creadoEn: "2026-10-01T12:00:00.000Z",
  ...extra,
});

const estadia = (fecha: string, extra: Partial<EstadiaJardin> = {}): EstadiaJardin => ({
  id: "est-1",
  clienteId: "cli-1",
  perroId: "perro-1",
  fecha,
  inicioProgramado: instanteEnHora(fecha, "09:00"),
  finProgramado: instanteEnHora(fecha, "15:00"),
  origen: "dia_de_prueba",
  estado: "finalizada",
  creadaEn: "2026-10-01T12:00:00.000Z",
  ...extra,
});

function montar(datos: Partial<DatosPatoteca> = {}) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: HOY,
    clientes: [CLIENTE],
    perros: [],
    ...datos,
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

describe("diasDePruebaPorEvaluar", () => {
  it("trae el que ya pasó y sigue agendado", async () => {
    montar({ perros: [perro()], estadiasJardin: [estadia("2026-10-20")] });
    const cola = await diasDePruebaPorEvaluar(repo, HOY);
    expect(cola).toHaveLength(1);
    expect(cola[0].perro.nombre).toBe("Trufa");
    expect(cola[0].cliente?.nombre).toBe("Camila");
    expect(cola[0].diasEsperando).toBe(2);
  });

  // Un día de prueba del jueves no se evalúa el martes.
  it("no trae los que todavía no ocurren", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-30" } })],
      estadiasJardin: [estadia("2026-10-30")],
    });
    await expect(diasDePruebaPorEvaluar(repo, HOY)).resolves.toEqual([]);
  });

  it("el de hoy sí entra: la jornada ya se vivió", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: HOY } })],
      estadiasJardin: [estadia(HOY)],
    });
    const cola = await diasDePruebaPorEvaluar(repo, HOY);
    expect(cola).toHaveLength(1);
    expect(cola[0].diasEsperando).toBe(0);
  });

  it("deja fuera los ya resueltos", async () => {
    montar({
      perros: [
        perro({ id: "p-ok", diaDePrueba: { estado: "aprobado", fecha: "2026-10-20" } }),
        perro({ id: "p-no", diaDePrueba: { estado: "rechazado", fecha: "2026-10-20" } }),
        perro({ id: "p-nuevo", diaDePrueba: { estado: "pendiente" } }),
      ],
    });
    await expect(diasDePruebaPorEvaluar(repo, HOY)).resolves.toEqual([]);
  });

  // Lo que se añeja es lo que se termina no decidiendo.
  it("ordena por el que lleva más tiempo esperando", async () => {
    montar({
      perros: [
        perro({ id: "p-reciente", diaDePrueba: { estado: "agendado", fecha: "2026-10-21" } }),
        perro({ id: "p-viejo", diaDePrueba: { estado: "agendado", fecha: "2026-10-10" } }),
      ],
    });
    const cola = await diasDePruebaPorEvaluar(repo, HOY);
    expect(cola.map((x) => x.perro.id)).toEqual(["p-viejo", "p-reciente"]);
  });

  // Si lo reprogramaron, la jornada es la que quedó.
  it("la fecha de la jornada manda sobre la de la ficha", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-10" } })],
      estadiasJardin: [estadia("2026-10-21")],
    });
    const [x] = await diasDePruebaPorEvaluar(repo, HOY);
    expect(x.fecha).toBe("2026-10-21");
    expect(x.diasEsperando).toBe(1);
  });

  it("sin fecha en ninguna parte no se puede decir que pasó", async () => {
    montar({ perros: [perro({ diaDePrueba: { estado: "agendado" } })] });
    await expect(diasDePruebaPorEvaluar(repo, HOY)).resolves.toEqual([]);
  });
});

describe("resolverDiaDePrueba", () => {
  beforeEach(() => montar({ perros: [perro()], estadiasJardin: [estadia("2026-10-20")] }));

  it("aprobar deja al perro listo para reservar", async () => {
    const p = await resolverDiaDePrueba(repo, "perro-1", "aprobado");
    expect(p.diaDePrueba.estado).toBe("aprobado");
    await expect(diasDePruebaPorEvaluar(repo, HOY)).resolves.toEqual([]);
  });

  it("rechazar guarda el motivo", async () => {
    const p = await resolverDiaDePrueba(
      repo, "perro-1", "rechazado", "  Se puso brusco con los chicos  ",
    );
    expect(p.diaDePrueba.estado).toBe("rechazado");
    expect(p.diaDePrueba.nota).toBe("Se puso brusco con los chicos");
  });

  // "Le costó la primera hora pero después jugó bien" es justo lo que el
  // equipo quiere leer el día que llegue.
  it("también guarda la nota al aprobar", async () => {
    const p = await resolverDiaDePrueba(repo, "perro-1", "aprobado", "Le costó la mañana");
    expect(p.diaDePrueba.nota).toBe("Le costó la mañana");
  });

  it("sin nota no borra la que había", async () => {
    montar({ perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-20", nota: "vino con su manta" } })] });
    const p = await resolverDiaDePrueba(repo, "perro-1", "aprobado", "   ");
    expect(p.diaDePrueba.nota).toBe("vino con su manta");
  });

  // Aprobar dos veces sería reabrir algo ya decidido sin dejar rastro.
  it("no se resuelve dos veces", async () => {
    await resolverDiaDePrueba(repo, "perro-1", "aprobado");
    await expect(
      resolverDiaDePrueba(repo, "perro-1", "rechazado"),
    ).rejects.toThrow(/está aprobado/);
  });

  it("tampoco se resuelve uno que nunca se agendó", async () => {
    montar({ perros: [perro({ diaDePrueba: { estado: "pendiente" } })] });
    await expect(
      resolverDiaDePrueba(repo, "perro-1", "aprobado"),
    ).rejects.toThrow(/está pendiente/);
  });

  it("falla claro si el perro ya no está", async () => {
    await expect(
      resolverDiaDePrueba(repo, "perro-999", "aprobado"),
    ).rejects.toThrow(/ya no está/);
  });
});

describe("esperandoSuPrimeraReserva", () => {
  const aprobado = perro({ diaDePrueba: { estado: "aprobado", fecha: "2026-10-20" } });

  // Lo único que cambió en su pantalla al aprobarlo fue que DESAPARECIÓ un
  // aviso, y la ausencia de una advertencia no se nota.
  it("sí, apenas lo aprueban", () => {
    expect(esperandoSuPrimeraReserva(aprobado, [], [])).toBe(true);
  });

  it("el día de prueba mismo no cuenta como reserva", () => {
    expect(
      esperandoSuPrimeraReserva(aprobado, [estadia("2026-10-20")], []),
    ).toBe(true);
  });

  it("no, si ya reservó un día de jardín", () => {
    expect(
      esperandoSuPrimeraReserva(
        aprobado,
        [estadia("2026-10-28", { id: "est-2", origen: "dia_suelto" })],
        [],
      ),
    ).toBe(false);
  });

  it("no, si ya reservó hotel", () => {
    expect(esperandoSuPrimeraReserva(aprobado, [], [{ perroId: "perro-1" }])).toBe(
      false,
    );
  });

  it("no, mientras no esté aprobado", () => {
    for (const estado of ["pendiente", "agendado", "rechazado"] as const) {
      expect(
        esperandoSuPrimeraReserva(perro({ diaDePrueba: { estado } }), [], []),
      ).toBe(false);
    }
  });

  // Un hermano que ya reservó no habla por él: el aviso es por perro.
  it("la reserva de OTRO perro no lo apaga", () => {
    expect(
      esperandoSuPrimeraReserva(aprobado, [], [{ perroId: "otro-perro" }]),
    ).toBe(true);
  });
});

describe("reciénAprobados", () => {
  it("trae solo a los que quedaron habilitados y no han reservado", async () => {
    montar({
      perros: [
        perro({ id: "p-listo", diaDePrueba: { estado: "aprobado", fecha: "2026-10-20" } }),
        perro({ id: "p-esperando", diaDePrueba: { estado: "agendado", fecha: "2026-10-20" } }),
      ],
    });
    const listos = await reciénAprobados(repo, "cli-1");
    expect(listos.map((p) => p.id)).toEqual(["p-listo"]);
  });

  it("se apaga solo cuando reserva", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "aprobado", fecha: "2026-10-20" } })],
      estadiasJardin: [estadia("2026-10-28", { id: "est-2", origen: "dia_suelto" })],
    });
    await expect(reciénAprobados(repo, "cli-1")).resolves.toEqual([]);
  });
});

describe("diasDePruebaQueVienen", () => {
  it("muestra el día de prueba agendado a futuro", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-29" } })],
      estadiasJardin: [estadia("2026-10-29", { estado: "esperada" })],
    });

    const [x] = await diasDePruebaQueVienen(repo, HOY);
    expect(x.perro.nombre).toBe("Trufa");
    expect(x.fecha).toBe("2026-10-29");
    expect(x.diasParaQueLlegue).toBe(7);
    expect(x.cliente?.nombre).toBe("Camila");
  });

  it("el de hoy todavía cuenta como que viene", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: HOY } })],
      estadiasJardin: [estadia(HOY, { estado: "esperada" })],
    });

    const [x] = await diasDePruebaQueVienen(repo, HOY);
    expect(x.diasParaQueLlegue).toBe(0);
  });

  it("el que ya pasó no viene: lo toma la cola de veredictos", async () => {
    montar({
      perros: [perro()],
      estadiasJardin: [estadia("2026-10-20")],
    });

    await expect(diasDePruebaQueVienen(repo, HOY)).resolves.toEqual([]);
    expect(await diasDePruebaPorEvaluar(repo, HOY)).toHaveLength(1);
  });

  it("una cancelada no viene", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-29" } })],
      estadiasJardin: [estadia("2026-10-29", { estado: "cancelada" })],
    });

    await expect(diasDePruebaQueVienen(repo, HOY)).resolves.toEqual([]);
  });

  it("manda la fecha de la estadía, no la de la ficha: reprogramar la mueve", async () => {
    montar({
      // La ficha quedó con la fecha vieja y la jornada se movió al 29.
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-24" } })],
      estadiasJardin: [estadia("2026-10-29", { estado: "esperada" })],
    });

    const [x] = await diasDePruebaQueVienen(repo, HOY);
    expect(x.fecha).toBe("2026-10-29");
  });

  it("un día suelto normal no es un día de prueba", async () => {
    montar({
      perros: [perro({ diaDePrueba: { estado: "agendado", fecha: "2026-10-29" } })],
      estadiasJardin: [
        estadia("2026-10-29", { estado: "esperada", origen: "dia_suelto" }),
      ],
    });

    await expect(diasDePruebaQueVienen(repo, HOY)).resolves.toEqual([]);
  });

  it("salen ordenados por el que llega primero", async () => {
    montar({
      perros: [
        perro({ id: "perro-1", nombre: "Trufa" }),
        perro({ id: "perro-2", nombre: "Mota" }),
      ],
      estadiasJardin: [
        estadia("2026-10-30", { id: "e1", perroId: "perro-1", estado: "esperada" }),
        estadia("2026-10-25", { id: "e2", perroId: "perro-2", estado: "esperada" }),
      ],
    });

    const cola = await diasDePruebaQueVienen(repo, HOY);
    expect(cola.map((x) => x.perro.nombre)).toEqual(["Mota", "Trufa"]);
  });
});
