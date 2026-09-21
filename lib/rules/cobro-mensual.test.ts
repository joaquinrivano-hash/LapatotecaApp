import { describe, expect, it } from "vitest";
import { fechaISO, instanteEnHora } from "@/lib/utils/fecha";
import type { Pago, Suscripcion } from "@/lib/types";
import {
  consumosDelPeriodo,
  generarCuentaMensual,
  mesAnterior,
  mesSiguiente,
  suscripcionesACobrar,
} from "./cobro-mensual";

const PERIODO = "2026-08";

function suscripcion(sobrescribir: Partial<Suscripcion> = {}): Suscripcion {
  return {
    id: "s1",
    clienteId: "c1",
    perroId: "p1",
    tipo: "dias",
    diasContratados: 20,
    estado: "activa",
    creadaEn: instanteEnHora("2026-05-01", "10:00"),
    proximoCobro: "2026-09-01",
    ...sobrescribir,
  };
}

function pago(sobrescribir: Partial<Pago> = {}): Pago {
  return {
    id: "pg1",
    clienteId: "c1",
    concepto: "dia_suelto",
    monto: 18_000,
    estado: "pendiente",
    emitidoEn: instanteEnHora("2026-08-14", "10:00"),
    ...sobrescribir,
  };
}

describe("navegación de periodos", () => {
  it("avanza y retrocede un mes", () => {
    expect(mesSiguiente("2026-08")).toBe("2026-09");
    expect(mesAnterior("2026-08")).toBe("2026-07");
  });

  it("cruza el fin de año", () => {
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
});

describe("suscripcionesACobrar", () => {
  it("cobra las activas que ya tocan", () => {
    expect(suscripcionesACobrar([suscripcion()], "2026-09-01")).toHaveLength(1);
  });

  it("no cobra las pausadas ni las canceladas", () => {
    expect(
      suscripcionesACobrar(
        [suscripcion({ estado: "pausada" }), suscripcion({ estado: "cancelada" })],
        "2026-09-01",
      ),
    ).toHaveLength(0);
  });

  it("no adelanta cobros de meses futuros", () => {
    expect(
      suscripcionesACobrar([suscripcion({ proximoCobro: "2026-10-01" })], "2026-09-01"),
    ).toHaveLength(0);
  });
});

describe("consumosDelPeriodo", () => {
  it("toma solo lo impago emitido dentro del mes", () => {
    const pagos = [
      pago(),
      pago({ id: "pg2", emitidoEn: instanteEnHora("2026-07-20", "10:00") }),
      pago({ id: "pg3", estado: "pagado" }),
    ];
    expect(consumosDelPeriodo(pagos, PERIODO)).toHaveLength(1);
  });

  it("incluye lo vencido, que sigue debiéndose", () => {
    expect(consumosDelPeriodo([pago({ estado: "vencido" })], PERIODO)).toHaveLength(1);
  });

  it("no arrastra otra cuenta mensual: no se cobra dos veces", () => {
    expect(
      consumosDelPeriodo([pago({ concepto: "cuenta_mensual" })], PERIODO),
    ).toHaveLength(0);
  });
});

describe("generarCuentaMensual", () => {
  it("se emite el día 1 del mes siguiente al consumido", () => {
    const cuenta = generarCuentaMensual({
      id: "cm1",
      clienteId: "c1",
      periodo: PERIODO,
      suscripciones: [],
      pagosPendientes: [],
    });
    expect(fechaISO(cuenta.emitidaEn)).toBe("2026-09-01");
    expect(cuenta.periodo).toBe(PERIODO);
  });

  it("junta la renovación del plan con los consumos sueltos", () => {
    const cuenta = generarCuentaMensual({
      id: "cm1",
      clienteId: "c1",
      periodo: PERIODO,
      suscripciones: [suscripcion()],
      pagosPendientes: [
        pago(),
        pago({ id: "pg2", concepto: "servicio", monto: 13_000 }),
      ],
      nombrePerro: () => "Pancho",
    });

    expect(cuenta.renovaciones).toHaveLength(1);
    expect(cuenta.renovaciones[0].detalle).toBe("Para Pancho");
    expect(cuenta.consumos).toHaveLength(2);
    expect(cuenta.total).toBe(311_000);
    expect(cuenta.estado).toBe("pendiente");
  });

  it("no mezcla la plata de otros clientes", () => {
    const cuenta = generarCuentaMensual({
      id: "cm1",
      clienteId: "c1",
      periodo: PERIODO,
      suscripciones: [suscripcion({ clienteId: "c9" })],
      pagosPendientes: [pago({ clienteId: "c9", monto: 99_000 })],
    });
    expect(cuenta.total).toBe(0);
  });

  it("un cliente sin movimientos queda en cero", () => {
    const cuenta = generarCuentaMensual({
      id: "cm1",
      clienteId: "c1",
      periodo: PERIODO,
      suscripciones: [],
      pagosPendientes: [],
    });
    expect(cuenta.total).toBe(0);
    expect(cuenta.renovaciones).toEqual([]);
  });
});
