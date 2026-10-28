import { beforeEach, describe, expect, it } from "vitest";

import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  CLAVE_NOVEDAD,
  claveDeMedicamento,
  claveDePaso,
} from "@/lib/rules/tareas";
import {
  anotarEnElDia,
  anotarQuienNoComio,
  archivarTarea,
  cargarRutinaSugerida,
  cargarTareasDelDia,
  crearTarea,
  marcarTarea,
  resumenDelDia,
} from "@/lib/servicios/tareas";
import { NEGOCIO } from "@/lib/config/negocio";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { EstadiaJardin, Perro } from "@/lib/types";

const LUNES = "2026-10-26";
const MARTES = "2026-10-27";
const FLO = { autorStaff: "Flo", autorId: "staff-flo" };
const JOSE = { autorStaff: "José", autorId: "staff-jose" };
let repo: RepositorioPatoteca;

const perro = (id: string, nombre: string, extra: Partial<Perro> = {}) =>
  ({
    id,
    clienteId: "cli-1",
    nombre,
    raza: "Mestizo",
    sexo: "hembra",
    pesoKg: 8,
    esterilizado: true,
    vacunas: [],
    diaDePrueba: { estado: "aprobado" },
    creadoEn: "2026-01-01T12:00:00.000Z",
    ...extra,
  }) as unknown as Perro;

const estadia = (id: string, perroId: string, estado: EstadiaJardin["estado"]) =>
  ({
    id,
    clienteId: "cli-1",
    perroId,
    fecha: LUNES,
    inicioProgramado: instanteEnHora(LUNES, "08:00"),
    finProgramado: instanteEnHora(LUNES, "18:00"),
    origen: "dia_suelto",
    estado,
    creadaEn: "2026-10-01T12:00:00.000Z",
  }) as EstadiaJardin;

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: LUNES,
    clientes: [],
    perros: [
      perro("p-mara", "Mara"),
      perro("p-kuky", "Kuky", {
        medicamentos: [{ nombre: "Fluoxetina", dosis: "1/2", frecuencia: "AM" }],
      }),
      perro("p-togo", "Togo"),
    ],
    estadiasJardin: [
      estadia("e1", "p-mara", "presente"),
      estadia("e2", "p-kuky", "presente"),
      // Togo se esperaba y no llegó: no tiene por qué aparecer.
      estadia("e3", "p-togo", "esperada"),
    ],
    reservasHotel: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
});

const a = (hhmm: string) => instanteEnHora(LUNES, hhmm);

describe("cargarTareasDelDia", () => {
  it("sin rutina lo dice, y la rutina de cada comida igual está", async () => {
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    expect(dia.hayRutina).toBe(false);
    expect(dia.rondas.map((r) => r.ronda)).toEqual(["manana", "mediodia", "tarde"]);
    expect(dia.rondas[0].pasos[0].titulo).toBe("Desayuno");
  });

  it("los perros del día son los que están en la casa", async () => {
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    expect(dia.perros.map((p) => p.nombre)).toEqual(["Kuky", "Mara"]);
    expect(dia.remedios.map((r) => r.perro.nombre)).toEqual(["Kuky"]);
  });

  it("el encargo de ayer sin hacer aparece hoy, y hecho hoy no aparece mañana", async () => {
    const encargo = await crearTarea(repo, "encargo", {
      titulo: "Lijar la puerta",
      fecha: LUNES,
    });
    let martes = await cargarTareasDelDia(repo, MARTES, instanteEnHora(MARTES, "09:00"));
    expect(martes.tareas[0].arrastradaDesde).toBe(LUNES);

    await marcarTarea(repo, { fecha: MARTES, clave: encargo.id, estado: "hecha" }, FLO);
    martes = await cargarTareasDelDia(repo, MARTES, instanteEnHora(MARTES, "09:00"));
    expect(martes.tareas[0].estado).toBe("hecha");

    const miercoles = await cargarTareasDelDia(
      repo,
      "2026-10-28",
      instanteEnHora("2026-10-28", "09:00"),
    );
    expect(miercoles.tareas).toHaveLength(0);
  });
});

describe("marcarTarea", () => {
  it("marcar dos veces corrige, no duplica", async () => {
    const clave = claveDePaso("manana", "aguas");
    await marcarTarea(repo, { fecha: LUNES, clave, estado: "en_proceso" }, FLO, a("09:00"));
    await marcarTarea(repo, { fecha: LUNES, clave, estado: "hecha" }, JOSE, a("09:30"));
    const registros = await repo.registrosDeTareas.enRango(LUNES, LUNES);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ estado: "hecha", autorStaff: "José" });
  });

  it("desmarcar deja pendiente sin borrar lo de otro", async () => {
    const clave = claveDePaso("manana", "cacas");
    await marcarTarea(repo, { fecha: LUNES, clave, estado: "hecha" }, JOSE);
    await marcarTarea(repo, { fecha: LUNES, clave, estado: "pendiente" }, FLO);
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    expect(dia.rondas[0].pasos.find((p) => p.paso === "cacas")?.estado).toBe(
      "pendiente",
    );
  });

  it("'no se hizo' pide el motivo", async () => {
    await expect(
      marcarTarea(repo, { fecha: LUNES, clave: "x", estado: "no_se_hizo" }, FLO),
    ).rejects.toThrow(/por qué/);
  });

  it("una novedad no se marca, se anota", async () => {
    await expect(
      marcarTarea(repo, { fecha: LUNES, clave: CLAVE_NOVEDAD, estado: "hecha" }, FLO),
    ).rejects.toThrow();
  });

  it("anotar quién no comió no cambia la hora de la comida", async () => {
    const comida = await marcarTarea(
      repo,
      { fecha: LUNES, clave: claveDePaso("manana", "comida"), estado: "hecha" },
      FLO,
      a("09:00"),
    );
    const despues = await anotarQuienNoComio(repo, comida!.id, ["p-mara"]);
    expect(despues.perroIds).toEqual(["p-mara"]);
    expect(despues.marcadoEn).toBe(a("09:00"));
  });
});

describe("anotarEnElDia", () => {
  it("los remedios y las novedades se acumulan", async () => {
    await anotarEnElDia(repo, { fecha: LUNES, clave: claveDeMedicamento("p-kuky"), nota: "Fluoxetina" }, FLO, a("09:00"));
    await anotarEnElDia(repo, { fecha: LUNES, clave: claveDeMedicamento("p-kuky"), nota: "Fluoxetina" }, JOSE, a("19:00"));
    await anotarEnElDia(repo, { fecha: LUNES, clave: CLAVE_NOVEDAD, nota: "Owen llegó sin arnés" }, FLO);
    const dia = await cargarTareasDelDia(repo, LUNES, a("20:00"));
    expect(dia.remedios[0].dados).toHaveLength(2);
    expect(dia.novedades).toHaveLength(1);
  });

  it("una novedad vacía no se guarda", async () => {
    await expect(
      anotarEnElDia(repo, { fecha: LUNES, clave: CLAVE_NOVEDAD, nota: "  " }, FLO),
    ).rejects.toThrow();
  });
});

describe("la rutina", () => {
  it("la sugerida se carga una sola vez aunque se apriete dos", async () => {
    await cargarRutinaSugerida(repo);
    await cargarRutinaSugerida(repo);
    const tareas = await repo.tareas.listar();
    expect(tareas).toHaveLength(NEGOCIO.tareas.rutinaSugerida.length);
  });

  it("una rutina sin días no se crea", async () => {
    await expect(
      crearTarea(repo, "rutina", { titulo: "Baños", diasDeLaSemana: [] }),
    ).rejects.toThrow(/día/);
  });

  it("archivada deja de aparecer", async () => {
    const t = await crearTarea(repo, "rutina", { titulo: "Baños", diasDeLaSemana: [1] });
    await archivarTarea(repo, t.id);
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    expect(dia.tareas).toHaveLength(0);
    expect(dia.hayRutina).toBe(false);
  });

  it("el avance no cuenta la cena a media mañana", async () => {
    await crearTarea(repo, "rutina", { titulo: "Baños", diasDeLaSemana: [1] });
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    // 4 pasos de la mañana + 1 tarea.
    expect(dia.avance.total).toBe(5);
  });

  it("un día que ya pasó cuenta las tres rondas", async () => {
    const dia = await cargarTareasDelDia(repo, LUNES, instanteEnHora(MARTES, "08:00"));
    expect(dia.avance.total).toBe(12);
  });
});

describe("resumenDelDia", () => {
  it("arma el reporte con los nombres de los perros", async () => {
    const comida = await marcarTarea(
      repo,
      { fecha: LUNES, clave: claveDePaso("manana", "comida"), estado: "hecha" },
      FLO,
      a("09:00"),
    );
    await anotarQuienNoComio(repo, comida!.id, ["p-mara"]);
    const dia = await cargarTareasDelDia(repo, LUNES, a("10:00"));
    const texto = resumenDelDia(dia, "Flo", a("10:00"));
    expect(texto.split("\n")[0]).toBe("Reporte lunes 26/10 (Flo)");
    expect(texto).toContain("✅ Desayunaron casi todos (faltó Mara)");
  });
});
