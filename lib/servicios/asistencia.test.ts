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
import { NEGOCIO } from "@/lib/config/negocio";
import {
  cargarDiaDeStaff,
  deshacerLlegadaJardin,
  IngresoBloqueado,
  opcionesDeRetiro,
  registrarIngreso,
  revisarIngreso,
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
  tipo: "dias",
  diasTotales: 20,
  diasUsados: 3,
  compradoEn: en("10:00", "2026-06-01"),
  venceEn: "2026-06-30",
  precio: 280_000,
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

  it("bajo 4 horas cobra el tramo barato", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("09:00"));
    const { estadia: cerrada } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("12:30"),
    );
    expect(cerrada.cotizacion?.total).toBe(10_000);
  });

  it("entre 4 y 8 horas cobra el tramo medio", async () => {
    await registrarLlegadaJardin(repo, "est-001", en("09:00"));
    const { estadia: cerrada } = await registrarSalidaJardin(
      repo,
      "est-001",
      en("14:30"),
    );
    expect(cerrada.cotizacion?.total).toBe(16_000);
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

describe("ingreso no planificado", () => {
  const SIN_ESTADIAS = { estadiasJardin: [], reservasHotel: [] };

  function perroAdmisible(sobrescribir: Partial<Perro> = {}): Perro {
    return {
      ...PELUSA,
      vacunas: NEGOCIO.admision.vacunasObligatorias.map((tipo) => ({
        tipo,
        fechaAplicacion: "2026-01-01",
        fechaVencimiento: "2027-01-01",
      })),
      desparasitadoHasta: "2027-01-01",
      sociable: true,
      ...sobrescribir,
    };
  }

  beforeEach(() => {
    montar({ ...SIN_ESTADIAS, perros: [perroAdmisible()] });
  });

  it("registra al perro que llegó sin reserva, ya adentro", async () => {
    const { estadia } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });

    expect(estadia.estado).toBe("presente");
    expect(estadia.inicioReal).toBe(en("10:00"));
    expect(estadia.fecha).toBe(DIA);
    expect(estadia.origen).toBe("dia_suelto");
  });

  it("la jornada termina al cierre si no le dicen otra cosa", async () => {
    const { estadia } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });
    expect(estadia.finProgramado).toBe(en("19:00"));
  });

  it("respeta la hora de retiro que indique el staff", async () => {
    const { estadia } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
      finEstimadoMinutos: 14 * 60,
    });
    expect(estadia.finProgramado).toBe(en("14:00"));
    expect(estadia.cotizacion?.total).toBe(16_000);
  });

  it("usa el plan del perro y le descuenta el día", async () => {
    montar({ ...SIN_ESTADIAS, perros: [perroAdmisible()], planes: [PLAN] });

    const { estadia, planUsado } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });

    expect(estadia.origen).toBe("plan");
    expect(estadia.planId).toBe(PLAN.id);
    expect(estadia.cotizacion?.total).toBe(0);
    expect(planUsado?.diasUsados).toBe(PLAN.diasUsados + 1);
  });

  it("después queda listo para el check-out normal", async () => {
    const { estadia } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });
    const { recargo, pago } = await registrarSalidaJardin(
      repo,
      estadia.id,
      en("20:30"),
    );
    expect(recargo).toBe(2_000);
    expect(pago?.monto).toBe(20_000);
  });

  it("no deja registrar dos veces al mismo perro el mismo día", async () => {
    await registrarIngreso(repo, { perroId: PELUSA.id, ahora: en("10:00") });
    await expect(
      registrarIngreso(repo, { perroId: PELUSA.id, ahora: en("11:00") }),
    ).rejects.toThrow(IngresoBloqueado);
  });

  it("no lo deja pasar si no cumple admisión, pero dice por qué", async () => {
    montar({
      ...SIN_ESTADIAS,
      perros: [perroAdmisible({ diaDePrueba: { estado: "pendiente" } })],
    });

    const revision = await revisarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });
    expect(revision.sinReparos).toBe(false);
    expect(revision.admision.problemas[0].motivo).toBe("dia_de_prueba");

    await expect(
      registrarIngreso(repo, { perroId: PELUSA.id, ahora: en("10:00") }),
    ).rejects.toThrow(IngresoBloqueado);
  });

  it("con reparos igual se puede forzar: el perro ya está en la puerta", async () => {
    montar({
      ...SIN_ESTADIAS,
      perros: [perroAdmisible({ diaDePrueba: { estado: "pendiente" } })],
    });

    const { estadia } = await registrarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
      forzar: true,
    });
    expect(estadia.estado).toBe("presente");
  });

  it("avisa cuando no queda cupo", async () => {
    const llenos: EstadiaJardin[] = Array.from({ length: 25 }, (_, i) => ({
      ...estadia(),
      id: `est-${i}`,
      perroId: `otro-${i}`,
      estado: "presente" as const,
      inicioProgramado: en("08:00"),
      finProgramado: en("18:00"),
    }));
    montar({ estadiasJardin: llenos, perros: [perroAdmisible()] });

    const revision = await revisarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });

    expect(revision.cuposDisponibles).toBe(0);
    expect(revision.capacidad.hayCupo).toBe(false);
    expect(revision.sinReparos).toBe(false);
  });

  it("muestra cuántos cupos quedan de verdad", async () => {
    const algunos: EstadiaJardin[] = Array.from({ length: 10 }, (_, i) => ({
      ...estadia(),
      id: `est-${i}`,
      perroId: `otro-${i}`,
      estado: "presente" as const,
    }));
    montar({ estadiasJardin: algunos, perros: [perroAdmisible()] });

    const revision = await revisarIngreso(repo, {
      perroId: PELUSA.id,
      ahora: en("10:00"),
    });
    expect(revision.cuposDisponibles).toBe(15);
  });

  it("el segundo perro del mismo dueño lleva su descuento", async () => {
    const otroPerro: Perro = { ...perroAdmisible(), id: "perro-002", nombre: "Rocco" };
    montar({
      estadiasJardin: [{ ...estadia(), estado: "presente" }],
      perros: [perroAdmisible(), otroPerro],
    });

    const revision = await revisarIngreso(repo, {
      perroId: "perro-002",
      ahora: en("10:00"),
    });
    expect(revision.cotizacionEstimada.descuentos[0].porcentaje).toBe(0.2);
  });
});

describe("opcionesDeRetiro", () => {
  it("redondea la media jornada a la media hora siguiente", () => {
    // 13:08 + 3 h = 16:08, redondeado a 16:30. Son 3 h 22 min: queda bajo el
    // tramo de 4 h, que es lo que define el precio barato.
    const opciones = opcionesDeRetiro(en("13:08"));
    expect(opciones[0].minutos).toBe(16 * 60 + 30);
    expect(opciones.at(-1)!.minutos).toBe(19 * 60);
  });

  it("la media jornada siempre cae dentro del tramo corto", () => {
    for (const hora of ["07:00", "08:31", "10:15", "11:59", "12:30"]) {
      const [primera] = opcionesDeRetiro(en(hora));
      const minutosDentro = primera.minutos - (Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3)));
      expect(minutosDentro).toBeLessThanOrEqual(
        NEGOCIO.jardin.horasJornadaCorta * 60,
      );
    }
  });

  it("la media jornada nunca pasa del cierre", () => {
    const opciones = opcionesDeRetiro(en("16:00"));
    expect(opciones.every((o) => o.minutos <= 19 * 60)).toBe(true);
  });

  it("no repite la misma hora dos veces", () => {
    const opciones = opcionesDeRetiro(en("17:00"));
    const minutos = opciones.map((o) => o.minutos);
    expect(new Set(minutos).size).toBe(minutos.length);
  });

  it("no ofrece horas que ya pasaron", () => {
    expect(opcionesDeRetiro(en("19:30"))).toHaveLength(0);
  });
});
