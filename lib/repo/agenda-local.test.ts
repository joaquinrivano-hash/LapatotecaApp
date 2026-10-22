/**
 * Los rechazos de la agenda en el prototipo.
 *
 * Son los mismos que hace la base en `20261022150000_cambios_de_agenda.sql`
 * y que `supabase/pruebas/aislamiento.sh` prueba allá. Los servicios
 * adelantan los más comunes con un mensaje para el dueño; estos son los que
 * no pasan aunque alguien llame directo.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { PRECIOS } from "@/lib/config/precios";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { ErrorRepositorio } from "@/lib/repo/error";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { Cotizacion, EstadiaJardin, PlanComprado } from "@/lib/types";

const LUNES = "2026-06-15";
const en = (hora: string, dia = LUNES) => instanteEnHora(dia, hora);
const CON_TIEMPO = "2026-06-13T12:00:00.000Z";

let repo: RepositorioPatoteca;

const MARTES = "2026-06-16";
const SABADO = "2026-06-20";
const PRUEBA: Cotizacion = {
  lineas: [],
  subtotal: PRECIOS.diaDePrueba,
  descuentos: [],
  total: PRECIOS.diaDePrueba,
};
const CON_PLAN: Cotizacion = { lineas: [], subtotal: 0, descuentos: [], total: 0 };

const PLAN: PlanComprado = {
  id: "plan-1",
  clienteId: "cli-1",
  perroId: "perro-2",
  tipo: "dias",
  diasTotales: 10,
  diasUsados: 2,
  compradoEn: "2026-06-01T12:00:00.000Z",
  venceEn: "2026-06-30",
  precio: 150_000,
};

/** De 9 a 15, que es media jornada: lo que dura el día de prueba. */
const mediaJornada = (dia: string) => ({
  fecha: dia,
  inicio: en("09:00", dia),
  fin: en("15:00", dia),
});

const DIA: EstadiaJardin = {
  id: "est-1",
  clienteId: "cli-1",
  perroId: "perro-1",
  fecha: LUNES,
  inicioProgramado: en("09:00"),
  finProgramado: en("15:00"),
  origen: "dia_de_prueba",
  estado: "esperada",
  creadaEn: "2026-06-10T12:00:00.000Z",
};

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: LUNES,
    clientes: [],
    perros: [
      {
        id: "perro-1",
        clienteId: "cli-1",
        nombre: "Trufa",
        vacunas: [],
        diaDePrueba: { estado: "agendado", fecha: LUNES },
      },
      {
        id: "perro-2",
        clienteId: "cli-1",
        nombre: "Mora",
        vacunas: [],
        diaDePrueba: { estado: "pendiente" },
      },
    ],
    estadiasJardin: [DIA],
    planes: [PLAN],
    pagos: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
});

describe("agenda local", () => {
  it("no cancela dos veces", async () => {
    await repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO);
    await expect(
      repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(ErrorRepositorio);
  });

  it("no mueve el día a una hora que ya pasó", async () => {
    await expect(
      repo.agenda.reprogramarDiaDePrueba(
        DIA.id,
        { fecha: "2026-06-12", inicio: en("09:00", "2026-06-12"), fin: en("15:00", "2026-06-12") },
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no sirve/);
  });

  it("no acepta un horario que no calza con el día", async () => {
    await expect(
      repo.agenda.reprogramarDiaDePrueba(
        DIA.id,
        { fecha: "2026-06-17", inicio: en("09:00", "2026-06-16"), fin: en("15:00", "2026-06-16") },
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no sirve/);
  });

  it("el día de prueba no se cancela con la regla del jardín", async () => {
    await expect(
      repo.agenda.cancelarDiaDeJardin(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(/su propia pantalla/);
  });

  it("un día de jardín no se cancela con la regla del día de prueba", async () => {
    await repo.estadiasJardin.actualizar(DIA.id, { origen: "dia_suelto" });
    await expect(
      repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(/no es un día de prueba/);
  });
});

describe("agendar el día de prueba", () => {
  it("toma el día, deja el cobro pendiente y al perro agendado", async () => {
    const { estadia, pago, perro } = await repo.agenda.agendarDiaDePrueba(
      "perro-2",
      mediaJornada(MARTES),
      PRUEBA,
      CON_TIEMPO,
    );

    expect(estadia.origen).toBe("dia_de_prueba");
    expect(pago).toMatchObject({
      referenciaId: estadia.id,
      monto: PRECIOS.diaDePrueba,
      estado: "pendiente",
    });
    expect(perro.diaDePrueba).toEqual({ estado: "agendado", fecha: MARTES });
  });

  it("no lo toma un perro que ya lo tiene", async () => {
    await expect(
      repo.agenda.agendarDiaDePrueba("perro-1", mediaJornada(MARTES), PRUEBA, CON_TIEMPO),
    ).rejects.toThrow(/ya tiene su día de prueba/);
  });

  it("es media jornada, no un día completo al precio de la evaluación", async () => {
    await expect(
      repo.agenda.agendarDiaDePrueba(
        "perro-2",
        { fecha: MARTES, inicio: en("07:00", MARTES), fin: en("19:00", MARTES) },
        PRUEBA,
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no sirve/);
  });

  it("si la cotización no calza con el precio, no se agenda", async () => {
    await expect(
      repo.agenda.agendarDiaDePrueba(
        "perro-2",
        mediaJornada(MARTES),
        { ...PRUEBA, total: 0 },
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no calza/);
  });
});

describe("agendar con plan", () => {
  it("crea el día y descuenta uno del pack, juntos", async () => {
    const { estadia, plan } = await repo.agenda.agendarDiaConPlan(
      PLAN.id,
      mediaJornada(MARTES),
      CON_PLAN,
      CON_TIEMPO,
    );

    expect(estadia).toMatchObject({ origen: "plan", planId: PLAN.id, perroId: "perro-2" });
    expect(plan.diasUsados).toBe(PLAN.diasUsados + 1);
  });

  it("los días del plan son de lunes a viernes", async () => {
    await expect(
      repo.agenda.agendarDiaConPlan(PLAN.id, mediaJornada(SABADO), CON_PLAN, CON_TIEMPO),
    ).rejects.toThrow(/lunes a viernes/);
  });

  it("no agenda un día que ya pasó", async () => {
    await expect(
      repo.agenda.agendarDiaConPlan(PLAN.id, mediaJornada("2026-06-12"), CON_PLAN, CON_TIEMPO),
    ).rejects.toThrow(/no sirve/);
  });

  it("no gasta dos días del pack en el mismo día", async () => {
    await repo.agenda.agendarDiaConPlan(PLAN.id, mediaJornada(MARTES), CON_PLAN, CON_TIEMPO);
    await expect(
      repo.agenda.agendarDiaConPlan(PLAN.id, mediaJornada(MARTES), CON_PLAN, CON_TIEMPO),
    ).rejects.toThrow(/ya tiene el día agendado/);
    expect((await repo.planes.obtener(PLAN.id))!.diasUsados).toBe(PLAN.diasUsados + 1);
  });

  it("un plan sin saldo ya no cubre el día", async () => {
    await repo.planes.actualizar(PLAN.id, { diasUsados: PLAN.diasTotales });
    await expect(
      repo.agenda.agendarDiaConPlan(PLAN.id, mediaJornada(MARTES), CON_PLAN, CON_TIEMPO),
    ).rejects.toThrow(/ya no cubre/);
  });
});

describe("comprar un plan", () => {
  it("deja el cobro pendiente y cierra el que estaba vigente", async () => {
    const { plan, pago } = await repo.agenda.comprarPlan(
      "perro-2",
      { tipo: "dias", dias: 12 },
      CON_TIEMPO,
    );

    expect(plan).toMatchObject({ diasTotales: 12, diasUsados: 0, precio: 168_000 });
    expect(pago).toMatchObject({
      concepto: "plan",
      referenciaId: plan.id,
      monto: 168_000,
      estado: "pendiente",
    });
    expect(pago.pagadoEn).toBeUndefined();
    expect((await repo.planes.obtener(PLAN.id))!.cerradoEn).toBe(CON_TIEMPO);
  });
});
