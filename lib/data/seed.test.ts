import { describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import { vacunasFaltantes } from "@/lib/rules/admision";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
} from "@/lib/rules/capacidad";
import { saldoPlan } from "@/lib/rules/planes";
import {
  esFinDeSemana,
  fechaISO,
  rangoFechas,
  sumarDias,
} from "@/lib/utils/fecha";
import { DIAS_AGENDA, DIAS_HISTORIAL, generarSeed } from "./seed";

const HOY = "2026-09-21";
const datos = generarSeed(HOY);

const diasDelSeed = rangoFechas(
  sumarDias(HOY, -(DIAS_HISTORIAL - 1)),
  sumarDias(HOY, DIAS_AGENDA),
);

/** Perros alojados esa noche. */
const enHotel = (fecha: string) =>
  datos.reservasHotel.filter(
    (r) =>
      fechaISO(r.inicioProgramado) <= fecha &&
      fecha < fechaISO(r.finProgramado),
  ).length;

const enJardin = (fecha: string) =>
  datos.estadiasJardin.filter(
    (e) => e.fecha === fecha && e.origen !== "dia_de_prueba",
  ).length;

describe("determinismo", () => {
  it("dos corridas con la misma fecha dan exactamente lo mismo", () => {
    expect(JSON.stringify(generarSeed(HOY))).toBe(
      JSON.stringify(generarSeed(HOY)),
    );
  });

  it("otra semilla da otros datos", () => {
    expect(JSON.stringify(generarSeed(HOY, 1))).not.toBe(
      JSON.stringify(generarSeed(HOY)),
    );
  });
});

describe("volumen", () => {
  it("genera 40 clientes y 50 perros", () => {
    expect(datos.clientes).toHaveLength(40);
    expect(datos.perros).toHaveLength(50);
  });

  it("cubre 60 días de historial más la agenda que viene", () => {
    const fechas = datos.estadiasJardin.map((e) => e.fecha).sort();
    expect(fechas[0]).toBe(sumarDias(HOY, -(DIAS_HISTORIAL - 1)));
    expect(fechas.at(-1)! > HOY).toBe(true);
  });

  it("todo perro pertenece a un cliente que existe", () => {
    const ids = new Set(datos.clientes.map((c) => c.id));
    expect(datos.perros.every((p) => ids.has(p.clienteId))).toBe(true);
  });
});

describe("patrón de asistencia", () => {
  it("el jardín se llena entre semana", () => {
    const entreSemana = diasDelSeed.filter((f) => !esFinDeSemana(f)).map(enJardin);
    expect(Math.min(...entreSemana)).toBeGreaterThanOrEqual(15);
    expect(Math.max(...entreSemana)).toBeLessThanOrEqual(18);
  });

  it("el jardín se vacía el fin de semana", () => {
    const finde = diasDelSeed.filter(esFinDeSemana).map(enJardin);
    expect(Math.max(...finde)).toBeLessThanOrEqual(4);
  });

  it("el hotel hace lo contrario: flojo entre semana", () => {
    const entreSemana = diasDelSeed
      .slice(0, DIAS_HISTORIAL)
      .filter((f) => !esFinDeSemana(f))
      .map(enHotel);
    expect(Math.min(...entreSemana)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...entreSemana)).toBeLessThanOrEqual(4);
  });

  it("el hotel se llena el fin de semana", () => {
    const finde = diasDelSeed
      .slice(0, DIAS_HISTORIAL)
      .filter(esFinDeSemana)
      .map(enHotel);
    expect(Math.min(...finde)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...finde)).toBeLessThanOrEqual(7);
  });
});

describe("coherencia con las reglas", () => {
  it("nunca sobrepasa los 25 cupos simultáneos, ningún día", () => {
    const ocupantes = [
      ...ocupantesDeReservas(datos.reservasHotel),
      ...ocupantesDeEstadias(datos.estadiasJardin),
    ];
    const picos = diasDelSeed.map(
      (f) => calcularOcupacionDia(f, ocupantes).pico,
    );
    expect(Math.max(...picos)).toBeLessThanOrEqual(
      NEGOCIO.capacidad.maximoSimultaneo,
    );
  });

  it("ningún perro con historial se saltó el día de prueba", () => {
    const conHistorial = new Set(
      datos.estadiasJardin
        .filter((e) => e.origen !== "dia_de_prueba")
        .map((e) => e.perroId),
    );
    for (const perroId of conHistorial) {
      const perro = datos.perros.find((p) => p.id === perroId)!;
      expect(perro.diaDePrueba.estado).toBe("aprobado");
    }
  });

  it("ningún perro pasa del peso máximo", () => {
    expect(
      datos.perros.every((p) => p.pesoKg <= NEGOCIO.admision.pesoMaximoKg),
    ).toBe(true);
  });

  it("ningún plan gasta más días de los que compró", () => {
    expect(datos.planes.every((p) => p.diasUsados <= p.diasTotales)).toBe(true);
    expect(datos.planes.every((p) => saldoPlan(p) >= 0)).toBe(true);
  });

  it("las estadías con plan apuntan a un plan que existe", () => {
    const ids = new Set(datos.planes.map((p) => p.id));
    const conPlan = datos.estadiasJardin.filter((e) => e.origen === "plan");
    expect(conPlan.length).toBeGreaterThan(0);
    expect(conPlan.every((e) => e.planId && ids.has(e.planId))).toBe(true);
  });

  it("un perro no puede estar en el jardín y alojado el mismo día", () => {
    for (const estadia of datos.estadiasJardin) {
      const alojado = datos.reservasHotel.some(
        (r) =>
          r.perroId === estadia.perroId &&
          fechaISO(r.inicioProgramado) <= estadia.fecha &&
          estadia.fecha < fechaISO(r.finProgramado),
      );
      expect(alojado).toBe(false);
    }
  });
});

describe("plata", () => {
  it("cada pago apunta a un cliente que existe", () => {
    const ids = new Set(datos.clientes.map((c) => c.id));
    expect(datos.pagos.every((p) => ids.has(p.clienteId))).toBe(true);
  });

  it("los abonos de hotel son el 30% de su reserva", () => {
    for (const pago of datos.pagos.filter((p) => p.concepto === "abono_hotel")) {
      const reserva = datos.reservasHotel.find((r) => r.id === pago.referenciaId)!;
      expect(pago.monto).toBe(reserva.cotizacion.abono);
    }
  });

  it("hay cobranza pendiente para que el backoffice tenga qué mostrar", () => {
    const pendientes = datos.pagos.filter((p) => p.estado === "pendiente");
    expect(pendientes.length).toBeGreaterThan(5);
  });

  it("todos los montos son enteros: no existe el medio peso", () => {
    expect(datos.pagos.every((p) => Number.isInteger(p.monto))).toBe(true);
  });
});

describe("alertas del backoffice", () => {
  it("hay perros con vacunas vencidas", () => {
    const vencidos = datos.perros.filter(
      (p) => vacunasFaltantes(p, HOY).length > 0,
    );
    expect(vencidos.length).toBeGreaterThan(0);
  });

  it("hay machos sin esterilizar", () => {
    expect(
      datos.perros.some((p) => p.sexo === "macho" && !p.esterilizado),
    ).toBe(true);
  });

  it("hay perros esperando su día de prueba", () => {
    expect(
      datos.perros.some((p) => p.diaDePrueba.estado !== "aprobado"),
    ).toBe(true);
  });

  it("hay productos sin stock", () => {
    expect(datos.productos.some((p) => p.stock === 0)).toBe(true);
  });

  it("hay retiros fuera de horario que generaron recargo", () => {
    const conRecargo = datos.estadiasJardin.filter((e) =>
      e.cotizacion?.lineas.some((l) => l.concepto === "Fuera de horario"),
    );
    expect(conRecargo.length).toBeGreaterThan(0);
  });
});

describe("operación diaria", () => {
  it("hoy hay perros presentes y perros esperados", () => {
    const deHoy = datos.estadiasJardin.filter((e) => e.fecha === HOY);
    expect(deHoy.some((e) => e.estado === "presente")).toBe(true);
    expect(deHoy.some((e) => e.estado === "esperada")).toBe(true);
  });

  it("hay reportes e incidentes con autor", () => {
    expect(datos.reportes.length).toBeGreaterThan(50);
    expect(datos.reportes.every((r) => r.perroIds.length > 0)).toBe(true);
    expect(datos.incidentes.every((i) => i.autorStaff.length > 0)).toBe(true);
  });
});

describe("el seed aguanta cualquier día de referencia", () => {
  // El anclaje se mueve con la fecha real, así que los patrones y el tope de
  // capacidad tienen que cumplirse siempre, no solo el día que se escribió
  // este test.
  it.each(["2026-01-15", "2026-03-08", "2027-02-28"])(
    "anclado en %s",
    (fecha) => {
      const d = generarSeed(fecha);
      const dias = rangoFechas(
        sumarDias(fecha, -(DIAS_HISTORIAL - 1)),
        sumarDias(fecha, DIAS_AGENDA),
      );
      const ocupantes = [
        ...ocupantesDeReservas(d.reservasHotel),
        ...ocupantesDeEstadias(d.estadiasJardin),
      ];

      const picos = dias.map((f) => calcularOcupacionDia(f, ocupantes).pico);
      expect(Math.max(...picos)).toBeLessThanOrEqual(
        NEGOCIO.capacidad.maximoSimultaneo,
      );

      const jardinEntreSemana = dias
        .filter((f) => !esFinDeSemana(f))
        .map(
          (f) =>
            d.estadiasJardin.filter(
              (e) => e.fecha === f && e.origen !== "dia_de_prueba",
            ).length,
        );
      expect(Math.min(...jardinEntreSemana)).toBeGreaterThanOrEqual(15);
      expect(Math.max(...jardinEntreSemana)).toBeLessThanOrEqual(18);

      const hotelEntreSemana = dias
        .slice(0, DIAS_HISTORIAL)
        .filter((f) => !esFinDeSemana(f))
        .map(
          (f) =>
            d.reservasHotel.filter(
              (r) =>
                fechaISO(r.inicioProgramado) <= f &&
                f < fechaISO(r.finProgramado),
            ).length,
        );
      expect(Math.max(...hotelEntreSemana)).toBeLessThanOrEqual(4);
    },
  );
});
