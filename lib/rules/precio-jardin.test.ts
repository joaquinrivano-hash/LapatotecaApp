import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  calcularPrecioJardin,
  calcularRecargoFueraDeHorario,
  clasificarJornada,
} from "./precio-jardin";

const DIA = "2026-06-15";
const en = (hora: string) => instanteEnHora(DIA, hora);

describe("clasificarJornada", () => {
  it("bajo 4 horas es jornada corta", () => {
    expect(clasificarJornada(en("08:00"), en("11:30"))).toBe("corta");
  });

  it("4 horas justas ya son jornada media", () => {
    expect(clasificarJornada(en("08:00"), en("12:00"))).toBe("media");
  });

  it("8 horas justas siguen siendo jornada media", () => {
    expect(clasificarJornada(en("08:00"), en("16:00"))).toBe("media");
  });

  it("un minuto más de 8 horas es jornada larga", () => {
    expect(clasificarJornada(en("08:00"), en("16:01"))).toBe("larga");
  });
});

describe("calcularPrecioJardin", () => {
  it("cobra $10.000 la jornada corta", () => {
    const c = calcularPrecioJardin({
      inicio: en("08:00"),
      fin: en("11:30"),
      origen: "dia_suelto",
    });
    expect(c.total).toBe(10_000);
  });

  it("cobra $16.000 la jornada media", () => {
    const c = calcularPrecioJardin({
      inicio: en("08:00"),
      fin: en("14:00"),
      origen: "dia_suelto",
    });
    expect(c.total).toBe(16_000);
  });

  it("cobra $18.000 la jornada larga", () => {
    const c = calcularPrecioJardin({
      inicio: en("08:00"),
      fin: en("17:00"),
      origen: "dia_suelto",
    });
    expect(c.total).toBe(18_000);
  });

  it("con plan la jornada no se cobra: consume un día del pack", () => {
    const c = calcularPrecioJardin({
      inicio: en("08:00"),
      fin: en("17:00"),
      origen: "plan",
    });
    expect(c.total).toBe(0);
    expect(c.lineas[0].detalle).toContain("1 día del pack");
  });

  it("el día de prueba cuesta $10.000", () => {
    const c = calcularPrecioJardin({
      inicio: en("09:00"),
      fin: en("13:00"),
      origen: "dia_de_prueba",
    });
    expect(c.total).toBe(10_000);
  });

  it("el segundo perro tiene 20% en el día suelto", () => {
    const c = calcularPrecioJardin({
      inicio: en("08:00"),
      fin: en("17:00"),
      origen: "dia_suelto",
      indicePerro: 1,
    });
    expect(c.total).toBe(14_400);
  });
});

describe("recargo fuera de horario", () => {
  it("retirar antes del cierre no tiene recargo", () => {
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("18:30")).monto).toBe(0);
  });

  it("los primeros 15 minutos son de gracia", () => {
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("19:10")).monto).toBe(0);
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("19:15")).monto).toBe(0);
  });

  it("pasada la gracia se cobra la hora iniciada completa", () => {
    const r = calcularRecargoFueraDeHorario(en("08:00"), en("19:20"));
    expect(r.horas).toBe(1);
    expect(r.monto).toBe(1_000);
  });

  it("cuenta cada hora iniciada después del cierre", () => {
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("20:30")).monto).toBe(
      2_000,
    );
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("21:00")).monto).toBe(
      2_000,
    );
    expect(calcularRecargoFueraDeHorario(en("08:00"), en("21:05")).monto).toBe(
      3_000,
    );
  });

  it("se suma al día suelto", () => {
    const c = calcularPrecioJardin({
      inicio: en("07:30"),
      fin: en("19:20"),
      origen: "dia_suelto",
    });
    expect(c.total).toBe(19_000);
  });

  it("el plan cubre el día, no que lo retiren tarde", () => {
    const c = calcularPrecioJardin({
      inicio: en("07:30"),
      fin: en("20:30"),
      origen: "plan",
    });
    expect(c.total).toBe(2_000);
  });
});
