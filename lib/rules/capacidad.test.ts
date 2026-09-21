import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { EstadiaJardin, ReservaHotel } from "@/lib/types";
import {
  calcularOcupacionDia,
  cuposDisponibles,
  describirConflictos,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  verificarCapacidad,
  type OcupanteRango,
} from "./capacidad";

const DIA = "2026-06-15";

function jardin(
  perroId: string,
  desde: string,
  hasta: string,
  dia = DIA,
): OcupanteRango {
  return {
    perroId,
    linea: "jardin",
    inicio: instanteEnHora(dia, desde),
    fin: instanteEnHora(dia, hasta),
  };
}

function hotel(
  perroId: string,
  diaDesde: string,
  horaDesde: string,
  diaHasta: string,
  horaHasta: string,
): OcupanteRango {
  return {
    perroId,
    linea: "hotel",
    inicio: instanteEnHora(diaDesde, horaDesde),
    fin: instanteEnHora(diaHasta, horaHasta),
  };
}

function muchosJardin(cantidad: number, desde: string, hasta: string) {
  return Array.from({ length: cantidad }, (_, i) =>
    jardin(`perro-${i}`, desde, hasta),
  );
}

describe("calcularOcupacionDia", () => {
  it("un perro que sale libera el cupo del que entra a esa hora", () => {
    const o = calcularOcupacionDia(DIA, [
      jardin("a", "08:00", "13:00"),
      jardin("b", "13:00", "17:00"),
    ]);
    expect(o.pico).toBe(1);
    expect(o.perrosDistintos).toBe(2);
  });

  it("cuenta 2 cuando de verdad se pisan", () => {
    const o = calcularOcupacionDia(DIA, [
      jardin("a", "08:00", "14:00"),
      jardin("b", "13:00", "17:00"),
    ]);
    expect(o.pico).toBe(2);
    expect(o.picoMinutoDelDia).toBe(13 * 60);
  });

  it("el pico no es la cantidad de perros del día", () => {
    // Seis perros en el día, pero nunca más de tres juntos.
    const o = calcularOcupacionDia(DIA, [
      ...muchosJardin(3, "08:00", "12:00"),
      jardin("x", "13:00", "17:00"),
      jardin("y", "13:00", "17:00"),
      jardin("z", "13:00", "17:00"),
    ]);
    expect(o.perrosDistintos).toBe(6);
    expect(o.pico).toBe(3);
  });

  it("el hotel ocupa el día completo, no solo el horario del jardín", () => {
    const o = calcularOcupacionDia(DIA, [
      hotel("h", "2026-06-14", "10:00", "2026-06-17", "10:00"),
    ]);
    expect(o.slots).toHaveLength(48);
    expect(o.slots.every((s) => s.total === 1)).toBe(true);
    expect(o.perrosHotel).toBe(1);
    expect(o.perrosJardin).toBe(0);
  });

  it("separa hotel de jardín en cada franja", () => {
    const o = calcularOcupacionDia(DIA, [
      hotel("h", "2026-06-14", "10:00", "2026-06-17", "10:00"),
      jardin("j", "09:00", "17:00"),
    ]);
    const mediodia = o.slots.find((s) => s.minutoDelDia === 12 * 60)!;
    expect(mediodia).toMatchObject({ hotel: 1, jardin: 1, total: 2 });

    const madrugada = o.slots.find((s) => s.minutoDelDia === 3 * 60)!;
    expect(madrugada).toMatchObject({ hotel: 1, jardin: 0, total: 1 });
  });

  it("un perro con hotel y jardín el mismo día se cuenta una vez", () => {
    const o = calcularOcupacionDia(DIA, [
      jardin("a", "08:00", "12:00"),
      hotel("a", DIA, "12:00", "2026-06-16", "10:00"),
    ]);
    expect(o.perrosDistintos).toBe(1);
    expect(o.pico).toBe(1);
  });
});

describe("verificarCapacidad", () => {
  it("acepta la reserva cuando hay cupo", () => {
    const r = verificarCapacidad(
      [jardin("nuevo", "09:00", "17:00")],
      muchosJardin(10, "09:00", "17:00"),
    );
    expect(r.hayCupo).toBe(true);
    expect(r.conflictos).toEqual([]);
  });

  it("bloquea el perro 26 cuando el espacio está lleno", () => {
    const r = verificarCapacidad(
      [jardin("nuevo", "11:00", "13:00")],
      muchosJardin(25, "09:00", "12:00"),
    );
    expect(r.hayCupo).toBe(false);
    expect(r.conflictos.length).toBeGreaterThan(0);
    expect(r.conflictos[0].ocupados).toBe(26);
  });

  it("acepta al perro 26 si entra justo cuando los otros se van", () => {
    const r = verificarCapacidad(
      [jardin("nuevo", "12:00", "17:00")],
      muchosJardin(25, "09:00", "12:00"),
    );
    expect(r.hayCupo).toBe(true);
  });

  it("25 exactos caben: el tope es máximo, no límite excluyente", () => {
    const r = verificarCapacidad(
      [jardin("nuevo", "09:00", "12:00")],
      muchosJardin(24, "09:00", "12:00"),
    );
    expect(r.hayCupo).toBe(true);
    expect(r.picoPorDia[0].pico).toBe(25);
  });

  it("el cupo es compartido entre hotel y jardín", () => {
    const enHotel = Array.from({ length: 25 }, (_, i) =>
      hotel(`h-${i}`, "2026-06-14", "10:00", "2026-06-17", "10:00"),
    );
    const r = verificarCapacidad([jardin("nuevo", "09:00", "17:00")], enHotel);
    expect(r.hayCupo).toBe(false);
  });

  it("revisa todos los días de una estadía larga", () => {
    const lleno = Array.from({ length: 25 }, (_, i) =>
      jardin(`p-${i}`, "09:00", "17:00", "2026-06-17"),
    );
    const r = verificarCapacidad(
      [hotel("nuevo", "2026-06-15", "10:00", "2026-06-19", "10:00")],
      lleno,
    );
    expect(r.hayCupo).toBe(false);
    expect(r.conflictos.every((c) => c.fecha === "2026-06-17")).toBe(true);
    expect(r.picoPorDia).toHaveLength(5);
  });

  it("informa el día y la franja, no un 'no hay cupo' pelado", () => {
    const r = verificarCapacidad(
      [jardin("nuevo", "11:00", "13:00")],
      muchosJardin(25, "09:00", "12:00"),
    );
    const [mensaje] = describirConflictos(r.conflictos);
    expect(mensaje).toContain("lunes 15 de junio");
    expect(mensaje).toContain("11:00");
  });
});

describe("cuposDisponibles", () => {
  it("resta el pico del día, no la suma de perros", () => {
    expect(
      cuposDisponibles(DIA, [
        ...muchosJardin(10, "08:00", "12:00"),
        ...muchosJardin(10, "13:00", "17:00").map((o) => ({
          ...o,
          perroId: `tarde-${o.perroId}`,
        })),
      ]),
    ).toBe(15);
  });
});

describe("conversión desde el dominio", () => {
  const baseReserva = {
    id: "r1",
    clienteId: "c1",
    perroId: "p1",
    inicioProgramado: instanteEnHora(DIA, "10:00"),
    finProgramado: instanteEnHora("2026-06-17", "10:00"),
    paseosContratados: 0,
    cotizacion: { lineas: [], subtotal: 0, descuentos: [], total: 0 },
    abonoPagado: true,
    creadaEn: instanteEnHora("2026-06-01", "10:00"),
  };

  it("ignora las reservas canceladas y los no-show", () => {
    const reservas = [
      { ...baseReserva, estado: "confirmada" },
      { ...baseReserva, id: "r2", estado: "cancelada" },
      { ...baseReserva, id: "r3", estado: "no_show" },
    ] as ReservaHotel[];
    expect(ocupantesDeReservas(reservas)).toHaveLength(1);
  });

  it("usa la hora real por sobre la programada", () => {
    const reservas = [
      {
        ...baseReserva,
        estado: "finalizada",
        finReal: instanteEnHora("2026-06-16", "10:00"),
      },
    ] as ReservaHotel[];
    expect(ocupantesDeReservas(reservas)[0].fin).toBe(
      instanteEnHora("2026-06-16", "10:00"),
    );
  });

  it("convierte estadías de jardín que ocupan", () => {
    const estadias = [
      {
        id: "e1",
        clienteId: "c1",
        perroId: "p1",
        fecha: DIA,
        inicioProgramado: instanteEnHora(DIA, "09:00"),
        finProgramado: instanteEnHora(DIA, "17:00"),
        origen: "dia_suelto",
        estado: "presente",
        creadaEn: instanteEnHora("2026-06-01", "10:00"),
      },
      {
        id: "e2",
        clienteId: "c1",
        perroId: "p2",
        fecha: DIA,
        inicioProgramado: instanteEnHora(DIA, "09:00"),
        finProgramado: instanteEnHora(DIA, "17:00"),
        origen: "dia_suelto",
        estado: "cancelada",
        creadaEn: instanteEnHora("2026-06-01", "10:00"),
      },
    ] as EstadiaJardin[];
    expect(ocupantesDeEstadias(estadias)).toHaveLength(1);
    expect(ocupantesDeEstadias(estadias)[0].linea).toBe("jardin");
  });
});
