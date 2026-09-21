import { beforeEach, describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type {
  Cliente,
  EstadiaJardin,
  Perro,
  PlanComprado,
  Producto,
} from "@/lib/types";
import {
  comprarEnTienda,
  comprarPlanDeJardin,
  cotizarDiaJardin,
  cotizarReservaHotel,
  cotizarServicio,
  crearReservaHotel,
  diasConCupo,
  reservarDiaJardin,
  ReservaRechazada,
} from "./reservas";

const LUNES = "2026-06-15";
const en = (hora: string, dia = LUNES) => instanteEnHora(dia, hora);

const CLIENTE: Cliente = {
  id: "cli-001",
  nombre: "Javiera",
  apellido: "Soto",
  email: "j@correo.cl",
  telefono: "+569 1111 1111",
  comuna: "Providencia",
  creadoEn: en("10:00", "2026-01-01"),
};

function perro(sobrescribir: Partial<Perro> = {}): Perro {
  return {
    id: "perro-001",
    clienteId: CLIENTE.id,
    nombre: "Pelusa",
    raza: "Quiltro",
    pesoKg: 12,
    sexo: "hembra",
    esterilizado: true,
    vacunas: NEGOCIO.admision.vacunasObligatorias.map((tipo) => ({
      tipo,
      fechaAplicacion: "2026-01-01",
      fechaVencimiento: "2027-01-01",
    })),
    desparasitadoHasta: "2027-01-01",
    sociable: true,
    diaDePrueba: { estado: "aprobado" },
    creadoEn: en("10:00", "2026-01-01"),
    ...sobrescribir,
  };
}

const PRODUCTO: Producto = {
  id: "prod-001",
  nombre: "Pelota resistente",
  descripcion: "Para mordedores",
  categoria: "juguete",
  precio: 7_990,
  stock: 3,
  activo: true,
};

let repo: RepositorioPatoteca;

function montar(datos: Partial<DatosPatoteca> = {}) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: LUNES,
    clientes: [CLIENTE],
    perros: [perro()],
    ...datos,
  } as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
}

function llenarJardin(cantidad: number, dia = LUNES): EstadiaJardin[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `lleno-${i}`,
    clienteId: "cli-999",
    perroId: `otro-${i}`,
    fecha: dia,
    inicioProgramado: en("07:00", dia),
    finProgramado: en("19:00", dia),
    origen: "dia_suelto" as const,
    estado: "esperada" as const,
    creadaEn: en("10:00", "2026-06-01"),
  }));
}

beforeEach(() => montar());

describe("cotizar hotel", () => {
  it("cobra por noche y calcula el abono del 30%", async () => {
    const c = await cotizarReservaHotel(repo, {
      perroId: "perro-001",
      inicio: en("10:00"),
      fin: en("10:00", "2026-06-18"),
    });

    expect(c.cotizacion.total).toBe(72_000);
    expect(c.abono).toBe(21_600);
    expect(c.sePuede).toBe(true);
  });

  it("aplica el 10% adicional si tiene plan de jardín vigente", async () => {
    const plan: PlanComprado = {
      id: "pl-1",
      clienteId: CLIENTE.id,
      perroId: "perro-001",
      tipo: "dias",
      diasTotales: 10,
      diasUsados: 0,
      compradoEn: en("10:00", "2026-06-01"),
      venceEn: "2026-06-30",
      precio: 150_000,
    };
    montar({ planes: [plan] });

    const c = await cotizarReservaHotel(repo, {
      perroId: "perro-001",
      inicio: en("10:00"),
      fin: en("10:00", "2026-06-18"),
    });

    expect(c.conPlanDeJardin).toBe(true);
    expect(c.cotizacion.total).toBe(64_800);
  });

  it("avisa cuando no cumple admisión", async () => {
    montar({ perros: [perro({ diaDePrueba: { estado: "pendiente" } })] });
    const c = await cotizarReservaHotel(repo, {
      perroId: "perro-001",
      inicio: en("10:00"),
      fin: en("10:00", "2026-06-18"),
    });
    expect(c.sePuede).toBe(false);
    expect(c.admision.problemas.map((p) => p.motivo)).toContain("dia_de_prueba");
  });

  it("avisa cuando no queda cupo", async () => {
    montar({ estadiasJardin: llenarJardin(25) });
    const c = await cotizarReservaHotel(repo, {
      perroId: "perro-001",
      inicio: en("10:00"),
      fin: en("18:00"),
    });
    expect(c.capacidad.hayCupo).toBe(false);
    expect(c.sePuede).toBe(false);
  });
});

describe("crear reserva de hotel", () => {
  it("deja la reserva confirmada y el abono pagado", async () => {
    const { reserva, abono } = await crearReservaHotel(repo, {
      perroId: "perro-001",
      inicio: en("10:00"),
      fin: en("10:00", "2026-06-18"),
    });

    expect(reserva.estado).toBe("confirmada");
    expect(reserva.abonoPagado).toBe(true);
    expect(abono.monto).toBe(21_600);
    expect(abono.estado).toBe("pagado");
    expect(await repo.reservasHotel.listar()).toHaveLength(1);
  });

  it("no crea nada si hay reparos, y dice cuáles", async () => {
    montar({ perros: [perro({ pesoKg: 30 })] });

    await expect(
      crearReservaHotel(repo, {
        perroId: "perro-001",
        inicio: en("10:00"),
        fin: en("10:00", "2026-06-18"),
      }),
    ).rejects.toThrow(ReservaRechazada);

    expect(await repo.reservasHotel.listar()).toHaveLength(0);
    expect(await repo.pagos.listar()).toHaveLength(0);
  });
});

describe("día de jardín", () => {
  it("cotiza la jornada completa como tramo largo", async () => {
    const c = await cotizarDiaJardin(repo, {
      perroId: "perro-001",
      fecha: LUNES,
    });
    expect(c.cotizacion.total).toBe(18_000);
    expect(c.sePuede).toBe(true);
  });

  it("con plan vigente la jornada sale en cero", async () => {
    montar({
      planes: [
        {
          id: "pl-1",
          clienteId: CLIENTE.id,
          perroId: "perro-001",
          tipo: "dias",
          diasTotales: 10,
          diasUsados: 0,
          compradoEn: en("10:00", "2026-06-01"),
          venceEn: "2026-06-30",
          precio: 150_000,
        },
      ],
    });

    const c = await cotizarDiaJardin(repo, {
      perroId: "perro-001",
      fecha: LUNES,
    });
    expect(c.planDisponible).not.toBeNull();
    expect(c.cotizacion.total).toBe(0);
  });

  it("agendar descuenta el día del plan", async () => {
    montar({
      planes: [
        {
          id: "pl-1",
          clienteId: CLIENTE.id,
          perroId: "perro-001",
          tipo: "dias",
          diasTotales: 10,
          diasUsados: 2,
          compradoEn: en("10:00", "2026-06-01"),
          venceEn: "2026-06-30",
          precio: 150_000,
        },
      ],
    });

    const { estadia, planUsado } = await reservarDiaJardin(repo, {
      perroId: "perro-001",
      fecha: LUNES,
    });

    expect(estadia.estado).toBe("esperada");
    expect(estadia.origen).toBe("plan");
    expect(planUsado?.diasUsados).toBe(3);
  });

  it("no deja agendar dos veces el mismo día", async () => {
    await reservarDiaJardin(repo, { perroId: "perro-001", fecha: LUNES });
    await expect(
      reservarDiaJardin(repo, { perroId: "perro-001", fecha: LUNES }),
    ).rejects.toThrow(ReservaRechazada);
  });

  it("el día suelto no se cobra al agendar: se cobra al cerrar la jornada", async () => {
    const { pago } = await reservarDiaJardin(repo, {
      perroId: "perro-001",
      fecha: LUNES,
    });
    expect(pago).toBeNull();
    expect(await repo.pagos.listar()).toHaveLength(0);
  });
});

describe("comprar plan", () => {
  it("cobra el plan por día y lo deja pagado", async () => {
    const { plan, pago } = await comprarPlanDeJardin(
      repo,
      { perroId: "perro-001", tipo: "dias", dias: 12 },
      en("10:00"),
    );

    expect(plan.diasTotales).toBe(12);
    expect(plan.precio).toBe(168_000);
    expect(plan.venceEn).toBe("2026-06-30");
    expect(pago.estado).toBe("pagado");
  });

  it("el pase libre cuesta lo mismo sin importar los días", async () => {
    const { plan } = await comprarPlanDeJardin(
      repo,
      { perroId: "perro-001", tipo: "pase_libre" },
      en("10:00"),
    );
    expect(plan.precio).toBe(220_000);
  });

  it("comprar otro cierra el anterior", async () => {
    await comprarPlanDeJardin(
      repo,
      { perroId: "perro-001", tipo: "dias", dias: 5 },
      en("10:00"),
    );
    await comprarPlanDeJardin(
      repo,
      { perroId: "perro-001", tipo: "dias", dias: 20 },
      en("11:00"),
    );

    const planes = await repo.planes.listar();
    expect(planes).toHaveLength(2);
    expect(planes.filter((p) => !p.cerradoEn)).toHaveLength(1);
  });

  it("un perro sin día de prueba no puede comprar plan", async () => {
    montar({ perros: [perro({ diaDePrueba: { estado: "pendiente" } })] });
    await expect(
      comprarPlanDeJardin(repo, { perroId: "perro-001", tipo: "dias", dias: 5 }),
    ).rejects.toThrow(ReservaRechazada);
  });
});

describe("servicios spot", () => {
  it("el baño express no lleva descuento aunque el cliente sea activo", async () => {
    montar({ estadiasJardin: [] });
    const c = await cotizarServicio(repo, {
      perroId: "perro-001",
      fechaHora: en("11:00"),
      tipo: "spa",
      nivelSpa: "express",
    });
    expect(c.total).toBe(18_000);
  });

  it("el traslado usa la matriz de tramo y horario", async () => {
    const normal = await cotizarServicio(repo, {
      perroId: "perro-001",
      fechaHora: en("13:00"),
      tipo: "traslado",
      km: 8,
    });
    const punta = await cotizarServicio(repo, {
      perroId: "perro-001",
      fechaHora: en("18:00"),
      tipo: "traslado",
      km: 8,
    });
    expect(normal.total).toBe(12_000);
    expect(punta.total).toBe(15_000);
  });
});

describe("tienda", () => {
  it("cobra la orden y descuenta stock", async () => {
    montar({ productos: [PRODUCTO] });
    const { orden, pago } = await comprarEnTienda(repo, CLIENTE.id, [
      { productoId: "prod-001", cantidad: 2 },
    ]);

    expect(orden.total).toBe(15_980);
    expect(pago.estado).toBe("pagado");
    expect((await repo.productos.obtener("prod-001"))!.stock).toBe(1);
  });

  it("si no alcanza el stock compra lo que hay y lo avisa", async () => {
    montar({ productos: [PRODUCTO] });
    const { orden, ajustados } = await comprarEnTienda(repo, CLIENTE.id, [
      { productoId: "prod-001", cantidad: 10 },
    ]);

    expect(orden.items[0].cantidad).toBe(3);
    expect(ajustados[0]).toContain("quedaban 3");
  });

  it("sin stock de nada, no crea la orden", async () => {
    montar({ productos: [{ ...PRODUCTO, stock: 0 }] });
    await expect(
      comprarEnTienda(repo, CLIENTE.id, [
        { productoId: "prod-001", cantidad: 1 },
      ]),
    ).rejects.toThrow(ReservaRechazada);
    expect(await repo.ordenes.listar()).toHaveLength(0);
  });
});

describe("diasConCupo", () => {
  it("marca en cero los días llenos", async () => {
    montar({ estadiasJardin: llenarJardin(25) });
    const libres = await diasConCupo(repo, LUNES, "2026-06-16");
    expect(libres[LUNES]).toBe(0);
    expect(libres["2026-06-16"]).toBe(25);
  });
});
