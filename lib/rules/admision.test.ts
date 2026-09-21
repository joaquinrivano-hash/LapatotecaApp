import { describe, expect, it } from "vitest";
import type { Perro, Vacuna } from "@/lib/types";
import {
  evaluarAdmision,
  tieneVacunasAlDia,
  vacunasFaltantes,
  vacunasPorVencer,
} from "./admision";

const HOY = "2026-06-15";

function vacunasAlDia(vence = "2027-01-01"): Vacuna[] {
  return [
    { tipo: "sextuple", fechaAplicacion: "2026-01-01", fechaVencimiento: vence },
    {
      tipo: "antirrabica",
      fechaAplicacion: "2026-01-01",
      fechaVencimiento: vence,
    },
    {
      tipo: "traqueobronquitis",
      fechaAplicacion: "2026-01-01",
      fechaVencimiento: vence,
    },
  ];
}

function perro(sobrescribir: Partial<Perro> = {}): Perro {
  return {
    id: "p1",
    clienteId: "c1",
    nombre: "Pancho",
    raza: "Quiltro",
    pesoKg: 12,
    sexo: "macho",
    esterilizado: true,
    vacunas: vacunasAlDia(),
    diaDePrueba: { estado: "aprobado", fecha: "2026-05-01" },
    creadoEn: "2026-01-01T12:00:00.000Z",
    ...sobrescribir,
  };
}

describe("evaluarAdmision", () => {
  it("admite al perro que cumple todo", () => {
    expect(evaluarAdmision(perro(), { fecha: HOY }).admitido).toBe(true);
  });

  it("rechaza sobre 20 kg", () => {
    const r = evaluarAdmision(perro({ pesoKg: 24 }), { fecha: HOY });
    expect(r.admitido).toBe(false);
    expect(r.problemas[0].motivo).toBe("peso");
    expect(r.problemas[0].subsanable).toBe(false);
  });

  it("20 kg justos entran", () => {
    expect(evaluarAdmision(perro({ pesoKg: 20 }), { fecha: HOY }).admitido).toBe(
      true,
    );
  });

  it("rechaza al macho sin esterilizar", () => {
    const r = evaluarAdmision(perro({ esterilizado: false }), { fecha: HOY });
    expect(r.problemas.map((p) => p.motivo)).toContain("esterilizacion");
  });

  it("no le pide esterilización a las hembras", () => {
    const r = evaluarAdmision(
      perro({ sexo: "hembra", esterilizado: false, nombre: "Luna" }),
      { fecha: HOY },
    );
    expect(r.admitido).toBe(true);
  });

  it("rechaza con vacunas vencidas y dice cuáles", () => {
    const r = evaluarAdmision(
      perro({
        vacunas: [
          {
            tipo: "sextuple",
            fechaAplicacion: "2025-01-01",
            fechaVencimiento: "2026-01-01",
          },
        ],
      }),
      { fecha: HOY },
    );
    expect(r.admitido).toBe(false);
    const vacunas = r.problemas.find((p) => p.motivo === "vacunas")!;
    expect(vacunas.mensaje).toContain("séxtuple");
    expect(vacunas.mensaje).toContain("antirrábica");
  });

  it("exige el día de prueba antes de la primera reserva", () => {
    const r = evaluarAdmision(
      perro({ diaDePrueba: { estado: "pendiente" } }),
      { fecha: HOY },
    );
    expect(r.problemas.map((p) => p.motivo)).toContain("dia_de_prueba");
  });

  it("no exige día de prueba para agendar el día de prueba mismo", () => {
    const r = evaluarAdmision(perro({ diaDePrueba: { estado: "pendiente" } }), {
      fecha: HOY,
      esDiaDePrueba: true,
    });
    expect(r.admitido).toBe(true);
  });

  it("igual exige peso y vacunas para el día de prueba", () => {
    const r = evaluarAdmision(
      perro({ pesoKg: 30, diaDePrueba: { estado: "pendiente" } }),
      { fecha: HOY, esDiaDePrueba: true },
    );
    expect(r.admitido).toBe(false);
  });

  it("un día de prueba rechazado no es subsanable", () => {
    const r = evaluarAdmision(
      perro({ diaDePrueba: { estado: "rechazado" } }),
      { fecha: HOY },
    );
    expect(
      r.problemas.find((p) => p.motivo === "dia_de_prueba")!.subsanable,
    ).toBe(false);
  });

  it("acumula todos los problemas de una vez", () => {
    const r = evaluarAdmision(
      perro({
        pesoKg: 30,
        esterilizado: false,
        vacunas: [],
        diaDePrueba: { estado: "pendiente" },
      }),
      { fecha: HOY },
    );
    expect(r.problemas).toHaveLength(4);
  });
});

describe("vacunas", () => {
  it("una vacuna que vence hoy todavía sirve", () => {
    expect(
      tieneVacunasAlDia(perro({ vacunas: vacunasAlDia(HOY) }), HOY),
    ).toBe(true);
  });

  it("una vacuna vencida ayer ya no sirve", () => {
    expect(
      vacunasFaltantes(perro({ vacunas: vacunasAlDia("2026-06-14") }), HOY),
    ).toHaveLength(3);
  });

  it("toma la dosis más reciente de cada tipo", () => {
    const p = perro({
      vacunas: [
        ...vacunasAlDia(),
        {
          tipo: "sextuple",
          fechaAplicacion: "2024-01-01",
          fechaVencimiento: "2025-01-01",
        },
      ],
    });
    expect(tieneVacunasAlDia(p, HOY)).toBe(true);
  });

  it("avisa de las que están por vencer", () => {
    const p = perro({ vacunas: vacunasAlDia("2026-07-01") });
    const porVencer = vacunasPorVencer(p, HOY, 30);
    expect(porVencer).toHaveLength(3);
    expect(porVencer[0].diasRestantes).toBe(16);
  });

  it("las ya vencidas no salen como 'por vencer'", () => {
    const p = perro({ vacunas: vacunasAlDia("2026-06-01") });
    expect(vacunasPorVencer(p, HOY, 30)).toHaveLength(0);
  });
});
