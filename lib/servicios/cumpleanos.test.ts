import { beforeEach, describe, expect, it } from "vitest";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import { cumpleanosDeHoy, cumpleanosDelMes } from "@/lib/servicios/cumpleanos";
import type { DatosPatoteca } from "@/lib/data/seed";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type { Perro } from "@/lib/types";

const HOY = "2026-09-28";

function perro(id: string, nombre: string, nacimiento?: string): Perro {
  return {
    id,
    clienteId: "cli-1",
    nombre,
    raza: "Quiltro",
    pesoKg: 9,
    sexo: "hembra",
    esterilizado: true,
    fechaNacimiento: nacimiento,
    vacunas: [],
    diaDePrueba: { estado: "aprobado" },
    creadoEn: "2026-01-01T12:00:00.000Z",
  };
}

let repo: RepositorioPatoteca;

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: HOY,
    clientes: [
      {
        id: "cli-1",
        nombre: "Joaquín",
        apellido: "Rivano",
        email: "j@ejemplo.cl",
        telefono: "+56987654321",
        comuna: "Providencia",
        creadoEn: "2026-01-01T12:00:00.000Z",
      },
    ],
    perros: [
      perro("p1", "Pelusa", "2020-09-28"),
      perro("p2", "Rocco", "2019-09-05"),
      perro("p3", "Luna", "2021-10-02"),
      perro("p4", "Sin fecha"),
    ],
  } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen, hoy: HOY });
});

describe("cumpleanosDeHoy", () => {
  it("encuentra al que cumple hoy y dice cuántos cumple", async () => {
    const hoy = await cumpleanosDeHoy(repo, HOY);

    expect(hoy).toHaveLength(1);
    expect(hoy[0].perro.nombre).toBe("Pelusa");
    expect(hoy[0].cumple).toBe(6);
  });

  it("trae al dueño, para poder saludarlo", async () => {
    const [cumpleanos] = await cumpleanosDeHoy(repo, HOY);
    expect(cumpleanos.cliente?.nombre).toBe("Joaquín");
  });

  it("un día sin cumpleaños no devuelve nada", async () => {
    expect(await cumpleanosDeHoy(repo, "2026-09-29")).toEqual([]);
  });
});

describe("cumpleanosDelMes", () => {
  it("trae los del mes en orden y deja fuera los de otros meses", async () => {
    const mes = await cumpleanosDelMes(repo, HOY);

    expect(mes.map((c) => c.perro.nombre)).toEqual(["Rocco", "Pelusa"]);
    expect(mes.map((c) => c.fecha)).toEqual(["2026-09-05", "2026-09-28"]);
  });

  it("ignora a los perros sin fecha de nacimiento", async () => {
    const mes = await cumpleanosDelMes(repo, HOY);
    expect(mes.some((c) => c.perro.nombre === "Sin fecha")).toBe(false);
  });
});
