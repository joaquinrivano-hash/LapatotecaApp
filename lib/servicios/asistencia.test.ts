import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  OrigenEstadia,
  Perro,
  PlanComprado,
  ReservaHotel,
} from "@/lib/types";
import {
  cargarDiaDeStaff,
  deshacerLlegadaJardin,
  registrarLlegadaHotel,
  registrarLlegadaJardin,
  registrarSalidaHotel,
  registrarSalidaJardin,
} from "./asistencia";

const DIA = "2026-06-15";
const en = (hora: string, dia = DIA) => instanteEnHora(dia, hora);

const CLIENTE: Cliente = {
  id: "cli-001",
  nombre: "Javiera",
  apellido: "Soto",
  email: "javiera@correo.cl",
  telefono: "+569 1111 1111",
  comuna: "Providencia",
  creadoEn: en("10:00", "2026-01-01"),
};

const PELUSA: Perro = {
  id: "perro-001",
  clienteId: CLIENTE.id,
  nombre: "Pelusa",
  raza: "Quiltro",
  pesoKg: 12,
  sexo: "hembra",
  esterilizado: true,
  vacunas: [],
  diaDePrueba: { estado: "aprobado" },
  creadoEn: en("10:00", "2026-01-01"),
};

function estadia(origen: OrigenEstadia = "dia_suelto"): EstadiaJardin {
  return {
    id: "est-001",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    fecha: DIA,
    inicioProgramado: en("08:00"),
    finProgramado: en("18:00"),
    origen,
    planId: origen === "plan" ? "plan-001" : undefined,
    estado: "esperada",
    creadaEn: en("10:00", "2026-06-10"),
  };
}

const PLAN: PlanComprado = {
  id: "plan-001",
  clienteId: CLIENTE.id,
  perroId: PELUSA.id,
  tipo: "p20",
  diasTotales: 20,
  diasUsados: 3,
  compradoEn: en("10:00", "2026-06-01"),
  venceEn: "2026-07-16",
  precio: 200_000,
};

const RESERVA: ReservaHotel = {
  id: "res-001",
  clienteId: CLIENTE.id,
  perroId: PELUSA.id,
  inicioProgramado: en("10:00", "2026-06-14"),
  finProgramado: en("10:00", "2026-06-16"),
  paseosContratados: 0,
  estado: "confirmada",
  cotizacion: {
    lineas: [{ concepto: "Alojamiento", monto: 48_000 }],
    subtotal: 48_000,
    descuentos: [],
    total: 48_000,
    abono: 14_400,
  },
  abonoPagado: true,
  creadaEn: en("10:00", "2026-06-01"),
};

let repo: RepositorioPatoteca;

function montar(datos: Partial<DatosPatoteca>) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: DIA,
    clientes: [CLIENTE],
    perros: [PELUSA],
    ...datos,
  } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

beforeEach(() => montar({ estadiasJardin: [estadia()] }));

describe("check-in de jardín", () => {
  it("registra la hora real de llegada", async () => {
    const resultado = await registrarLlegadaJardin(repo, "est-001", en("08:12"));
    expect(resultado.estado).toBe("presente");
    expect(resultado.inicioReal).toBe(en("08:12"));
  });

  it("se puede deshacer si fue por error", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("08:12"));
    const vuelta = await deshacerLlegadaJardin(repo, "est-001");
    expect(vuelta.estado).toBe("esperada");
    expect(vuelta.inicioReal).toBeUndefined();
  });
});

describe("check-out de jardín", () => {
  it("cobra la jornada larga y la deja pendiente", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    const { estadia: cerrada, recargo, pago } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("17:30"),
    );

    expect(cerrada.estado).toBe("finalizada");
    expect(cerrada.finReal).toBe(en("17:30"));
    expect(cerrada.cotizacion?.total).toBe(18_000);
    expect(recargo).toBe(0);
    expect(pago?.monto).toBe(18_000);
    expect(pago?.estado).toBe("pendiente");
  });

  it("la jornada corta cobra el tramo barato", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("09:00"));
    const { estadia: cerrada } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("14:30"),
    );
    expect(cerrada.cotizacion?.total).toBe(10_000);
  });

  it("el retiro tarde suma el recargo, calculado desde la hora real", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    const { recargo, horasFueraDeHorario, pago } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("20:30"),
    );

    expect(horasFueraDeHorario).toBe(2);
    expect(recargo).toBe(2_000);
    expect(pago?.monto).toBe(20_000);
  });

  it("los 15 minutos de gracia no se cobran", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    const { recargo } = await registrarSalidaJardin(repo, "est-001", en("19:10"));
    expect(recargo).toBe(0);
  });

  it("con plan no cobra la jornada", async () => {
    montar({ estadiasJardin: [estadia("plan")], planes: [PLAN] });
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    const { pago } = await registrarSalidaJardin(repo, "est-001", en("17:30"));

    expect(pago).toBeNull();
    expect(await repo.pagos.listar()).toHaveLength(0);
  });

  it("con plan igual cobra el retiro tarde", async () => {
    montar({ estadiasJardin: [estadia("plan")], planes: [PLAN] });
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    const { pago, recargo } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("20:30"),
    );

    expect(recargo).toBe(2_000);
    expect(pago?.monto).toBe(2_000);
  });

  it("cerrar dos veces corrige el cobro, no lo duplica", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    await registrarSalidaJardin(repo, "est-001", en("17:30"));
    await registrarSalidaJardin(repo, "est-001", en("20:30"));

    const pagos = await repo.pagos.listar();
    expect(pagos).toHaveLength(1);
    expect(pagos[0].monto).toBe(20_000);
  });

  it("el día del plan no se descuenta en el check-in: ya se descontó al agendar", async () => {
    montar({ estadiasJardin: [estadia("plan")], planes: [PLAN] });
    await registrarLlegadaJardin(repo, "est-001", en("08:00"));
    await registrarSalidaJardin(repo, "est-001", en("17:30"));

    expect((await repo.planes.obtener("plan-001"))!.diasUsados).toBe(3);
  });
});

describe("hotel", () => {
  beforeEach(() => montar({ reservasHotel: [RESERVA], estadiasJardin: [] }));

  it("registra la llegada", async () => {
    const reserva = await registrarLlegadaHotel(
      repo,
      "res-001",
      en("10:30", "2026-06-14"),
    );
    expect(reserva.estado).toBe("en_curso");
  });

  it("al salir a tiempo cobra el saldo contra el abono", async () => {
    await registrarLlegadaHotel(repo, "res-001", en("10:00", "2026-06-14"));
    const { saldoPorCobrar, diferencia } = await registrarSalidaHotel(
      repo,
      "res-001",
      en("10:00", "2026-06-16"),
    );

    expect(diferencia).toBe(0);
    expect(saldoPorCobrar).toBe(48_000 - 14_400);
  });

  it("irse tarde recalcula el total con las horas extra", async () => {
    await registrarLlegadaHotel(repo, "res-001", en("10:00", "2026-06-14"));
    const { reserva, diferencia } = await registrarSalidaHotel(
      repo,
      "res-001",
      en("15:00", "2026-06-16"),
    );

    // 2 noches + 5 h de atraso, con 2 h de tolerancia: 3 horas extra.
    expect(reserva.cotizacion.total).toBe(51_000);
    expect(diferencia).toBe(3_000);
  });

  it("irse antes no inventa un cobro negativo", async () => {
    await registrarLlegadaHotel(repo, "res-001", en("10:00", "2026-06-14"));
    const { saldoPorCobrar } = await registrarSalidaHotel(
      repo,
      "res-001",
      en("10:00", "2026-06-15"),
    );
    expect(saldoPorCobrar).toBeGreaterThanOrEqual(0);
  });
});

describe("cargarDiaDeStaff", () => {
  it("separa esperados de presentes", async () => {
    montar({
      estadiasJardin: [
        estadia(),
        { ...estadia(), id: "est-002", estado: "presente", inicioReal: en("08:05") },
      ],
      reservasHotel: [RESERVA],
    });

    const dia = await cargarDiaDeStaff(repo, DIA);
    expect(dia.esperados).toBe(2); // una estadía esperada + la reserva confirmada
    expect(dia.presentes).toBe(1);
  });

  it("calcula la ocupación con hotel y jardín juntos", async () => {
    montar({
      estadiasJardin: [{ ...estadia(), estado: "presente" }],
      reservasHotel: [{ ...RESERVA, estado: "en_curso" }],
    });

    const dia = await cargarDiaDeStaff(repo, DIA);
    expect(dia.capacidad).toBe(25);
    expect(dia.ocupacion.perrosHotel).toBe(1);
    expect(dia.ocupacion.perrosJardin).toBe(1);
    // Mismo perro en las dos líneas: el pico no lo cuenta dos veces por serie,
    // pero sí suma las dos ocupaciones simultáneas.
    expect(dia.ocupacion.pico).toBe(2);
  });
});
