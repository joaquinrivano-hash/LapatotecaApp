import { beforeEach, describe, expect, it } from "vitest";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import {
  actualizarPerroComoDueno,
  compararFichas,
} from "@/lib/servicios/perros";
import type { DatosPatoteca } from "@/lib/data/seed";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import type { Perro } from "@/lib/types";

const HOY = "2026-09-28";

const PELUSA: Perro = {
  id: "p1",
  clienteId: "cli-1",
  nombre: "Pelusa",
  raza: "Quiltro",
  pesoKg: 9,
  sexo: "macho",
  esterilizado: true,
  fechaNacimiento: "2022-03-10",
  vacunas: [
    { tipo: "octuple", fechaAplicacion: "2026-01-01", fechaVencimiento: "2027-01-01" },
  ],
  diaDePrueba: { estado: "aprobado" },
  alimentacion: { marca: "Proplan", cantidad: 1, unidad: "taza", comidas: ["almuerzo"] },
  creadoEn: "2026-01-01T12:00:00.000Z",
};

const CLIENTE = {
  id: "cli-1",
  nombre: "Joaquín",
  apellido: "Rivano",
  email: "j@ejemplo.cl",
  telefono: "+56987654321",
  comuna: "Providencia",
  creadoEn: "2026-01-01T12:00:00.000Z",
};

let repo: RepositorioPatoteca;

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: HOY,
    clientes: [CLIENTE],
    perros: [PELUSA],
  } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen, hoy: HOY });
});

describe("compararFichas", () => {
  it("una ficha igual a sí misma no tiene cambios", () => {
    expect(compararFichas(PELUSA, PELUSA)).toEqual([]);
  });

  it("guarda el antes y el después, en palabras", () => {
    const cambios = compararFichas(PELUSA, { ...PELUSA, pesoKg: 12 });

    expect(cambios).toEqual([
      { campo: "Peso", antes: "9 kg", despues: "12 kg" },
    ]);
  });

  it("dice sí o no, no true o false", () => {
    const [cambio] = compararFichas(PELUSA, {
      ...PELUSA,
      esterilizado: false,
    });

    expect(cambio).toEqual({ campo: "Castrado", antes: "sí", despues: "no" });
  });

  it("describe la comida como se lee, no como se guarda", () => {
    const [cambio] = compararFichas(PELUSA, {
      ...PELUSA,
      alimentacion: {
        marca: "Royal Canin",
        cantidad: 2,
        unidad: "taza",
        comidas: ["desayuno", "cena"],
      },
    });

    expect(cambio.antes).toBe("Proplan · 1 taza en almuerzo");
    expect(cambio.despues).toBe("Royal Canin · 2 tazas en desayuno y cena");
  });

  it("nota cuando se reemplaza una foto por otra", () => {
    const cambios = compararFichas(
      { ...PELUSA, fotoUrl: "data:image/jpeg;base64,uno" },
      { ...PELUSA, fotoUrl: "data:image/jpeg;base64,dos" },
    );

    expect(cambios).toEqual([
      { campo: "Foto", antes: "otra foto", despues: "una nueva" },
    ]);
  });

  it("nota una vacuna renovada", () => {
    const [cambio] = compararFichas(PELUSA, {
      ...PELUSA,
      vacunas: [
        {
          tipo: "octuple",
          fechaAplicacion: "2027-01-01",
          fechaVencimiento: "2028-01-01",
        },
      ],
    });

    expect(cambio.campo).toBe("Vacuna óctuple");
    expect(cambio.despues).toBe("vence el 01-01-2028");
  });
});

describe("actualizarPerroComoDueno", () => {
  it("guarda el cambio y deja el aviso con el nombre del dueño", async () => {
    const { perro, notificacion } = await actualizarPerroComoDueno(
      repo,
      "p1",
      { pesoKg: 12 },
      "2026-09-28T12:00:00.000Z",
    );

    expect(perro.pesoKg).toBe(12);
    expect(notificacion?.titulo).toBe(
      "Joaquín Rivano cambió la ficha de Pelusa",
    );
    expect(notificacion?.cambios).toEqual([
      { campo: "Peso", antes: "9 kg", despues: "12 kg" },
    ]);
    expect(notificacion?.leida).toBe(false);
  });

  it("queda en la bandeja sin leer de Administración", async () => {
    await actualizarPerroComoDueno(repo, "p1", { pesoKg: 12 });

    const sinLeer = await repo.notificaciones.sinLeer();
    expect(sinLeer).toHaveLength(1);
    expect(sinLeer[0].perroId).toBe("p1");
  });

  it("guardar sin cambiar nada no genera aviso", async () => {
    const { cambios, notificacion } = await actualizarPerroComoDueno(
      repo,
      "p1",
      { nombre: "Pelusa" },
    );

    expect(cambios).toEqual([]);
    expect(notificacion).toBeNull();
    expect(await repo.notificaciones.listar()).toEqual([]);
  });

  it("varios cambios a la vez van en un solo aviso", async () => {
    const { notificacion } = await actualizarPerroComoDueno(repo, "p1", {
      pesoKg: 12,
      esterilizado: false,
      notas: "Le da miedo la aspiradora.",
    });

    expect(notificacion?.cambios).toHaveLength(3);
    expect(await repo.notificaciones.listar()).toHaveLength(1);
  });
});
