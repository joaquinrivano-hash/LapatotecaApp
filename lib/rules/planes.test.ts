import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { PlanComprado } from "@/lib/types";
import {
  comprarPlan,
  consumirDiaDePlan,
  crearPlanComprado,
  diasPerdidos,
  elegirPlanParaUsar,
  planVigente,
  planesVigentes,
  saldoPlan,
} from "./planes";

const COMPRA = instanteEnHora("2026-06-01", "10:00");

function nuevoPlan(tipo: "p5" | "p20" = "p5", id = "pl1"): PlanComprado {
  return crearPlanComprado({
    id,
    clienteId: "c1",
    perroId: "p1",
    tipo,
    compradoEn: COMPRA,
  });
}

describe("crearPlanComprado", () => {
  it("el plan de 5 días vale $75.000 y dura 15 días", () => {
    const p = nuevoPlan("p5");
    expect(p.diasTotales).toBe(5);
    expect(p.precio).toBe(75_000);
    expect(p.venceEn).toBe("2026-06-16");
  });

  it("el plan de 20 días vale $200.000 y dura 45 días", () => {
    const p = nuevoPlan("p20");
    expect(p.diasTotales).toBe(20);
    expect(p.precio).toBe(200_000);
    expect(p.venceEn).toBe("2026-07-16");
  });

  it("nace sin días usados", () => {
    expect(saldoPlan(nuevoPlan())).toBe(5);
  });
});

describe("vigencia", () => {
  it("vigente dentro del plazo y con saldo", () => {
    expect(planVigente(nuevoPlan(), "2026-06-10")).toBe(true);
  });

  it("el último día de vigencia todavía sirve", () => {
    expect(planVigente(nuevoPlan(), "2026-06-16")).toBe(true);
  });

  it("al día siguiente ya venció", () => {
    expect(planVigente(nuevoPlan(), "2026-06-17")).toBe(false);
  });

  it("sin saldo no está vigente aunque no haya vencido", () => {
    const agotado = { ...nuevoPlan(), diasUsados: 5 };
    expect(planVigente(agotado, "2026-06-10")).toBe(false);
  });

  it("un plan cerrado no está vigente", () => {
    const cerrado = { ...nuevoPlan(), cerradoEn: COMPRA };
    expect(planVigente(cerrado, "2026-06-10")).toBe(false);
  });
});

describe("consumo de días", () => {
  it("descuenta un día por jornada", () => {
    const p = consumirDiaDePlan(nuevoPlan());
    expect(p.diasUsados).toBe(1);
    expect(saldoPlan(p)).toBe(4);
  });

  it("no baja del cero", () => {
    let p = { ...nuevoPlan(), diasUsados: 5 };
    p = consumirDiaDePlan(p);
    expect(p.diasUsados).toBe(5);
  });

  it("no muta el plan original", () => {
    const original = nuevoPlan();
    consumirDiaDePlan(original);
    expect(original.diasUsados).toBe(0);
  });
});

describe("elegirPlanParaUsar", () => {
  it("usa primero el que vence antes, para que no se pierdan días", () => {
    const corto = nuevoPlan("p5", "corto");
    const largo = nuevoPlan("p20", "largo");
    expect(elegirPlanParaUsar([largo, corto], "p1", "2026-06-10")?.id).toBe(
      "corto",
    );
  });

  it("ignora los planes de otro perro", () => {
    const deOtro = { ...nuevoPlan("p5", "otro"), perroId: "p9" };
    expect(elegirPlanParaUsar([deOtro], "p1", "2026-06-10")).toBeNull();
  });

  it("devuelve null si no hay ninguno vigente", () => {
    expect(elegirPlanParaUsar([nuevoPlan()], "p1", "2026-07-01")).toBeNull();
  });
});

describe("comprarPlan", () => {
  it("cierra el plan anterior: los días no son acumulables", () => {
    const anterior = { ...nuevoPlan("p5", "viejo"), diasUsados: 2 };
    const { plan, cerrados } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "p20",
      compradoEn: instanteEnHora("2026-06-10", "10:00"),
      planesActuales: [anterior],
    });

    expect(cerrados).toHaveLength(1);
    expect(cerrados[0].cerradoEn).toBeDefined();
    expect(plan.diasTotales).toBe(20);
    expect(planesVigentes([...cerrados, plan], "2026-06-11")).toHaveLength(1);
  });

  it("no toca los planes de otros perros", () => {
    const deOtro = { ...nuevoPlan("p5", "otro"), perroId: "p9" };
    const { cerrados } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "p5",
      compradoEn: instanteEnHora("2026-06-10", "10:00"),
      planesActuales: [deOtro],
    });
    expect(cerrados).toHaveLength(0);
  });

  it("cotiza el precio del pack", () => {
    const { cotizacion } = comprarPlan({
      id: "nuevo",
      clienteId: "c1",
      perroId: "p1",
      tipo: "p20",
      compradoEn: COMPRA,
      planesActuales: [],
    });
    expect(cotizacion.total).toBe(200_000);
  });
});

describe("diasPerdidos", () => {
  it("cuenta los días pagados que se vencieron sin usar", () => {
    const p = { ...nuevoPlan(), diasUsados: 2 };
    expect(diasPerdidos(p, "2026-07-01")).toBe(3);
  });

  it("no cuenta nada si el plan sigue vivo", () => {
    const p = { ...nuevoPlan(), diasUsados: 2 };
    expect(diasPerdidos(p, "2026-06-10")).toBe(0);
  });
});
