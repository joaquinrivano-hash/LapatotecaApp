import { describe, expect, it } from "vitest";
import {
  CLAVE_EXTRA,
  CLAVE_NOVEDAD,
  armarResumenDelTurno,
  avanceDelDia,
  claveDeMedicamento,
  claveDePaso,
  describirPasoHecho,
  enumerar,
  esAcumulable,
  pasosDeLaRonda,
  rondaDeLaHora,
  rondasEmpezadas,
  rutinaQueFalta,
  tareasDelDia,
  ultimoPorClave,
} from "@/lib/rules/tareas";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { RegistroDeTarea, Tarea } from "@/lib/types";

// 26-10-2026 es lunes.
const LUNES = "2026-10-26";
const MARTES = "2026-10-27";

function tarea(parcial: Partial<Tarea> & { id: string; titulo: string }): Tarea {
  return {
    tipo: "rutina",
    diasDeLaSemana: [0, 1, 2, 3, 4, 5, 6],
    activa: true,
    orden: 0,
    creadaEn: "2026-10-01T12:00:00.000Z",
    ...parcial,
  };
}

let n = 0;
function registro(
  parcial: Partial<RegistroDeTarea> & { clave: string },
): RegistroDeTarea {
  n += 1;
  return {
    id: `reg-${n}`,
    fecha: LUNES,
    estado: "hecha",
    autorStaff: "Flo",
    marcadoEn: instanteEnHora(LUNES, "10:00"),
    ...parcial,
  };
}

describe("rondas", () => {
  it("la mañana corre desde que empieza el día", () => {
    expect(rondaDeLaHora(instanteEnHora(LUNES, "06:30"))).toBe("manana");
    expect(rondaDeLaHora(instanteEnHora(LUNES, "12:59"))).toBe("manana");
  });

  it("las otras empiezan con su ventana de reportes", () => {
    expect(rondaDeLaHora(instanteEnHora(LUNES, "13:00"))).toBe("mediodia");
    expect(rondaDeLaHora(instanteEnHora(LUNES, "18:00"))).toBe("tarde");
    expect(rondaDeLaHora(instanteEnHora(LUNES, "23:30"))).toBe("tarde");
  });

  it("solo cuenta como empezadas las que ya llegaron", () => {
    expect(rondasEmpezadas(instanteEnHora(LUNES, "10:00"))).toEqual(["manana"]);
    expect(rondasEmpezadas(instanteEnHora(LUNES, "14:00"))).toEqual([
      "manana",
      "mediodia",
    ]);
  });
});

describe("claves", () => {
  it("se acumulan las novedades, los extras y los remedios", () => {
    expect(esAcumulable(CLAVE_NOVEDAD)).toBe(true);
    expect(esAcumulable(CLAVE_EXTRA)).toBe(true);
    expect(esAcumulable(claveDeMedicamento("perro-1"))).toBe(true);
    expect(esAcumulable(claveDePaso("manana", "aguas"))).toBe(false);
    expect(esAcumulable("tarea-7")).toBe(false);
  });

  it("el último registro de cada clave es el que vale", () => {
    const viejo = registro({
      clave: "t1",
      estado: "en_proceso",
      marcadoEn: instanteEnHora(LUNES, "09:00"),
    });
    const nuevo = registro({ clave: "t1", marcadoEn: instanteEnHora(LUNES, "11:00") });
    expect(ultimoPorClave([nuevo, viejo]).get("t1")?.estado).toBe("hecha");
  });
});

describe("tareasDelDia", () => {
  it("la rutina aparece solo los días marcados", () => {
    const soloMartes = tarea({ id: "t1", titulo: "Lavar patio", diasDeLaSemana: [2] });
    expect(tareasDelDia([soloMartes], [], LUNES)).toHaveLength(0);
    expect(tareasDelDia([soloMartes], [], MARTES)).toHaveLength(1);
  });

  it("la rutina no se arrastra al día siguiente", () => {
    const diaria = tarea({ id: "t1", titulo: "Barrer cerámica" });
    const [deMartes] = tareasDelDia([diaria], [], MARTES);
    expect(deMartes.estado).toBe("pendiente");
    expect(deMartes.arrastradaDesde).toBeUndefined();
  });

  it("lo archivado no aparece", () => {
    const vieja = tarea({ id: "t1", titulo: "Colgar guirnalda", activa: false });
    expect(tareasDelDia([vieja], [], LUNES)).toHaveLength(0);
  });

  it("el encargo aparece desde su fecha y se arrastra hasta que se hace", () => {
    const encargo = tarea({
      id: "e1",
      titulo: "Lijar la puerta",
      tipo: "encargo",
      diasDeLaSemana: undefined,
      fecha: LUNES,
    });
    expect(tareasDelDia([encargo], [], "2026-10-25")).toHaveLength(0);

    const [arrastrado] = tareasDelDia([encargo], [], MARTES);
    expect(arrastrado.arrastradaDesde).toBe(LUNES);

    const hecho = registro({ clave: "e1", fecha: LUNES });
    expect(tareasDelDia([encargo], [hecho], LUNES)[0].estado).toBe("hecha");
    expect(tareasDelDia([encargo], [hecho], MARTES)).toHaveLength(0);
  });

  it("'no se pudo hoy' no cierra el encargo", () => {
    const encargo = tarea({
      id: "e1",
      titulo: "Lavar patio",
      tipo: "encargo",
      fecha: LUNES,
    });
    const lluvia = registro({ clave: "e1", estado: "no_se_hizo", nota: "llovió" });
    expect(tareasDelDia([encargo], [lluvia], LUNES)[0].estado).toBe("no_se_hizo");
    expect(tareasDelDia([encargo], [lluvia], MARTES)[0].estado).toBe("pendiente");
  });

  it("ordena por ronda y después por orden", () => {
    const tarde = tarea({ id: "a", titulo: "Paseo de la tarde", ronda: "tarde" });
    const suelta = tarea({ id: "b", titulo: "Baños" });
    const manana = tarea({ id: "c", titulo: "Paseo de la mañana", ronda: "manana" });
    expect(tareasDelDia([tarde, suelta, manana], [], LUNES).map((t) => t.tarea.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("avanceDelDia", () => {
  it("la cena no está pendiente a las 10 de la mañana", () => {
    const registros = [registro({ clave: claveDePaso("manana", "comida") })];
    const pasos = (["manana", "mediodia", "tarde"] as const).flatMap((r) =>
      pasosDeLaRonda(r, registros, LUNES),
    );
    const avance = avanceDelDia([], pasos, ["manana"]);
    expect(avance).toEqual({ resueltas: 1, total: 4 });
  });

  it("lo decidido cuenta como resuelto", () => {
    const t = tarea({ id: "t1", titulo: "Patio" });
    const [delDia] = tareasDelDia(
      [t],
      [registro({ clave: "t1", estado: "no_se_hizo", nota: "llueve" })],
      LUNES,
    );
    expect(avanceDelDia([delDia], [], [])).toEqual({ resueltas: 1, total: 1 });
  });
});

describe("cómo se dice", () => {
  const nombres: Record<string, string> = { m: "Mara", o: "Oliver", r: "Rocco" };
  const nombreDe = (id: string) => nombres[id];

  it("enumera como se habla", () => {
    expect(enumerar(["Mara"])).toBe("Mara");
    expect(enumerar(["Mara", "Oliver"])).toBe("Mara y Oliver");
    expect(enumerar(["Mara", "Oliver", "Togo"])).toBe("Mara, Oliver y Togo");
  });

  it("la comida dice quién no comió", () => {
    const [comida] = pasosDeLaRonda(
      "manana",
      [registro({ clave: claveDePaso("manana", "comida"), perroIds: ["m", "o"] })],
      LUNES,
    );
    expect(describirPasoHecho(comida, nombreDe)).toBe(
      "Desayunaron casi todos (faltaron Mara y Oliver)",
    );

    const [almuerzo] = pasosDeLaRonda(
      "mediodia",
      [registro({ clave: claveDePaso("mediodia", "comida"), perroIds: ["r"] })],
      LUNES,
    );
    expect(describirPasoHecho(almuerzo, nombreDe)).toBe(
      "Almorzaron casi todos (faltó Rocco)",
    );
  });

  it("las cacas y las aguas llevan la hora", () => {
    const pasos = pasosDeLaRonda(
      "manana",
      [
        registro({
          clave: claveDePaso("manana", "aguas"),
          marcadoEn: instanteEnHora(LUNES, "09:30"),
        }),
      ],
      LUNES,
    );
    const aguas = pasos.find((p) => p.paso === "aguas")!;
    expect(describirPasoHecho(aguas, nombreDe)).toBe("Se cambiaron las aguas (09:30)");
  });
});

describe("armarResumenDelTurno", () => {
  it("escribe el reporte igual que en el grupo", () => {
    const ceramica = tarea({ id: "t1", titulo: "Barrer y trapear cerámica" });
    const patio = tarea({ id: "t2", titulo: "Lavar y enjuagar patio" });
    const paseo = tarea({ id: "t3", titulo: "Paseo de la mañana", ronda: "manana" });
    const puerta = tarea({
      id: "e1",
      titulo: "Lijar la puerta",
      tipo: "encargo",
      fecha: "2026-10-24",
    });

    const registros = [
      registro({ clave: claveDePaso("manana", "comida"), perroIds: ["m"] }),
      registro({
        clave: claveDePaso("manana", "cacas"),
        marcadoEn: instanteEnHora(LUNES, "09:30"),
      }),
      registro({ clave: "t1" }),
      registro({ clave: "t2", estado: "en_proceso" }),
      registro({ clave: CLAVE_EXTRA, nota: "Se cortó maleza" }),
      registro({
        clave: claveDeMedicamento("k"),
        nota: "Fluoxetina",
        marcadoEn: instanteEnHora(LUNES, "10:05"),
      }),
      registro({ clave: CLAVE_NOVEDAD, nota: "Owen llegó sin arnés" }),
    ];

    const texto = armarResumenDelTurno({
      fecha: LUNES,
      ahora: instanteEnHora(LUNES, "10:15"),
      autor: "Flo",
      pasos: (["manana", "mediodia", "tarde"] as const).flatMap((r) =>
        pasosDeLaRonda(r, registros, LUNES),
      ),
      tareas: tareasDelDia([ceramica, patio, paseo, puerta], registros, LUNES),
      registros,
      perros: [
        { id: "m", nombre: "Mara" },
        { id: "k", nombre: "Kuky" },
      ],
    });

    expect(texto).toBe(
      [
        "Reporte lunes 26/10 (Flo)",
        "10:15",
        "",
        "✅ Desayunaron casi todos (faltó Mara)",
        "✅ Se recogieron cacas y limpiaron pipís (09:30)",
        "✅ Barrer y trapear cerámica",
        "✅ Se cortó maleza",
        "🔜 Lavar y enjuagar patio",
        "",
        "*Medicamentos*",
        "- Kuky: Fluoxetina (10:05)",
        "",
        "*Pendiente*",
        "- Cambiar las aguas",
        "- Mandar los reportes a los dueños",
        "- Paseo de la mañana",
        "- Lijar la puerta (viene del 24/10)",
        "",
        "*Novedades*",
        "- Owen llegó sin arnés",
      ].join("\n"),
    );
  });

  it("un día sin nada marcado no inventa secciones", () => {
    const texto = armarResumenDelTurno({
      fecha: LUNES,
      ahora: instanteEnHora(LUNES, "08:00"),
      autor: "José",
      pasos: [],
      tareas: [],
      registros: [],
      perros: [],
    });
    expect(texto).toBe("Reporte lunes 26/10 (José)\n08:00");
  });

  it("lo pendiente de la rutina es solo lo de la ronda en curso", () => {
    const registros = [registro({ clave: claveDePaso("mediodia", "aguas") })];
    const texto = armarResumenDelTurno({
      fecha: LUNES,
      ahora: instanteEnHora(LUNES, "14:00"),
      autor: "Flo",
      pasos: (["manana", "mediodia", "tarde"] as const).flatMap((r) =>
        pasosDeLaRonda(r, registros, LUNES),
      ),
      tareas: [],
      registros,
      perros: [],
    });
    expect(texto).toContain("- Almuerzo");
    expect(texto).not.toContain("Desayuno");
    expect(texto).not.toContain("- Cambiar las aguas");
    expect(texto).not.toContain("Cena");
  });

  it("lo que no se hizo dice por qué", () => {
    const patio = tarea({ id: "t2", titulo: "Lavar patio" });
    const registros = [registro({ clave: "t2", estado: "no_se_hizo", nota: "llueve" })];
    const texto = armarResumenDelTurno({
      fecha: LUNES,
      ahora: instanteEnHora(LUNES, "10:00"),
      autor: "Flo",
      pasos: [],
      tareas: tareasDelDia([patio], registros, LUNES),
      registros,
      perros: [],
    });
    expect(texto).toContain("- Lavar patio (no se hizo: llueve)");
  });
});

describe("rutinaQueFalta", () => {
  it("no duplica lo que ya está, aunque cambien tildes o mayúsculas", () => {
    const falta = rutinaQueFalta([
      { titulo: "barrer y trapear ceramica", tipo: "rutina" },
    ]);
    expect(falta.some((t) => t.titulo === "Barrer y trapear cerámica")).toBe(false);
    expect(falta.length).toBeGreaterThan(5);
  });

  it("un encargo con el mismo nombre no cuenta como rutina", () => {
    const falta = rutinaQueFalta([{ titulo: "Limpiar baños", tipo: "encargo" }]);
    expect(falta.some((t) => t.titulo === "Limpiar baños")).toBe(true);
  });
});
