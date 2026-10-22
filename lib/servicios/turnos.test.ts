import { beforeEach, describe, expect, it } from "vitest";

import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  desfaseDelFichaje,
  ficharTurno,
  semanaDeTurnos,
} from "@/lib/servicios/turnos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { EstadiaJardin, Turno } from "@/lib/types";

const DIA = "2026-10-22";
let repo: RepositorioPatoteca;

const turno = (extra: Partial<Turno> = {}): Turno => ({
  id: "turno-001",
  perfilId: "p-maria",
  fecha: DIA,
  desde: "07:00",
  hasta: "15:00",
  creadoEn: "2026-10-01T12:00:00.000Z",
  ...extra,
});

/** Una jornada de jardín que pone perros en la casa en ese rango. */
const estadia = (id: string, desde: string, hasta: string): EstadiaJardin => ({
  id,
  clienteId: "cli-1",
  perroId: `perro-${id}`,
  fecha: DIA,
  inicioProgramado: instanteEnHora(DIA, desde),
  finProgramado: instanteEnHora(DIA, hasta),
  origen: "dia_suelto",
  estado: "finalizada",
  creadaEn: "2026-10-01T12:00:00.000Z",
});

function montar(datos: Partial<DatosPatoteca> = {}) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: DIA,
    clientes: [],
    perros: [],
    turnos: [],
    ...datos,
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

describe("semanaDeTurnos", () => {
  it("devuelve un día por fecha, aunque no haya turnos", async () => {
    montar();
    const semana = await semanaDeTurnos(repo, DIA, "2026-10-24");
    expect(semana.map((d) => d.fecha)).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
    expect(semana[0].turnos).toEqual([]);
  });

  it("ordena los turnos del día por hora de entrada", async () => {
    montar({
      turnos: [
        turno({ id: "t-tarde", desde: "13:00", hasta: "19:00" }),
        turno({ id: "t-manana", desde: "07:00", hasta: "15:00" }),
      ],
    });
    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.turnos.map((t) => t.turno.id)).toEqual(["t-manana", "t-tarde"]);
  });

  // El único número de la pantalla que importa: una franja sin nadie
  // mientras hay perros adentro.
  it("marca el hueco de cobertura con perros en la casa", async () => {
    montar({
      turnos: [turno({ desde: "07:00", hasta: "12:00" })],
      estadiasJardin: [estadia("e1", "08:00", "18:00")],
    });

    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.huecos).toHaveLength(1);
    expect(dia.huecos[0]).toMatchObject({ desde: "12:00", perros: 1 });
  });

  // La casa vacía no es un hueco: avisar de eso haría que la pantalla se
  // deje de mirar.
  it("sin perros no hay hueco aunque no cubra nadie", async () => {
    montar({ turnos: [] });
    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.huecos).toEqual([]);
  });

  // El grueso del trabajo de un turno son las marcas de asistencia, y
  // ahora llevan la firma de quien las hizo. Sin esto, un turno tranquilo
  // se veía igual que uno ausente.
  it("las marcas de asistencia cuentan como rastros del turno", async () => {
    montar({
      turnos: [turno()],
      estadiasJardin: [
        {
          ...estadia("e1", "08:00", "18:00"),
          inicioMarcadoEn: instanteEnHora(DIA, "08:05"),
          inicioMarcadoPor: "p-maria",
          finMarcadoEn: instanteEnHora(DIA, "17:58"),
          finMarcadoPor: "p-maria",
        },
      ],
    });

    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    const { comparacion, rastros } = dia.turnos[0];
    expect(rastros).toHaveLength(2);
    expect(comparacion.entrada).toEqual({
      instante: instanteEnHora(DIA, "08:05"),
      fuente: "rastro",
    });
    expect(comparacion.salida.instante).toBe(instanteEnHora(DIA, "17:58"));
  });

  it("una marca de otra persona no es rastro de este turno", async () => {
    montar({
      turnos: [turno()],
      estadiasJardin: [
        {
          ...estadia("e1", "08:00", "18:00"),
          inicioMarcadoEn: instanteEnHora(DIA, "08:05"),
          inicioMarcadoPor: "p-otra",
        },
      ],
    });

    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.turnos[0].rastros).toEqual([]);
  });

  // Sin firma no se le atribuye a nadie: es el caso de las jornadas
  // marcadas antes de que la columna existiera.
  it("una marca sin firma no se le cuelga a nadie", async () => {
    montar({
      turnos: [turno()],
      estadiasJardin: [
        {
          ...estadia("e1", "08:00", "18:00"),
          inicioMarcadoEn: instanteEnHora(DIA, "08:05"),
        },
      ],
    });

    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.turnos[0].rastros).toEqual([]);
  });

  it("un turno de alguien que ya no está en el equipo igual se muestra", async () => {
    montar({ turnos: [turno({ perfilId: "p-borrada" })] });
    const [dia] = await semanaDeTurnos(repo, DIA, DIA);
    expect(dia.turnos).toHaveLength(1);
    expect(dia.turnos[0].persona).toBeNull();
  });
});

describe("ficharTurno", () => {
  beforeEach(() => montar({ turnos: [turno()] }));

  it("guarda la hora de entrada", async () => {
    const t = await ficharTurno(repo, "turno-001", "entrada", instanteEnHora(DIA, "07:12"));
    expect(t.entradaReal).toBe(instanteEnHora(DIA, "07:12"));
  });

  // El fichaje es la declaración de quien lo hizo. Dejar que se reescriba
  // lo convertiría en una casilla que se llena al final del día con la
  // hora que convenga.
  it("no se pisa un fichaje que ya existe", async () => {
    await ficharTurno(repo, "turno-001", "entrada", instanteEnHora(DIA, "07:12"));
    const t = await ficharTurno(repo, "turno-001", "entrada", instanteEnHora(DIA, "09:00"));
    expect(t.entradaReal).toBe(instanteEnHora(DIA, "07:12"));
  });

  it("la entrada y la salida son independientes", async () => {
    await ficharTurno(repo, "turno-001", "entrada", instanteEnHora(DIA, "07:00"));
    const t = await ficharTurno(repo, "turno-001", "salida", instanteEnHora(DIA, "15:30"));
    expect(t.entradaReal).toBeDefined();
    expect(t.salidaReal).toBe(instanteEnHora(DIA, "15:30"));
  });

  it("falla claro si el turno ya no existe", async () => {
    await expect(ficharTurno(repo, "turno-999", "entrada")).rejects.toThrow(
      /ya no existe/,
    );
  });
});

describe("desfaseDelFichaje", () => {
  it("cuenta los minutos de atraso en la entrada", () => {
    expect(
      desfaseDelFichaje(turno({ entradaReal: instanteEnHora(DIA, "07:20") }), "entrada"),
    ).toBe(20);
  });

  it("y los de adelanto, en negativo", () => {
    expect(
      desfaseDelFichaje(turno({ entradaReal: instanteEnHora(DIA, "06:45") }), "entrada"),
    ).toBe(-15);
  });

  it("sin fichaje no hay desfase que contar", () => {
    expect(desfaseDelFichaje(turno(), "entrada")).toBeNull();
  });

  // Un fichaje de otro día no se compara con el horario de este: el
  // número saldría enorme y no significaría nada.
  it("ignora un fichaje que cayó en otro día", () => {
    expect(
      desfaseDelFichaje(
        turno({ entradaReal: instanteEnHora("2026-10-23", "07:00") }),
        "entrada",
      ),
    ).toBeNull();
  });
});
