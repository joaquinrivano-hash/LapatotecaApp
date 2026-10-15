import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { Cliente, EstadiaJardin, Perro } from "@/lib/types";
import { analizarHorarios } from "./horarios";

const DIA = "2026-06-15";
const en = (hora: string, dia = DIA) => instanteEnHora(dia, hora);

const CLIENTE: Cliente = {
  id: "cli-001",
  nombre: "Javiera",
  apellido: "Soto",
  email: "javiera@correo.cl",
  telefono: "+569 1111 1111",
  comuna: "Providencia",
  creadoEn: en("10:00", "2026-01-01"),
};

const PELUSA: Perro = {
  id: "perro-001",
  clienteId: CLIENTE.id,
  nombre: "Pelusa",
  raza: "Quiltro",
  pesoKg: 12,
  sexo: "hembra",
  esterilizado: true,
  vacunas: [],
  diaDePrueba: { estado: "aprobado" },
  creadoEn: en("10:00", "2026-01-01"),
};

function jornada(
  id: string,
  real: { entra: string; sale: string },
  programado = { entra: "08:00", sale: "17:00" },
  marcas: Partial<EstadiaJardin> = {},
): EstadiaJardin {
  return {
    id,
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    fecha: DIA,
    inicioProgramado: en(programado.entra),
    finProgramado: en(programado.sale),
    inicioReal: en(real.entra),
    finReal: en(real.sale),
    origen: "dia_suelto",
    estado: "finalizada",
    creadaEn: en("10:00", "2026-06-10"),
    ...marcas,
  };
}

let repo: RepositorioPatoteca;

function montar(estadiasJardin: EstadiaJardin[]) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: DIA,
    clientes: [CLIENTE],
    perros: [PELUSA],
    estadiasJardin,
    reservasHotel: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

beforeEach(() =>
  montar([
    jornada("e1", { entra: "08:05", sale: "17:10" }),
    jornada("e2", { entra: "07:00", sale: "19:30" }),
    jornada("e3", { entra: "09:40", sale: "16:00" }),
  ]),
);

describe("a qué hora pasa el movimiento", () => {
  it("reparte llegadas y retiros por hora", async () => {
    const { franjas } = await analizarHorarios(repo, DIA, DIA);

    expect(franjas.find((f) => f.hora === 7)?.llegadas).toBe(1);
    expect(franjas.find((f) => f.hora === 8)?.llegadas).toBe(1);
    expect(franjas.find((f) => f.hora === 9)?.llegadas).toBe(1);
    expect(franjas.find((f) => f.hora === 19)?.retiros).toBe(1);
  });

  it("una jornada en curso no entra: no tiene hora de retiro", async () => {
    // Contarla como "retiro a las 00:00" sería inventar un dato.
    montar([
      jornada("e1", { entra: "08:00", sale: "17:00" }),
      { ...jornada("e2", { entra: "08:00", sale: "17:00" }), finReal: undefined, estado: "presente" },
    ]);

    const { registros } = await analizarHorarios(repo, DIA, DIA);
    expect(registros).toBe(1);
  });
});

describe("cuánto se parece a lo agendado", () => {
  it("cuenta llegadas tempranas, a la hora y tardes", async () => {
    const { llegadas } = await analizarHorarios(repo, DIA, DIA);
    // 08:05 a la hora · 07:00 temprano · 09:40 tarde, contra las 08:00.
    expect(llegadas).toEqual({ temprano: 1, a_la_hora: 1, tarde: 1, total: 3 });
  });

  it("una sobreestadía es un retiro tarde", async () => {
    const { retiros } = await analizarHorarios(repo, DIA, DIA);
    // 17:10 a la hora · 19:30 tarde · 16:00 temprano, contra las 17:00.
    expect(retiros).toEqual({ temprano: 1, a_la_hora: 1, tarde: 1, total: 3 });
  });
});

describe("qué tan confiable es el dato", () => {
  it("cuenta los registros marcados a destiempo", async () => {
    // No es un dato sobre los perros sino sobre el análisis: si la mitad se
    // marcó horas después, las horas que se analizan son las que alguien
    // recordó y no las que pasaron.
    montar([
      jornada("e1", { entra: "08:00", sale: "17:00" }, undefined, {
        inicioMarcadoEn: en("08:02"),
      }),
      jornada("e2", { entra: "08:00", sale: "17:00" }, undefined, {
        inicioMarcadoEn: en("11:00"),
      }),
    ]);

    const { marcadosADestiempo, registros } = await analizarHorarios(repo, DIA, DIA);
    expect(registros).toBe(2);
    expect(marcadosADestiempo).toBe(1);
  });

  it("sin hora de marca no cuenta como destiempo", async () => {
    // Las estadías viejas, de antes de que el campo existiera.
    const { marcadosADestiempo } = await analizarHorarios(repo, DIA, DIA);
    expect(marcadosADestiempo).toBe(0);
  });
});
