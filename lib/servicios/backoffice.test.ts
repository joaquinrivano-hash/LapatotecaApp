import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  Pago,
  Perro,
  PlanComprado,
  ReservaHotel,
  Suscripcion,
} from "@/lib/types";
import { cargarCalendario, cargarDetalleDia } from "./calendario";
import {
  cargarCobranza,
  emitirCuentasDelMes,
  estaVencido,
  marcarPagado,
  periodoAEmitir,
} from "./cobranza";
import { calcularRenovacion, cargarPanel, lineaDePago } from "./panel";

const DIA = "2026-06-15"; // lunes
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

const OTRO: Cliente = { ...CLIENTE, id: "cli-002", nombre: "Matías" };

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

/**
 * `fecha` y los instantes tienen que apuntar al mismo día: la ocupación se
 * calcula con los instantes, así que si se contradicen, el campo `fecha`
 * miente y los números salen mal.
 */
function estadia(sobrescribir: Partial<EstadiaJardin> = {}): EstadiaJardin {
  const fecha = sobrescribir.fecha ?? DIA;
  return {
    id: "est-001",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    fecha,
    inicioProgramado: en("08:00", fecha),
    finProgramado: en("17:00", fecha),
    origen: "dia_suelto",
    estado: "finalizada",
    creadaEn: en("10:00", "2026-06-10"),
    ...sobrescribir,
  };
}

function reserva(sobrescribir: Partial<ReservaHotel> = {}): ReservaHotel {
  return {
    id: "res-001",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    inicioProgramado: en("10:00", "2026-06-14"),
    finProgramado: en("10:00", "2026-06-17"),
    paseosContratados: 0,
    estado: "en_curso",
    cotizacion: { lineas: [], subtotal: 72_000, descuentos: [], total: 72_000, abono: 21_600 },
    abonoPagado: true,
    creadaEn: en("10:00", "2026-06-01"),
    ...sobrescribir,
  };
}

function pago(sobrescribir: Partial<Pago> = {}): Pago {
  return {
    id: "pago-001",
    clienteId: CLIENTE.id,
    concepto: "dia_suelto",
    monto: 18_000,
    estado: "pendiente",
    emitidoEn: en("17:00"),
    ...sobrescribir,
  };
}

let repo: RepositorioPatoteca;

function montar(datos: Partial<DatosPatoteca>) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: DIA,
    clientes: [CLIENTE, OTRO],
    perros: [PELUSA],
    ...datos,
  } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

beforeEach(() => montar({}));

describe("líneas de ingreso", () => {
  it("clasifica cada cobro en su línea", () => {
    expect(lineaDePago(pago({ concepto: "abono_hotel" }))).toBe("hotel");
    expect(lineaDePago(pago({ concepto: "saldo_hotel" }))).toBe("hotel");
    expect(lineaDePago(pago({ concepto: "dia_suelto" }))).toBe("jardin");
    expect(lineaDePago(pago({ concepto: "plan" }))).toBe("jardin");
    expect(lineaDePago(pago({ concepto: "servicio" }))).toBe("servicios");
    expect(lineaDePago(pago({ concepto: "tienda" }))).toBe("tienda");
  });

  it("la cuenta mensual no es una línea: sumarla duplicaría el ingreso", () => {
    expect(lineaDePago(pago({ concepto: "cuenta_mensual" }))).toBeNull();
  });
});

describe("cargarPanel", () => {
  it("mide la ocupación contra el pico, no contra los perros del día", async () => {
    // Seis perros en el día, nunca más de tres juntos: 3/25, no 6/25.
    montar({
      estadiasJardin: [
        ...[0, 1, 2].map((i) =>
          estadia({ id: `m-${i}`, perroId: `p-${i}`, inicioProgramado: en("08:00"), finProgramado: en("12:00") }),
        ),
        ...[0, 1, 2].map((i) =>
          estadia({ id: `t-${i}`, perroId: `q-${i}`, inicioProgramado: en("13:00"), finProgramado: en("17:00") }),
        ),
      ],
    });

    const panel = await cargarPanel(repo, DIA, DIA);
    expect(panel.dias[0].perrosDistintos).toBe(6);
    expect(panel.dias[0].pico).toBe(3);
    expect(panel.dias[0].ocupacion).toBeCloseTo(3 / 25);
  });

  it("el ingreso por cupo divide por los 25, no por los ocupados", async () => {
    montar({ pagos: [pago({ monto: 25_000 })] });
    const panel = await cargarPanel(repo, DIA, DIA);
    expect(panel.dias[0].ingresoPorCupo).toBe(1_000);
    expect(panel.ingresoPorCupoDisponible).toBe(1_000);
  });

  it("reparte el ingreso por línea y calcula la participación", async () => {
    montar({
      pagos: [
        pago({ id: "a", concepto: "abono_hotel", monto: 60_000 }),
        pago({ id: "b", concepto: "dia_suelto", monto: 30_000 }),
        pago({ id: "c", concepto: "servicio", monto: 10_000 }),
      ],
    });

    const panel = await cargarPanel(repo, DIA, DIA);
    expect(panel.ingresoTotal).toBe(100_000);
    const hotel = panel.ingresoPorLinea.find((l) => l.linea === "hotel")!;
    expect(hotel.monto).toBe(60_000);
    expect(hotel.participacion).toBeCloseTo(0.6);
  });

  it("no cuenta la cuenta mensual como ingreso nuevo", async () => {
    montar({
      pagos: [
        pago({ id: "a", concepto: "dia_suelto", monto: 18_000 }),
        pago({ id: "b", concepto: "cuenta_mensual", monto: 18_000 }),
      ],
    });
    const panel = await cargarPanel(repo, DIA, DIA);
    expect(panel.ingresoTotal).toBe(18_000);
  });

  it("separa la ocupación de fin de semana de la de entre semana", async () => {
    montar({
      estadiasJardin: [
        estadia({ id: "lun", fecha: "2026-06-15" }),
        estadia({ id: "sab-1", fecha: "2026-06-20", perroId: "p-1" }),
        estadia({ id: "sab-2", fecha: "2026-06-20", perroId: "p-2" }),
        estadia({ id: "sab-3", fecha: "2026-06-20", perroId: "p-3" }),
      ],
    });

    const panel = await cargarPanel(repo, "2026-06-15", "2026-06-21");
    expect(panel.ocupacionEntreSemana).toBeCloseTo(1 / 25 / 5);
    expect(panel.ocupacionFinDeSemana).toBeCloseTo(3 / 25 / 2);
  });

  it("cuenta los clientes activos con la misma regla que el resto de la app", async () => {
    montar({ estadiasJardin: [estadia()] });
    const panel = await cargarPanel(repo, DIA, DIA);
    expect(panel.totalClientes).toBe(2);
    expect(panel.clientesActivos).toBe(1);
  });
});

describe("calcularRenovacion", () => {
  const base: PlanComprado = {
    id: "pl-1",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    tipo: "dias",
    diasTotales: 5,
    diasUsados: 0,
    compradoEn: en("10:00", "2026-05-01"),
    venceEn: "2026-05-31",
    precio: 75_000,
  };

  it("sin planes en el periodo devuelve cero", () => {
    expect(calcularRenovacion([], DIA, DIA)).toBe(0);
  });

  it("el primer plan de un perro no es renovación", () => {
    const primero = { ...base, compradoEn: en("10:00", DIA) };
    expect(calcularRenovacion([primero], DIA, DIA)).toBe(0);
  });

  it("el segundo plan del mismo perro sí lo es", () => {
    const segundo = { ...base, id: "pl-2", compradoEn: en("10:00", DIA) };
    expect(calcularRenovacion([base, segundo], DIA, DIA)).toBe(1);
  });
});

describe("cargarCalendario", () => {
  it("resume cada día por su pico y sus cupos libres", async () => {
    montar({ estadiasJardin: [estadia()], reservasHotel: [reserva()] });
    const dias = await cargarCalendario(repo, DIA, DIA);

    expect(dias).toHaveLength(1);
    expect(dias[0].ocupacion.pico).toBe(2);
    expect(dias[0].cuposLibres).toBe(23);
  });

  it("marca los fines de semana", async () => {
    const dias = await cargarCalendario(repo, "2026-06-19", "2026-06-21");
    expect(dias.map((d) => d.esFinDeSemana)).toEqual([false, true, true]);
  });

  it("cuenta quién entra y quién sale ese día", async () => {
    montar({ estadiasJardin: [estadia()], reservasHotel: [reserva()] });
    const [dia] = await cargarCalendario(repo, DIA, DIA);
    // La estadía de jardín entra y sale el mismo día; la reserva ni entra ni
    // sale (empezó el 14 y termina el 17).
    expect(dia.entran).toBe(1);
    expect(dia.salen).toBe(1);
  });
});

describe("cargarDetalleDia", () => {
  it("lista los movimientos ordenados por hora de entrada", async () => {
    montar({
      estadiasJardin: [
        estadia({ id: "tarde", inicioProgramado: en("11:00") }),
        estadia({ id: "temprano", inicioProgramado: en("08:00"), perroId: PELUSA.id }),
      ],
    });

    const detalle = await cargarDetalleDia(repo, DIA);
    expect(detalle.movimientos.map((m) => m.id)).toEqual(["temprano", "tarde"]);
  });

  it("no muestra lo cancelado", async () => {
    montar({ estadiasJardin: [estadia({ estado: "cancelada" })] });
    const detalle = await cargarDetalleDia(repo, DIA);
    expect(detalle.movimientos).toHaveLength(0);
  });
});

describe("cobranza", () => {
  it("reconoce lo vencido", () => {
    expect(estaVencido(pago({ venceEn: "2026-06-10" }), DIA)).toBe(true);
    expect(estaVencido(pago({ venceEn: "2026-06-20" }), DIA)).toBe(false);
    expect(estaVencido(pago({ venceEn: "2026-06-10", estado: "pagado" }), DIA)).toBe(false);
  });

  it("agrupa la deuda por cliente, de mayor a menor", async () => {
    montar({
      pagos: [
        pago({ id: "a", monto: 10_000 }),
        pago({ id: "b", monto: 5_000 }),
        pago({ id: "c", clienteId: OTRO.id, monto: 50_000 }),
      ],
    });

    const cobranza = await cargarCobranza(repo, DIA);
    expect(cobranza.total).toBe(65_000);
    expect(cobranza.porCliente[0].cliente.id).toBe(OTRO.id);
    expect(cobranza.porCliente[1].total).toBe(15_000);
  });

  it("ignora lo que ya entró en una cuenta mensual", async () => {
    montar({
      pagos: [
        pago({ id: "a", monto: 10_000 }),
        pago({ id: "b", monto: 90_000, cuentaMensualId: "cuenta-1" }),
      ],
    });
    const cobranza = await cargarCobranza(repo, DIA);
    expect(cobranza.total).toBe(10_000);
  });

  it("marcar pagado deja el método y la fecha", async () => {
    montar({ pagos: [pago()] });
    const pagado = await marcarPagado(repo, "pago-001", "transferencia", en("12:00"));
    expect(pagado.estado).toBe("pagado");
    expect(pagado.metodo).toBe("transferencia");
    expect(pagado.pagadoEn).toBe(en("12:00"));
    expect(await repo.pagos.porCobrar()).toHaveLength(0);
  });
});

describe("emitirCuentasDelMes", () => {
  const suscripcion: Suscripcion = {
    id: "susc-1",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    tipo: "dias",
    diasContratados: 20,
    estado: "activa",
    creadaEn: en("10:00", "2026-01-01"),
    proximoCobro: "2026-07-01",
  };

  it("junta la renovación con los consumos del mes", async () => {
    montar({
      suscripciones: [suscripcion],
      pagos: [pago({ monto: 18_000, emitidoEn: en("17:00", "2026-06-10") })],
    });

    const { cuentas } = await emitirCuentasDelMes(repo, "2026-06");
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].total).toBe(298_000);
    expect(cuentas[0].renovaciones).toHaveLength(1);
    expect(cuentas[0].consumos).toHaveLength(1);
  });

  it("los consumos incluidos dejan de cobrarse por separado", async () => {
    montar({
      suscripciones: [suscripcion],
      pagos: [pago({ monto: 18_000, emitidoEn: en("17:00", "2026-06-10") })],
    });

    await emitirCuentasDelMes(repo, "2026-06");
    const cobranza = await cargarCobranza(repo, "2026-07-02");

    // Queda la cuenta por cobrar, no el día suelto que la compone.
    expect(cobranza.pendientes).toHaveLength(1);
    expect(cobranza.pendientes[0].concepto).toBe("cuenta_mensual");
    expect(cobranza.total).toBe(298_000);
  });

  it("no emite dos veces el mismo periodo", async () => {
    montar({
      suscripciones: [suscripcion],
      pagos: [pago({ monto: 18_000, emitidoEn: en("17:00", "2026-06-10") })],
    });

    await emitirCuentasDelMes(repo, "2026-06");
    const segunda = await emitirCuentasDelMes(repo, "2026-06");

    expect(segunda.yaEstaba).toBe(true);
    expect(segunda.consumosIncluidos).toBe(0);
    expect(await repo.cuentasMensuales.listar()).toHaveLength(1);
  });

  it("no le emite cuenta en cero a quien no tuvo movimientos", async () => {
    montar({ suscripciones: [], pagos: [] });
    const { cuentas } = await emitirCuentasDelMes(repo, "2026-06");
    expect(cuentas).toHaveLength(0);
  });

  it("la fecha de emisión sale del periodo, no del reloj", async () => {
    montar({ suscripciones: [suscripcion], pagos: [] });
    const { cuentas } = await emitirCuentasDelMes(repo, "2026-06");
    expect(cuentas[0].emitidaEn.slice(0, 10)).toBe("2026-07-01");
  });

  it("el periodo a emitir hoy es el mes anterior", () => {
    expect(periodoAEmitir("2026-07-01")).toBe("2026-06");
    expect(periodoAEmitir("2026-01-05")).toBe("2025-12");
  });
});
