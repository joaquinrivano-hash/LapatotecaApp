import { describe, expect, it } from "vitest";
import { instanteEnHora } from "@/lib/utils/fecha";
import {
  calcularDevolucionJardin,
  calcularHorasDeMas,
  calcularPrecioJardin,
  calcularRecargoFueraDeHorario,
  clasificarJornada,
  describirHorasDeMas,
  horariosDeIngreso,
  horariosDeSalida,
  revisarHorarioJardin,
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

describe("recargo fuera de horario con plan", () => {
  const recargo = (hasta: string) =>
    calcularRecargoFueraDeHorario(en("08:00"), en(hasta), "plan");

  it("retirar antes del cierre no tiene recargo", () => {
    expect(recargo("18:30").monto).toBe(0);
    expect(recargo("19:00").monto).toBe(0);
  });

  // Sin gracia automática: cada minuto de más le llega a Administración,
  // que es la que decide si lo cobra o lo perdona.
  it("un minuto después del cierre ya es un bloque", () => {
    const r = recargo("19:01");
    expect(r.bloques).toBe(1);
    expect(r.monto).toBe(500);
    expect(r.minutosDeAtraso).toBe(1);
    expect(r.desde).toBe("19:00");
  });

  it("cada 30 minutos o fracción entre las 19:00 y las 21:00 son $500", () => {
    expect(recargo("19:30").monto).toBe(500);
    expect(recargo("19:31").monto).toBe(1_000);
    expect(recargo("20:30").monto).toBe(1_500);
    expect(recargo("21:00").monto).toBe(2_000);
  });

  // Pasado el fin de la atención se suma el cargo fijo, y los bloques
  // paran en las 21:00: no se siguen contando encima.
  it("pasadas las 21:00 se suman los $5.000 a los $2.000 de las dos horas", () => {
    const r = recargo("21:40");
    expect(r.bloques).toBe(4);
    expect(r.despuesDeAtencion).toBe(true);
    expect(r.monto).toBe(7_000);
    expect(recargo("23:00").monto).toBe(7_000);
  });
});

describe("recargo fuera de horario con día suelto", () => {
  const recargo = (hasta: string, origen: "dia_suelto" | "dia_de_prueba" = "dia_suelto") =>
    calcularRecargoFueraDeHorario(en("08:00"), en(hasta), origen);

  // El día suelto se paga entero y alcanza hasta el fin de la atención.
  it("entre las 19:00 y las 21:00 no hay recargo", () => {
    expect(recargo("19:45").monto).toBe(0);
    expect(recargo("21:00").monto).toBe(0);
  });

  it("pasadas las 21:00 es un cargo fijo de $5.000", () => {
    const r = recargo("21:10");
    expect(r.monto).toBe(5_000);
    expect(r.minutosDeAtraso).toBe(10);
    expect(r.desde).toBe("21:00");
    expect(recargo("22:30").monto).toBe(5_000);
  });

  it("el día de prueba sigue la regla del día suelto", () => {
    expect(recargo("20:00", "dia_de_prueba").monto).toBe(0);
    expect(recargo("21:30", "dia_de_prueba").monto).toBe(5_000);
  });
});

// El retiro tarde es una decisión de Administración, con su propia cola.
// Si además fuera dentro del precio del día, se cobraría dos veces.
describe("el precio del día no trae el retiro tarde adentro", () => {
  it("un día suelto retirado tarde cuesta lo mismo que el día", () => {
    const c = calcularPrecioJardin({
      inicio: en("07:30"),
      fin: en("21:20"),
      origen: "dia_suelto",
    });
    expect(c.total).toBe(18_000);
    expect(c.lineas.map((l) => l.concepto)).toEqual(["Jardín día suelto"]);
  });

  it("con plan sigue en cero aunque lo retiren tarde", () => {
    const c = calcularPrecioJardin({
      inicio: en("07:30"),
      fin: en("20:30"),
      origen: "plan",
    });
    expect(c.total).toBe(0);
  });
});

describe("los horarios que se pueden elegir", () => {
  it("el ingreso va de 07:00 a 18:30, cada media hora", () => {
    const ingresos = horariosDeIngreso();
    expect(ingresos[0]).toBe(7 * 60);
    expect(ingresos.at(-1)).toBe(18 * 60 + 30);
    expect(ingresos).toHaveLength(24);
  });

  it("la salida parte media hora después del ingreso y llega al cierre", () => {
    const salidas = horariosDeSalida(9 * 60);
    expect(salidas[0]).toBe(9 * 60 + 30);
    expect(salidas.at(-1)).toBe(19 * 60);
  });

  it("revisa que el horario sirva", () => {
    expect(revisarHorarioJardin(9 * 60, 13 * 60)).toEqual([]);
    expect(revisarHorarioJardin(13 * 60, 9 * 60)).toEqual([
      "La hora de salida tiene que ser después de la de ingreso.",
    ]);
    expect(revisarHorarioJardin(6 * 60, 13 * 60)[0]).toMatch(/de 07:00 a 19:00/);
    expect(revisarHorarioJardin(9 * 60, 20 * 60)[0]).toMatch(/de 07:00 a 19:00/);
  });
});

describe("las horas de más", () => {
  const dia = (desde: string, hasta: string, realDesde: string, realHasta: string, cobrado: number) =>
    calcularHorasDeMas({
      inicioProgramado: en(desde),
      finProgramado: en(hasta),
      inicioReal: en(realDesde),
      finReal: en(realHasta),
      cobrado,
    });

  it("reservó 3 horas y se quedó 9: falta la diferencia hasta el día largo", () => {
    const h = dia("09:00", "12:00", "09:00", "18:00", 10_000);
    expect(h).toEqual({ monto: 8_000, reservada: "corta", real: "larga" });
  });

  it("reservó 3 horas y se quedó 5: falta hasta el tramo medio", () => {
    expect(dia("09:00", "12:00", "09:00", "14:00", 10_000).monto).toBe(6_000);
  });

  // Llegar antes o irse después dentro del mismo tramo no es otra reserva.
  it("dentro del mismo tramo no falta nada", () => {
    expect(dia("09:00", "14:00", "08:30", "16:30", 16_000).monto).toBe(0);
  });

  it("irse antes no devuelve nada", () => {
    expect(dia("07:00", "19:00", "09:00", "11:00", 18_000).monto).toBe(0);
  });

  // Si el día tuvo el descuento del segundo perro, la diferencia también.
  it("respeta el descuento con que se cobró lo reservado", () => {
    expect(dia("09:00", "12:00", "09:00", "18:00", 8_000).monto).toBe(6_400);
  });

  it("cuenta desde la llegada real: llegar antes también suma horas", () => {
    expect(dia("12:00", "15:00", "08:00", "15:00", 10_000).monto).toBe(6_000);
  });

  it("lo describe con las horas, para la planilla y para el dueño", () => {
    expect(
      describirHorasDeMas({
        inicioProgramado: en("09:00"),
        finProgramado: en("12:00"),
        inicioReal: en("09:10"),
        finReal: en("18:00"),
      }),
    ).toBe("Reservó 09:00 a 12:00 · estuvo 09:10 a 18:00");
  });
});

describe("cancelar un día de jardín", () => {
  const llegada = instanteEnHora("2026-06-15", "08:00");

  it("con 24 horas o más de aviso no se cobra", () => {
    const r = calcularDevolucionJardin(
      llegada,
      instanteEnHora("2026-06-14", "08:00"),
    );
    expect(r.devuelve).toBe(true);
    expect(r.horasDeAviso).toBe(24);
  });

  it("el corte es inclusivo: justo 24 horas devuelve", () => {
    // Un umbral exclusivo haría que cancelar "con un día de aviso" fallara
    // por segundos, que es la clase de regla que nadie entiende cuando le
    // pasa.
    const r = calcularDevolucionJardin(
      llegada,
      instanteEnHora("2026-06-14", "08:00"),
    );
    expect(r.devuelve).toBe(true);
  });

  it("con menos de 24 horas el día se pierde", () => {
    const r = calcularDevolucionJardin(
      llegada,
      instanteEnHora("2026-06-14", "20:00"),
    );
    expect(r.devuelve).toBe(false);
    expect(r.motivo).toContain("se cobra completo");
  });

  it("si el día ya empezó lo dice con esas palabras", () => {
    const r = calcularDevolucionJardin(
      llegada,
      instanteEnHora("2026-06-15", "10:00"),
    );
    expect(r.devuelve).toBe(false);
    expect(r.motivo).toBe("El día ya empezó: se cobra completo.");
  });

  it("el motivo dice cuántas horas de aviso hubo", () => {
    // "No se devuelve" sin el número deja al dueño sin saber por cuánto no
    // alcanzó, que es justo lo que quiere saber para la próxima vez.
    const r = calcularDevolucionJardin(
      llegada,
      instanteEnHora("2026-06-14", "12:00"),
    );
    expect(r.motivo).toContain("20 h de aviso");
  });
});
