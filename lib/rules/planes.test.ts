import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { PlanComprado } from "@/lib/types";
import {
  comprarPlan,
  consumirDiaDePlan,
  crearPlanComprado,
  diasHabilesEntre,
  diasPerdidos,
  elegirPlanParaUsar,
  esDiaHabil,
  nombreDePlan,
  planVigente,
  planesVigentes,
  precioDePlan,
  precioPorDia,
  saldoPlan,
  ultimoDiaDelMes,
} from "./planes";

// 1 de junio de 2026 es lunes; el mes cierra el martes 30.
const COMPRA = instanteEnHora("2026-06-01", "10:00");

function plan(dias = 5, id = "pl1"): PlanComprado {
  return crearPlanComprado({
    id,
    clienteId: "c1",
    perroId: "p1",
    tipo: "dias",
    dias,
    compradoEn: COMPRA,
  });
}

describe("precio por día", () => {
  it("de 5 a 10 días el día sale $15.000", () => {
    expect(precioPorDia(5)).toBe(15_000);
    expect(precioPorDia(10)).toBe(15_000);
  });

  it("sobre 10 días baja a $14.000", () => {
    expect(precioPorDia(11)).toBe(14_000);
    expect(precioPorDia(20)).toBe(14_000);
  });

  it("el plan se cobra por día", () => {
    expect(precioDePlan("dias", 5)).toBe(75_000);
    expect(precioDePlan("dias", 20)).toBe(280_000);
  });

  it("el pase libre tiene precio fijo", () => {
    expect(precioDePlan("pase_libre", 22)).toBe(220_000);
  });
});

describe("vigencia mensual", () => {
  it("vence el último día del mes en que se compró", () => {
    expect(ultimoDiaDelMes("2026-06")).toBe("2026-06-30");
    expect(ultimoDiaDelMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDelMes("2026-12")).toBe("2026-12-31");
    expect(plan().venceEn).toBe("2026-06-30");
  });

  it("el último día todavía sirve, el siguiente no", () => {
    expect(planVigente(plan(), "2026-06-30")).toBe(true);
    expect(planVigente(plan(), "2026-07-01")).toBe(false);
  });

  it("los días no usados no pasan al mes siguiente", () => {
    const usado = { ...plan(), diasUsados: 2 };
    expect(diasPerdidos(usado, "2026-07-01")).toBe(3);
    expect(diasPerdidos(usado, "2026-06-20")).toBe(0);
  });
});

describe("pase libre", () => {
  it("cubre los días hábiles que le quedan al mes", () => {
    const pase = crearPlanComprado({
      id: "pl-libre",
      clienteId: "c1",
      perroId: "p1",
      tipo: "pase_libre",
      compradoEn: COMPRA,
    });

    expect(pase.diasTotales).toBe(diasHabilesEntre("2026-06-01", "2026-06-30"));
    expect(pase.precio).toBe(220_000);
    expect(nombreDePlan(pase)).toBe("Pase libre del mes");
  });

  it("comprado a mitad de mes cubre menos días", () => {
    const pase = crearPlanComprado({
      id: "pl-libre",
      clienteId: "c1",
      perroId: "p1",
      tipo: "pase_libre",
      compradoEn: instanteEnHora("2026-06-20", "10:00"),
    });
    expect(pase.diasTotales).toBe(diasHabilesEntre("2026-06-20", "2026-06-30"));
  });
});

describe("días hábiles", () => {
  it("reconoce el fin de semana", () => {
    expect(esDiaHabil("2026-06-19")).toBe(true); // viernes
    expect(esDiaHabil("2026-06-20")).toBe(false); // sábado
    expect(esDiaHabil("2026-06-21")).toBe(false); // domingo
  });

  it("cuenta solo de lunes a viernes", () => {
    expect(diasHabilesEntre("2026-06-15", "2026-06-21")).toBe(5);
  });
});

describe("uso del plan", () => {
  it("no hay plan usable el fin de semana", () => {
    expect(elegirPlanParaUsar([plan()], "p1", "2026-06-19")).not.toBeNull();
    expect(elegirPlanParaUsar([plan()], "p1", "2026-06-20")).toBeNull();
  });

  it("usa primero el que vence antes", () => {
    const junio = plan(5, "junio");
    const julio = crearPlanComprado({
      id: "julio",
      clienteId: "c1",
      perroId: "p1",
      tipo: "dias",
      dias: 5,
      compradoEn: instanteEnHora("2026-07-01", "10:00"),
    });
    expect(elegirPlanParaUsar([julio, junio], "p1", "2026-06-15")?.id).toBe(
      "junio",
    );
  });

  it("ignora los planes de otro perro", () => {
    const deOtro = { ...plan(5, "otro"), perroId: "p9" };
    expect(elegirPlanParaUsar([deOtro], "p1", "2026-06-15")).toBeNull();
  });

  it("descuenta un día por jornada, sin pasarse del total", () => {
    const p = consumirDiaDePlan(plan());
    expect(saldoPlan(p)).toBe(4);
    expect(consumirDiaDePlan({ ...plan(), diasUsados: 5 }).diasUsados).toBe(5);
  });

  it("sin saldo deja de estar vigente", () => {
    expect(planVigente({ ...plan(), diasUsados: 5 }, "2026-06-15")).toBe(false);
  });
});

describe("comprarPlan", () => {
  it("cierra el plan anterior: los días no son acumulables", () => {
    const anterior = { ...plan(5, "viejo"), diasUsados: 2 };
    const { plan: nuevo, cerrados } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "dias",
      dias: 20,
      compradoEn: instanteEnHora("2026-06-10", "10:00"),
      planesActuales: [anterior],
    });

    expect(cerrados).toHaveLength(1);
    expect(cerrados[0].cerradoEn).toBeDefined();
    expect(nuevo.diasTotales).toBe(20);
    expect(planesVigentes([...cerrados, nuevo], "2026-06-11")).toHaveLength(1);
  });

  it("no toca los planes de otros perros", () => {
    const deOtro = { ...plan(5, "otro"), perroId: "p9" };
    const { cerrados } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "dias",
      dias: 5,
      compradoEn: COMPRA,
      planesActuales: [deOtro],
    });
    expect(cerrados).toHaveLength(0);
  });

  it("cotiza el plan con su precio por día", () => {
    const { cotizacion } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "dias",
      dias: 20,
      compradoEn: COMPRA,
      planesActuales: [],
    });
    expect(cotizacion.total).toBe(280_000);
  });

  it("respeta el mínimo de días", () => {
    expect(plan(2).diasTotales).toBe(5);
  });
});
