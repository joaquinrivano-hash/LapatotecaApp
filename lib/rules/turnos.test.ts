import { describe, expect, it } from "vitest";

import {
  bloquesDeLaPlanilla,
  coberturaDelDia,
  coloresPorPersona,
  columnasPorDia,
  compararTurno,
  cubre,
  filasDelTurno,
  huecosDeCobertura,
  minutosDelTurno,
  ordenarTurnosDelDia,
  rangoDeLaPlanilla,
  type FranjaDeCobertura,
} from "@/lib/rules/turnos";
import type { Turno } from "@/lib/types";

const turno = (
  desde: string,
  hasta: string,
  extra: Partial<Turno> = {},
): Turno => ({
  id: extra.id ?? "t-1",
  perfilId: extra.perfilId ?? "p-1",
  fecha: "2026-10-22",
  desde,
  hasta,
  creadoEn: "2026-10-01T12:00:00.000Z",
  ...extra,
});

describe("minutosDelTurno", () => {
  it("convierte las horas a minutos del día", () => {
    expect(minutosDelTurno({ desde: "07:00", hasta: "15:00" })).toEqual({
      desde: 420,
      hasta: 900,
    });
  });

  // El del hotel, que se queda mientras todos duermen. Tratarlo como un
  // rango vacío lo haría desaparecer de la planilla.
  it("un turno que cruza la medianoche se cierra al final del día", () => {
    expect(minutosDelTurno({ desde: "22:00", hasta: "06:00" })).toEqual({
      desde: 1320,
      hasta: 1440,
    });
  });
});

describe("cubre", () => {
  const t = { desde: "07:00", hasta: "15:00" };

  it("incluye el inicio y excluye el final", () => {
    expect(cubre(t, 420)).toBe(true);
    expect(cubre(t, 899)).toBe(true);
    // A las 15:00 ya se fue: si no, dos turnos pegados se contarían dos
    // veces en la franja del cambio.
    expect(cubre(t, 900)).toBe(false);
  });

  it("deja fuera lo anterior", () => {
    expect(cubre(t, 419)).toBe(false);
  });
});

describe("coberturaDelDia", () => {
  it("cuenta cuánta gente hay en cada franja", () => {
    const franjas = coberturaDelDia(
      [
        turno("07:00", "15:00", { id: "t-1" }),
        turno("13:00", "19:00", { id: "t-2", perfilId: "p-2" }),
      ],
      () => 0,
      7 * 60,
      19 * 60,
    );

    const a = (hora: string) => franjas.find((f) => f.hora === hora)?.gente;
    expect(a("07:00")).toBe(1);
    expect(a("13:00")).toBe(2); // se traslapan
    expect(a("15:00")).toBe(1);
    expect(a("18:30")).toBe(1);
  });

  it("sin turnos, todo en cero", () => {
    const franjas = coberturaDelDia([], () => 5, 7 * 60, 9 * 60);
    expect(franjas.every((f) => f.gente === 0)).toBe(true);
    expect(franjas.every((f) => f.perros === 5)).toBe(true);
  });
});

describe("huecosDeCobertura", () => {
  const franja = (
    hora: string,
    gente: number,
    perros: number,
  ): FranjaDeCobertura => ({
    minutoDelDia: Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3)),
    hora,
    gente,
    perros,
  });

  // El único número de la pantalla que importa de verdad.
  it("encuentra la franja con perros y sin nadie", () => {
    expect(
      huecosDeCobertura([
        franja("13:00", 1, 10),
        franja("13:30", 0, 12),
        franja("14:00", 1, 11),
      ]),
    ).toEqual([{ desde: "13:30", hasta: "14:00", perros: 12 }]);
  });

  // Seis huecos de media hora seguidos son uno de tres horas, y leerlos
  // sueltos los hace parecer menores de lo que son.
  it("junta las franjas contiguas en un solo hueco", () => {
    const huecos = huecosDeCobertura([
      franja("13:00", 0, 8),
      franja("13:30", 0, 15),
      franja("14:00", 0, 9),
      franja("14:30", 2, 9),
    ]);
    expect(huecos).toHaveLength(1);
    expect(huecos[0]).toEqual({ desde: "13:00", hasta: "14:30", perros: 15 });
  });

  it("separa dos huecos que no se tocan", () => {
    const huecos = huecosDeCobertura([
      franja("08:00", 0, 3),
      franja("08:30", 1, 3),
      franja("09:00", 0, 4),
    ]);
    expect(huecos.map((h) => h.desde)).toEqual(["08:00", "09:00"]);
  });

  // La casa vacía a las seis de la mañana no es un hueco: no hay a quién
  // cuidar. Avisar de eso haría que la pantalla se deje de mirar.
  it("una franja sin nadie y sin perros no es un hueco", () => {
    expect(huecosDeCobertura([franja("05:00", 0, 0)])).toEqual([]);
  });

  // "de 00:00 a 00:00" se lee como que no dura nada, y es justo el caso
  // de un día entero sin nadie.
  it("un hueco hasta el final del día termina en 24:00", () => {
    const franjas = [];
    for (let m = 23 * 60; m < 24 * 60; m += 30) {
      franjas.push({ minutoDelDia: m, hora: "", gente: 0, perros: 4 });
    }
    expect(huecosDeCobertura(franjas)[0].hasta).toBe("24:00");
  });

  it("con gente cubriendo no hay nada que avisar", () => {
    expect(huecosDeCobertura([franja("13:00", 1, 20)])).toEqual([]);
  });
});

describe("compararTurno", () => {
  const RASTROS = [
    { instante: "2026-10-22T13:00:00.000Z", que: "un reporte" },
    { instante: "2026-10-22T11:00:00.000Z", que: "un incidente" },
    { instante: "2026-10-22T18:00:00.000Z", que: "un reporte" },
  ];

  // El fichaje es la hora que la persona declaró; el rastro es deducido de
  // su trabajo. Mezclarlos sería presentar una deducción como un hecho.
  it("el fichaje le gana al rastro, y lo dice", () => {
    const c = compararTurno(
      turno("07:00", "15:00", {
        entradaReal: "2026-10-22T10:00:00.000Z",
        salidaReal: "2026-10-22T19:00:00.000Z",
      }),
      RASTROS,
    );
    expect(c.entrada).toEqual({
      instante: "2026-10-22T10:00:00.000Z",
      fuente: "fichaje",
    });
    expect(c.salida.fuente).toBe("fichaje");
  });

  it("sin fichaje usa el primer y el último rastro", () => {
    const c = compararTurno(turno("07:00", "15:00"), RASTROS);
    expect(c.entrada).toEqual({
      instante: "2026-10-22T11:00:00.000Z",
      fuente: "rastro",
    });
    expect(c.salida).toEqual({
      instante: "2026-10-22T18:00:00.000Z",
      fuente: "rastro",
    });
    expect(c.rastros).toBe(3);
  });

  it("puede fichar la entrada y no la salida", () => {
    const c = compararTurno(
      turno("07:00", "15:00", { entradaReal: "2026-10-22T10:00:00.000Z" }),
      RASTROS,
    );
    expect(c.entrada.fuente).toBe("fichaje");
    expect(c.salida.fuente).toBe("rastro");
  });

  // "No se sabe" es la respuesta correcta. Inventar una hora acá sería el
  // mismo error que contar una estadía en curso como "retiro a las 00:00".
  it("sin fichaje y sin rastros no inventa una hora", () => {
    const c = compararTurno(turno("07:00", "15:00"), []);
    expect(c.entrada).toEqual({ instante: null, fuente: "nada" });
    expect(c.salida).toEqual({ instante: null, fuente: "nada" });
    expect(c.rastros).toBe(0);
  });

  it("con un solo rastro, ese es la entrada y también la salida", () => {
    const c = compararTurno(turno("07:00", "15:00"), [RASTROS[0]]);
    expect(c.entrada.instante).toBe("2026-10-22T13:00:00.000Z");
    expect(c.salida.instante).toBe("2026-10-22T13:00:00.000Z");
  });

  it("no depende de que los rastros lleguen ordenados", () => {
    const alReves = [...RASTROS].reverse();
    expect(
      compararTurno(turno("07:00", "15:00"), alReves).entrada.instante,
    ).toBe("2026-10-22T11:00:00.000Z");
  });
});

describe("la planilla como grilla", () => {
  const t = (desde: string, hasta: string) => ({ desde, hasta });

  describe("ordenarTurnosDelDia", () => {
    it("el que entra primero es el Turno 1", () => {
      const orden = ordenarTurnosDelDia([
        t("14:00", "21:00"),
        t("07:00", "14:00"),
      ]);
      expect(orden[0].desde).toBe("07:00");
      expect(orden[1].desde).toBe("14:00");
    });

    it("a igual entrada, primero el que se va antes", () => {
      const orden = ordenarTurnosDelDia([
        t("07:00", "21:00"),
        t("07:00", "13:00"),
      ]);
      expect(orden[0].hasta).toBe("13:00");
    });

    it("el que cruza la medianoche va al final, no al principio", () => {
      // "22:00 a 06:00" cierra a las 24:00, así que entra a las 22.
      const orden = ordenarTurnosDelDia([
        t("22:00", "06:00"),
        t("07:00", "14:00"),
      ]);
      expect(orden[0].desde).toBe("07:00");
    });

    it("no muta la lista que recibe", () => {
      const lista = [t("14:00", "21:00"), t("07:00", "14:00")];
      ordenarTurnosDelDia(lista);
      expect(lista[0].desde).toBe("14:00");
    });
  });

  describe("columnasPorDia", () => {
    it("con la semana vacía igual dibuja Turno 1 y Turno 2", () => {
      expect(columnasPorDia([0, 0, 0])).toBe(2);
    });

    it("sin ningún día, tampoco se queda en cero", () => {
      expect(columnasPorDia([])).toBe(2);
    });

    it("un día con tres turnos agrega la tercera columna para todos", () => {
      expect(columnasPorDia([1, 3, 2])).toBe(3);
    });
  });

  describe("rangoDeLaPlanilla", () => {
    const ATENCION = { desde: 7 * 60, hasta: 21 * 60 };

    it("sin turnos, son las horas de atención", () => {
      expect(rangoDeLaPlanilla([], ATENCION.desde, ATENCION.hasta)).toEqual({
        desde: 7 * 60,
        hasta: 21 * 60,
      });
    });

    it("se estira hacia arriba por el que entra antes", () => {
      const r = rangoDeLaPlanilla(
        [t("06:00", "14:00")],
        ATENCION.desde,
        ATENCION.hasta,
      );
      expect(r.desde).toBe(6 * 60);
    });

    it("y hacia abajo por el que cruza la medianoche", () => {
      const r = rangoDeLaPlanilla(
        [t("22:00", "06:00")],
        ATENCION.desde,
        ATENCION.hasta,
      );
      expect(r.hasta).toBe(24 * 60);
    });

    it("una entrada a media franja no deja la fila cortada", () => {
      const r = rangoDeLaPlanilla(
        [t("06:50", "14:00")],
        ATENCION.desde,
        ATENCION.hasta,
      );
      expect(r.desde).toBe(6 * 60 + 30);
    });
  });

  describe("bloquesDeLaPlanilla", () => {
    it("un bloque por paso, y el último no llega al final", () => {
      const bloques = bloquesDeLaPlanilla({ desde: 7 * 60, hasta: 9 * 60 });
      expect(bloques.map((b) => b.hora)).toEqual([
        "07:00",
        "07:30",
        "08:00",
        "08:30",
      ]);
    });
  });

  describe("filasDelTurno", () => {
    const RANGO = { desde: 7 * 60, hasta: 21 * 60 };

    it("de las 7 a las 14 son las primeras catorce filas", () => {
      expect(filasDelTurno(t("07:00", "14:00"), RANGO)).toEqual({
        desde: 0,
        hasta: 14,
      });
    });

    it("el que entra antes del rango empieza en la fila cero", () => {
      expect(filasDelTurno(t("05:00", "09:00"), RANGO)?.desde).toBe(0);
    });

    it("el que cruza la medianoche se corta en el final del rango", () => {
      expect(filasDelTurno(t("20:00", "02:00"), RANGO)?.hasta).toBe(28);
    });

    it("uno entero fuera del rango no tiene filas", () => {
      expect(filasDelTurno(t("22:00", "23:00"), RANGO)).toBeNull();
    });
  });

  describe("coloresPorPersona", () => {
    it("cada persona distinta, un color distinto", () => {
      const c = coloresPorPersona(["a", "b", "c"], 6);
      expect(new Set(c.values()).size).toBe(3);
    });

    it("la misma persona siempre el mismo color, aparezca donde aparezca", () => {
      const c = coloresPorPersona(["a", "b", "a", "a"], 6);
      expect(c.get("a")).toBe(0);
      expect(c.get("b")).toBe(1);
    });

    it("pasados los colores vuelve a empezar, no se cae", () => {
      const c = coloresPorPersona(["a", "b", "c"], 2);
      expect(c.get("c")).toBe(0);
    });
  });
});
