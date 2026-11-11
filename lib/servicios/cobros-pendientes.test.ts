import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { crearCanalSimulado } from "@/lib/integraciones/mensajeria";
import { instanteEnHora } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  Perro,
  ReservaHotel,
  ServicioAgendado,
} from "@/lib/types";
import {
  cobrarHorasDeMas,
  cobrarPendiente,
  cobrarRecargo,
  confirmarServicio,
  serviciosPorConfirmar,
  cobrosPendientesPorCliente,
  diasPorCobrar,
  emitirDiaDeJardin,
  DecisionImposible,
  devolucionesPorTransferir,
  marcarDevolucionTransferida,
  emitirSaldoHotel,
  horasDeMasPorDecidir,
  perdonarHorasDeMas,
  perdonarPendiente,
  perdonarRecargo,
  recargosPorDecidir,
  saldosPorEmitir,
} from "./cobros-pendientes";

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

/** Una jornada ya cerrada, con la hora de salida que se le indique. */
function cerrada(finReal: string, id = "est-001"): EstadiaJardin {
  return {
    id,
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    fecha: DIA,
    inicioProgramado: en("08:00"),
    finProgramado: en("18:00"),
    inicioReal: en("08:00"),
    finReal: en(finReal),
    origen: "dia_suelto",
    estado: "finalizada",
    creadaEn: en("10:00", "2026-06-10"),
  };
}

function reservaCerrada(finReal: string): ReservaHotel {
  return {
    id: "res-001",
    clienteId: CLIENTE.id,
    perroId: PELUSA.id,
    inicioProgramado: en("10:00", "2026-06-14"),
    finProgramado: en("10:00", "2026-06-16"),
    inicioReal: en("10:00", "2026-06-14"),
    finReal: en(finReal, "2026-06-16"),
    paseosContratados: 0,
    estado: "finalizada",
    cotizacion: {
      lineas: [{ concepto: "Alojamiento", monto: 48_000 }],
      subtotal: 48_000,
      descuentos: [],
      total: 48_000,
      abono: 24_000,
    },
    abonoPagado: true,
    creadaEn: en("10:00", "2026-06-01"),
  };
}

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

beforeEach(() => montar({ estadiasJardin: [cerrada("21:30")] }));

describe("el recargo fuera de horario espera una decisión", () => {
  it("aparece en la cola con la hora del retiro y su monto", async () => {
    // Día suelto retirado a las 21:30: el cargo fijo de después de las 21:00.
    const cola = await recargosPorDecidir(repo);
    expect(cola).toHaveLength(1);
    expect(cola[0].detalle).toBe("retiro 21:30");
    expect(cola[0].monto).toBe(5_000);
  });

  it("con plan, entre las 19:00 y las 21:00 se cobra por media hora", async () => {
    // 20:10 son 70 minutos: tres medias horas iniciadas.
    montar({ estadiasJardin: [{ ...cerrada("20:10"), origen: "plan" }] });
    const [recargo] = await recargosPorDecidir(repo);
    expect(recargo.monto).toBe(1_500);
  });

  it("con plan y después de las 21:00, se suman los $5.000", async () => {
    // Las dos horas completas entre las 19 y las 21 (4 × $500) y el cargo.
    montar({ estadiasJardin: [{ ...cerrada("21:10"), origen: "plan" }] });
    const [recargo] = await recargosPorDecidir(repo);
    expect(recargo.monto).toBe(2_000 + 5_000);
  });

  it("un retiro a la hora no aparece", async () => {
    montar({ estadiasJardin: [cerrada("17:30")] });
    expect(await recargosPorDecidir(repo)).toEqual([]);
  });

  it("un día suelto retirado antes de las 21:00 no tiene recargo", async () => {
    montar({ estadiasJardin: [cerrada("20:30")] });
    expect(await recargosPorDecidir(repo)).toEqual([]);
  });

  it("una jornada todavía abierta no se decide", async () => {
    montar({
      estadiasJardin: [{ ...cerrada("21:30"), estado: "presente", finReal: undefined }],
    });
    expect(await recargosPorDecidir(repo)).toEqual([]);
  });
});

describe("cobrarlo", () => {
  it("emite el recargo pendiente y lo saca de la cola", async () => {
    const pago = await cobrarRecargo(repo, "est-001", en("22:00"));

    expect(pago.concepto).toBe("recargo_jardin");
    expect(pago.monto).toBe(5_000);
    expect(pago.estado).toBe("pendiente");
    expect(await recargosPorDecidir(repo)).toEqual([]);
  });

  it("no se puede cobrar dos veces el mismo retiro", async () => {
    await cobrarRecargo(repo, "est-001", en("22:00"));
    await expect(cobrarRecargo(repo, "est-001", en("22:05"))).rejects.toThrow(
      DecisionImposible,
    );
  });

  it("no cobra un retiro que no tiene recargo", async () => {
    montar({ estadiasJardin: [cerrada("17:30")] });
    await expect(cobrarRecargo(repo, "est-001")).rejects.toThrow(
      DecisionImposible,
    );
  });
});

describe("perdonarlo", () => {
  it("deja rastro en vez de desaparecer", async () => {
    // Un cobro que se borra no deja cómo explicar, el día 1, por qué ese
    // retiro tarde no se cobró.
    const pago = await perdonarRecargo(repo, "est-001", en("22:00"));

    expect(pago.monto).toBe(0);
    expect(pago.estado).toBe("reembolsado");
    expect(await repo.pagos.listar()).toHaveLength(1);
  });

  it("lo saca de la cola: perdonado es decidido", async () => {
    await perdonarRecargo(repo, "est-001", en("22:00"));
    expect(await recargosPorDecidir(repo)).toEqual([]);
  });

  it("no suma nada por cobrar", async () => {
    await perdonarRecargo(repo, "est-001", en("22:00"));
    expect(await repo.pagos.porCobrar()).toEqual([]);
  });

  it("perdonado no se puede volver a cobrar", async () => {
    await perdonarRecargo(repo, "est-001", en("22:00"));
    await expect(cobrarRecargo(repo, "est-001")).rejects.toThrow(
      DecisionImposible,
    );
  });
});

/* ── Se quedó más de lo que reservó ──────────────────────────────── */

describe("las horas de más esperan una decisión", () => {
  /**
   * Reservó de 9:00 a 12:00 (menos de 4 h, $10.000), pagó al agendar, y lo
   * vinieron a buscar a las 18:00: estuvo casi 9 horas, que son $18.000.
   */
  function seQuedoMas(cobrado = 10_000, emitidoEn = en("10:00", "2026-06-10")) {
    montar({
      estadiasJardin: [
        {
          ...cerrada("18:00"),
          inicioProgramado: en("09:00"),
          finProgramado: en("12:00"),
          inicioReal: en("09:10"),
        },
      ],
      pagos: [
        {
          id: "pago-dia",
          clienteId: CLIENTE.id,
          concepto: "dia_suelto",
          referenciaId: "est-001",
          monto: cobrado,
          estado: "pagado",
          emitidoEn,
          pagadoEn: emitidoEn,
        },
      ],
    });
  }

  it("aparece con lo que reservó, lo que estuvo y la diferencia", async () => {
    seQuedoMas();
    const [decision] = await horasDeMasPorDecidir(repo);
    expect(decision.monto).toBe(18_000 - 10_000);
    expect(decision.detalle).toBe("Reservó 09:00 a 12:00 · estuvo 09:10 a 18:00");
  });

  it("respeta el descuento que ya tenía: se cobra en la misma proporción", async () => {
    // Segundo perro: pagó $8.000 por el tramo de $10.000, así que la
    // diferencia también va con su 20%.
    seQuedoMas(8_000);
    const [decision] = await horasDeMasPorDecidir(repo);
    expect(decision.monto).toBe(6_400);
  });

  it("un ingreso sin reserva no tiene horas de más: se cobró con las reales", async () => {
    // El cobro nació después de que llegó: es el día que se emitió con la
    // hora de verdad, y mirarlo acá lo cobraría dos veces.
    seQuedoMas(18_000, en("18:30"));
    expect(await horasDeMasPorDecidir(repo)).toEqual([]);
  });

  it("si se quedó dentro del mismo tramo no hay nada que decidir", async () => {
    montar({
      estadiasJardin: [
        { ...cerrada("12:30"), inicioProgramado: en("09:00"), finProgramado: en("12:00"), inicioReal: en("09:00") },
      ],
      pagos: [
        {
          id: "pago-dia",
          clienteId: CLIENTE.id,
          concepto: "dia_suelto",
          referenciaId: "est-001",
          monto: 10_000,
          estado: "pendiente",
          emitidoEn: en("10:00", "2026-06-10"),
        },
      ],
    });
    expect(await horasDeMasPorDecidir(repo)).toEqual([]);
  });

  it("cobrarlo emite la diferencia y lo saca de la cola", async () => {
    seQuedoMas();
    const pago = await cobrarHorasDeMas(repo, "est-001", en("19:00"));
    expect(pago.concepto).toBe("horas_de_mas");
    expect(pago.monto).toBe(8_000);
    expect(pago.estado).toBe("pendiente");
    expect(await horasDeMasPorDecidir(repo)).toEqual([]);
  });

  it("perdonarlo deja rastro en cero", async () => {
    seQuedoMas();
    const pago = await perdonarHorasDeMas(repo, "est-001", en("19:00"));
    expect(pago.monto).toBe(0);
    expect(pago.estado).toBe("reembolsado");
    expect(await horasDeMasPorDecidir(repo)).toEqual([]);
  });

  it("aparece en la tarjeta del dueño, y Perdonar sirve igual que en el recargo", async () => {
    seQuedoMas();
    const [grupo] = await cobrosPendientesPorCliente(repo);
    const pendiente = grupo.pendientes.find((p) => p.tipo === "horas_de_mas");
    expect(pendiente?.monto).toBe(8_000);
    expect(pendiente?.detalle).toContain("Reservó 09:00 a 12:00");

    await perdonarPendiente(repo, pendiente!, en("19:00"));
    expect(await cobrosPendientesPorCliente(repo)).toEqual([]);
  });

  it("un saldo de hotel no se perdona: es una deuda, no una decisión", async () => {
    montar({ estadiasJardin: [], reservasHotel: [reservaCerrada("10:00")] });
    const [grupo] = await cobrosPendientesPorCliente(repo);
    await expect(
      perdonarPendiente(repo, grupo.pendientes[0], en("11:00")),
    ).rejects.toThrow(DecisionImposible);
  });
});

describe("el saldo de hotel se emite, no se decide", () => {
  beforeEach(() =>
    montar({ estadiasJardin: [], reservasHotel: [reservaCerrada("10:00")] }),
  );

  it("queda calculado contra el abono ya pagado", async () => {
    const cola = await saldosPorEmitir(repo);
    expect(cola).toHaveLength(1);
    // 48.000 de dos noches menos los 24.000 del abono.
    expect(cola[0].saldo).toBe(24_000);
  });

  it("emitido sale de la cola", async () => {
    const pago = await emitirSaldoHotel(repo, "res-001", en("11:00"));
    expect(pago.concepto).toBe("saldo_hotel");
    expect(pago.monto).toBe(24_000);
    expect(await saldosPorEmitir(repo)).toEqual([]);
  });

  it("no se emite dos veces", async () => {
    await emitirSaldoHotel(repo, "res-001", en("11:00"));
    await expect(emitirSaldoHotel(repo, "res-001")).rejects.toThrow(
      DecisionImposible,
    );
  });

  it("una salida tarde sube el saldo, sin pedirle permiso a nadie", async () => {
    // A diferencia del jardín, acá no hay decisión: el hotel se paga según
    // la salida real y pasada la tolerancia corre la hora extra.
    montar({ estadiasJardin: [], reservasHotel: [reservaCerrada("16:00")] });
    const [{ saldo }] = await saldosPorEmitir(repo);
    expect(saldo).toBeGreaterThan(24_000);
  });
});

describe("el día que nadie alcanzó a pagar por adelantado", () => {
  it("un ingreso no planificado queda esperando que lo emitan", async () => {
    montar({
      estadiasJardin: [
        { ...cerrada("17:30"), cotizacion: { lineas: [], subtotal: 16_000, descuentos: [], total: 16_000 } },
      ],
    });

    const [dia] = await diasPorCobrar(repo);
    expect(dia.monto).toBe(16_000);

    const pago = await emitirDiaDeJardin(repo, "est-001", en("18:00"));
    expect(pago.concepto).toBe("dia_suelto");
    expect(pago.monto).toBe(16_000);
    expect(await diasPorCobrar(repo)).toEqual([]);
  });

  it("un día reservado desde el portal no aparece: ya venía cobrado", async () => {
    montar({
      estadiasJardin: [
        { ...cerrada("17:30"), cotizacion: { lineas: [], subtotal: 16_000, descuentos: [], total: 16_000 } },
      ],
      pagos: [
        {
          id: "pago-1",
          clienteId: CLIENTE.id,
          concepto: "dia_suelto",
          referenciaId: "est-001",
          monto: 16_000,
          estado: "pendiente",
          emitidoEn: en("09:00"),
        },
      ],
    });
    expect(await diasPorCobrar(repo)).toEqual([]);
  });

  it("un día con plan tampoco: el pack ya lo pagó", async () => {
    montar({ estadiasJardin: [{ ...cerrada("17:30"), origen: "plan" }] });
    expect(await diasPorCobrar(repo)).toEqual([]);
  });
});

describe("agrupado por dueño", () => {
  const OTRO_PERRO: Perro = { ...PELUSA, id: "perro-002", nombre: "Rocco" };
  const OTRO_CLIENTE: Cliente = {
    ...CLIENTE,
    id: "cli-002",
    nombre: "Mariana",
    apellido: "Vera",
  };
  const PERRO_AJENO: Perro = {
    ...PELUSA,
    id: "perro-003",
    nombre: "Kira",
    clienteId: OTRO_CLIENTE.id,
  };

  it("junta los dos perros de un mismo dueño en una sola fila", async () => {
    // Dos perros de Javiera salieron tarde el mismo día. Eso es una
    // conversación con Javiera, no dos.
    montar({
      perros: [PELUSA, OTRO_PERRO],
      estadiasJardin: [
        cerrada("21:30", "est-001"),
        { ...cerrada("20:30", "est-002"), perroId: OTRO_PERRO.id, origen: "plan" },
      ],
    });

    const grupos = await cobrosPendientesPorCliente(repo);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].cliente.nombre).toBe("Javiera");
    expect(grupos[0].pendientes).toHaveLength(2);
    expect(grupos[0].total).toBe(5_000 + 1_500);
  });

  it("no mezcla dueños distintos", async () => {
    montar({
      clientes: [CLIENTE, OTRO_CLIENTE],
      perros: [PELUSA, PERRO_AJENO],
      estadiasJardin: [
        cerrada("21:30", "est-001"),
        { ...cerrada("21:30", "est-002"), perroId: PERRO_AJENO.id, clienteId: OTRO_CLIENTE.id },
      ],
    });

    const grupos = await cobrosPendientesPorCliente(repo);
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.pendientes.length)).toEqual([1, 1]);
  });

  it("junta tipos distintos del mismo dueño", async () => {
    montar({
      estadiasJardin: [cerrada("21:30")],
      reservasHotel: [reservaCerrada("10:00")],
    });

    const [grupo] = await cobrosPendientesPorCliente(repo);
    expect(grupo.pendientes.map((p) => p.tipo).sort()).toEqual([
      "recargo",
      "saldo_hotel",
    ]);
    expect(grupo.total).toBe(5_000 + 24_000);
  });

  it("ordena por lo que lleva más tiempo esperando", async () => {
    // Lo que se añeja es lo que se termina no cobrando.
    montar({
      clientes: [CLIENTE, OTRO_CLIENTE],
      perros: [PELUSA, PERRO_AJENO],
      estadiasJardin: [
        { ...cerrada("21:30", "est-001"), fecha: "2026-06-20" },
        {
          ...cerrada("21:30", "est-002"),
          fecha: "2026-06-10",
          perroId: PERRO_AJENO.id,
          clienteId: OTRO_CLIENTE.id,
        },
      ],
    });

    const grupos = await cobrosPendientesPorCliente(repo);
    expect(grupos.map((g) => g.cliente.nombre)).toEqual(["Mariana", "Javiera"]);
  });

  it("cobrarPendiente resuelve cualquiera de los tres tipos", async () => {
    montar({
      estadiasJardin: [cerrada("21:30")],
      reservasHotel: [reservaCerrada("10:00")],
    });

    const [grupo] = await cobrosPendientesPorCliente(repo);
    for (const pendiente of grupo.pendientes) {
      await cobrarPendiente(repo, pendiente, en("22:00"));
    }
    expect(await cobrosPendientesPorCliente(repo)).toEqual([]);
    expect((await repo.pagos.listar()).map((p) => p.concepto).sort()).toEqual([
      "recargo_jardin",
      "saldo_hotel",
    ]);
  });
});

describe("las devoluciones que todavía no salen", () => {
  const PAGO_REEMBOLSADO = {
    id: "pago-dev",
    clienteId: CLIENTE.id,
    concepto: "dia_suelto" as const,
    referenciaId: "est-001",
    monto: 18_000,
    estado: "reembolsado" as const,
    emitidoEn: en("09:00"),
  };

  it("aparece la plata que entró y tiene que salir", async () => {
    montar({ estadiasJardin: [], pagos: [PAGO_REEMBOLSADO] });
    const [devolucion] = await devolucionesPorTransferir(repo);
    expect(devolucion.pago.monto).toBe(18_000);
    expect(devolucion.cliente.nombre).toBe("Javiera");
  });

  it("un reembolso en cero NO aparece: nunca alcanzó a pagar", async () => {
    // Ese es el caso del cobro pendiente que se anuló. Anularlo ya fue la
    // devolución; no hay plata que mover y mostrarlo haría buscar una
    // transferencia que no existe.
    montar({
      estadiasJardin: [],
      pagos: [{ ...PAGO_REEMBOLSADO, monto: 0 }],
    });
    expect(await devolucionesPorTransferir(repo)).toEqual([]);
  });

  it("lleva la cuenta del cliente para poder transferirle", async () => {
    montar({
      estadiasJardin: [],
      clientes: [
        {
          ...CLIENTE,
          datosBancarios: {
            titular: "Javiera Soto",
            rut: "11.111.111-1",
            banco: "Banco de Chile",
            tipoDeCuenta: "Cuenta corriente",
            numero: "00012345678",
          },
        },
      ],
      pagos: [PAGO_REEMBOLSADO],
    });
    const [devolucion] = await devolucionesPorTransferir(repo);
    expect(devolucion.cuenta?.numero).toBe("00012345678");
  });

  it("marcada como transferida sale de la lista", async () => {
    montar({ estadiasJardin: [], pagos: [PAGO_REEMBOLSADO] });
    await marcarDevolucionTransferida(repo, "pago-dev", en("12:00"));

    expect(await devolucionesPorTransferir(repo)).toEqual([]);
    expect((await repo.pagos.obtener("pago-dev"))!.devolucionTransferidaEn)
      .toBe(en("12:00"));
  });

  it("no se transfiere dos veces", async () => {
    montar({ estadiasJardin: [], pagos: [PAGO_REEMBOLSADO] });
    await marcarDevolucionTransferida(repo, "pago-dev", en("12:00"));
    await expect(
      marcarDevolucionTransferida(repo, "pago-dev"),
    ).rejects.toThrow(DecisionImposible);
  });
});

describe("avisarle al dueño del cobro que no pidió", () => {
  beforeEach(() => montar({ estadiasJardin: [cerrada("21:30")] }));

  it("sin canal cobra igual: un mensaje que no sale no frena un cobro", async () => {
    const [grupo] = await cobrosPendientesPorCliente(repo);
    await cobrarPendiente(repo, grupo.pendientes[0], en("22:00"));

    expect(await repo.pagos.listar()).toHaveLength(1);
    expect(await repo.mensajes.listar()).toEqual([]);
  });

  it("con canal deja el mensaje en la bandeja, con el monto y el motivo", async () => {
    const [grupo] = await cobrosPendientesPorCliente(repo);
    await cobrarPendiente(
      repo,
      grupo.pendientes[0],
      en("22:00"),
      crearCanalSimulado(),
    );

    const [mensaje] = await repo.mensajes.listar();
    expect(mensaje.plantilla).toBe("cobro_emitido");
    expect(mensaje.vistaPrevia).toContain("retiro fuera de horario");
    expect(mensaje.vistaPrevia).toContain("$5.000");
    expect(mensaje.vistaPrevia).toContain("Javiera");
    // Queda amarrado al cobro: desde la bandeja se puede llegar a él.
    expect(mensaje.referencia).toEqual({
      tipo: "pago",
      id: (await repo.pagos.listar())[0].id,
    });
  });

  it("el saldo de hotel se explica como saldo, no como recargo", async () => {
    montar({ estadiasJardin: [], reservasHotel: [reservaCerrada("10:00")] });
    const [grupo] = await cobrosPendientesPorCliente(repo);
    await cobrarPendiente(
      repo,
      grupo.pendientes[0],
      en("11:00"),
      crearCanalSimulado(),
    );

    const [mensaje] = await repo.mensajes.listar();
    expect(mensaje.vistaPrevia).toContain("saldo de la estadía en el hotel");
  });

  it("perdonar no manda nada: no hay cobro que avisar", async () => {
    await perdonarRecargo(repo, "est-001", en("22:00"));
    expect(await repo.mensajes.listar()).toEqual([]);
  });
});


/* ── Los servicios pedidos desde el portal ─────────────────────────── */

describe("servicios por confirmar", () => {
  /** Lo que deja `agendarServicio`: agendado, sin cobro y sin precio firme. */
  function pedido(
    id: string,
    creadoEn: string,
    total = 18_000,
  ): ServicioAgendado {
    return {
      id,
      clienteId: CLIENTE.id,
      perroId: PELUSA.id,
      tipo: "spa",
      fechaHora: en("11:00"),
      nivelSpa: "peloCorto",
      estado: "por_confirmar",
      cotizacion: {
        lineas: [{ concepto: "Baño pelo corto", monto: total }],
        subtotal: total,
        descuentos: [],
        total,
      },
      creadoEn,
    };
  }

  it("lista lo que el dueño pidió y todavía no tiene precio", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    const cola = await serviciosPorConfirmar(repo);

    expect(cola).toHaveLength(1);
    expect(cola[0].cotizado).toBe(18_000);
    expect(cola[0].perro?.nombre).toBe("Pelusa");
    expect(cola[0].cliente?.nombre).toBe("Javiera");
  });

  it("no lista uno que ya tiene su valor confirmado", async () => {
    montar({
      servicios: [
        { ...pedido("srv-1", en("09:00", "2026-06-12")), estado: "agendado" },
      ],
    });

    expect(await serviciosPorConfirmar(repo)).toEqual([]);
  });

  // Lo que se añeja es lo que se termina no cobrando, y acá además hay
  // alguien esperando que le hablen.
  it("pone primero al que lleva más tiempo esperando", async () => {
    montar({
      servicios: [
        pedido("nuevo", en("09:00", "2026-06-14")),
        pedido("viejo", en("09:00", "2026-06-11")),
      ],
    });

    const cola = await serviciosPorConfirmar(repo);
    expect(cola.map((c) => c.servicio.id)).toEqual(["viejo", "nuevo"]);
  });

  it("confirmar emite el cobro por el valor que fijó la casa", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    const { servicio, pago } = await confirmarServicio(
      repo,
      "srv-1",
      24_000,
      en("12:00"),
    );

    expect(pago.monto).toBe(24_000);
    expect(pago.concepto).toBe("servicio");
    expect(pago.estado).toBe("pendiente");
    expect(pago.referenciaId).toBe("srv-1");
    expect(servicio.estado).toBe("agendado");

    // Y sale de la cola: ya se decidió.
    expect(await serviciosPorConfirmar(repo)).toEqual([]);
  });

  // La cotización es lo que el dueño VIO, y por eso quedó guardada. El
  // valor final vive en el cobro, igual que el saldo del hotel.
  it("no reescribe la cotización que vio el dueño", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    const { servicio } = await confirmarServicio(repo, "srv-1", 24_000, en("12:00"));

    expect(servicio.cotizacion.total).toBe(18_000);
  });

  it("confirmar dos veces no cobra dos veces", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });
    await confirmarServicio(repo, "srv-1", 24_000, en("12:00"));

    await expect(
      confirmarServicio(repo, "srv-1", 24_000, en("12:30")),
    ).rejects.toBeInstanceOf(DecisionImposible);

    const pagos = await repo.pagos.listar();
    expect(pagos.filter((p) => p.referenciaId === "srv-1")).toHaveLength(1);
  });

  it("rechaza un monto que no es un monto", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    await expect(
      confirmarServicio(repo, "srv-1", Number.NaN, en("12:00")),
    ).rejects.toBeInstanceOf(DecisionImposible);
    await expect(
      confirmarServicio(repo, "srv-1", -1_000, en("12:00")),
    ).rejects.toBeInstanceOf(DecisionImposible);
  });

  // Emitir un cobro es avisarlo: el dueño no estuvo cuando se fijó el precio.
  it("avisa al dueño por el canal configurado", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    await confirmarServicio(
      repo,
      "srv-1",
      24_000,
      en("12:00"),
      crearCanalSimulado(),
    );

    const mensajes = await repo.mensajes.listar();
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].clienteId).toBe(CLIENTE.id);
  });

  it("sin canal el cobro se emite igual", async () => {
    montar({ servicios: [pedido("srv-1", en("09:00", "2026-06-12"))] });

    const { pago } = await confirmarServicio(repo, "srv-1", 24_000, en("12:00"));

    expect(pago.monto).toBe(24_000);
    expect(await repo.mensajes.listar()).toEqual([]);
  });
});
