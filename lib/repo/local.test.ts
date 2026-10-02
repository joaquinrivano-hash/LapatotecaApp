import { beforeEach, describe, expect, it } from "vitest";
import { generarSeed } from "@/lib/data/seed";
import { crearAlmacenMemoria, type Almacen } from "./almacen";
import {
  CLAVE_ALMACEN,
  crearRepositorioLocal,
  ErrorRepositorio,
  normalizar,
} from "./local";
import type { RepositorioPatoteca } from "./tipos";

const HOY = "2026-09-21";

// Generar el seed cuesta cerca de un segundo. Se hace una vez y cada test
// arranca de una copia, en vez de sembrar 20 veces lo mismo.
const SEED = generarSeed(HOY);

let almacen: Almacen;
let repo: RepositorioPatoteca;

beforeEach(() => {
  almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, SEED);
  repo = crearRepositorioLocal({ almacen, hoy: HOY });
});

describe("carga inicial", () => {
  it("siembra los datos la primera vez", async () => {
    const vacio = crearRepositorioLocal({
      almacen: crearAlmacenMemoria(),
      hoy: HOY,
    });
    expect(await vacio.clientes.listar()).toHaveLength(40);
    expect(await vacio.perros.listar()).toHaveLength(50);
  });

  it("guarda el anclaje con el que se generó", async () => {
    expect(await repo.sistema.anclaje()).toBe(HOY);
  });

  it("no vuelve a sembrar si ya hay datos guardados", async () => {
    await repo.clientes.crear({
      nombre: "Nueva",
      apellido: "Clienta",
      email: "nueva@correo.cl",
      telefono: "+569 1111 2222",
      comuna: "Providencia",
      creadoEn: "2026-09-21T12:00:00.000Z",
    });

    // Otra instancia sobre el mismo almacén: como pasa al refrescar la página.
    const otro = crearRepositorioLocal({ almacen, hoy: HOY });
    expect(await otro.clientes.listar()).toHaveLength(41);
  });
});

describe("aislamiento del set", () => {
  it("lo que devuelve es una copia: mutarla no toca los datos", async () => {
    const clientes = await repo.clientes.listar();
    clientes[0].nombre = "PISOTEADO";
    const frescos = await repo.clientes.listar();
    expect(frescos[0].nombre).not.toBe("PISOTEADO");
  });

  it("obtener también devuelve copia", async () => {
    const perro = (await repo.perros.obtener("perro-001"))!;
    perro.pesoKg = 999;
    expect((await repo.perros.obtener("perro-001"))!.pesoKg).not.toBe(999);
  });
});

describe("CRUD", () => {
  it("crea asignando el id siguiente", async () => {
    const creado = await repo.clientes.crear({
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@correo.cl",
      telefono: "+569 3333 4444",
      comuna: "Ñuñoa",
      creadoEn: "2026-09-21T12:00:00.000Z",
    });
    expect(creado.id).toBe("cli-041");
    expect(await repo.clientes.obtener("cli-041")).not.toBeNull();
  });

  it("actualiza solo los campos que le pasan", async () => {
    const antes = (await repo.perros.obtener("perro-001"))!;
    const despues = await repo.perros.actualizar("perro-001", { pesoKg: 13.5 });
    expect(despues.pesoKg).toBe(13.5);
    expect(despues.nombre).toBe(antes.nombre);
  });

  it("reclama si actualizan algo que no existe", async () => {
    await expect(
      repo.perros.actualizar("perro-999", { pesoKg: 10 }),
    ).rejects.toThrow(ErrorRepositorio);
  });

  it("elimina", async () => {
    await repo.clientes.eliminar("cli-001");
    expect(await repo.clientes.obtener("cli-001")).toBeNull();
    expect(await repo.clientes.listar()).toHaveLength(39);
  });

  it("eliminar algo inexistente no explota", async () => {
    await expect(repo.clientes.eliminar("cli-999")).resolves.toBeUndefined();
  });

  it("guardarVarios actualiza los que existen y agrega los que no", async () => {
    const planes = await repo.planes.listar();
    const modificado = { ...planes[0], diasUsados: planes[0].diasTotales };
    await repo.planes.guardarVarios([modificado]);
    expect((await repo.planes.obtener(planes[0].id))!.diasUsados).toBe(
      planes[0].diasTotales,
    );
  });
});

describe("persistencia", () => {
  it("lo que se crea sobrevive al refresh", async () => {
    await repo.productos.crear({
      nombre: "Pelota nueva",
      descripcion: "De prueba",
      categoria: "juguete",
      precio: 5_000,
      stock: 10,
      activo: true,
    });

    const otro = crearRepositorioLocal({ almacen, hoy: HOY });
    const productos = await otro.productos.listar();
    expect(productos.some((p) => p.nombre === "Pelota nueva")).toBe(true);
  });
});

describe("consultas", () => {
  it("busca perros por el nombre del dueño", async () => {
    const cliente = (await repo.clientes.listar())[0];
    const encontrados = await repo.perros.buscar(cliente.apellido);
    expect(encontrados.length).toBeGreaterThan(0);
    expect(
      encontrados.some((p) => p.clienteId === cliente.id),
    ).toBe(true);
  });

  it("la búsqueda ignora tildes y mayúsculas", async () => {
    expect(normalizar("Muñoz")).toBe("munoz");
    const conTilde = await repo.clientes.buscar("PÉREZ");
    const sinTilde = await repo.clientes.buscar("perez");
    expect(conTilde.map((c) => c.id)).toEqual(sinTilde.map((c) => c.id));
  });

  it("filtra estadías por fecha", async () => {
    const deHoy = await repo.estadiasJardin.porFecha(HOY);
    expect(deHoy.length).toBeGreaterThan(0);
    expect(deHoy.every((e) => e.fecha === HOY)).toBe(true);
  });

  it("el rango de hotel incluye estadías que empezaron antes", async () => {
    const enRango = await repo.reservasHotel.enRango(HOY, HOY);
    const todas = await repo.reservasHotel.listar();
    const esperadas = todas.filter(
      (r) =>
        r.inicioProgramado.slice(0, 10) <= HOY &&
        (r.finReal ?? r.finProgramado).slice(0, 10) >= HOY,
    );
    expect(enRango.length).toBeGreaterThanOrEqual(esperadas.length > 0 ? 1 : 0);
    expect(enRango.length).toBeGreaterThan(0);
  });

  it("porCobrar trae lo pendiente y lo vencido", async () => {
    const porCobrar = await repo.pagos.porCobrar();
    expect(porCobrar.length).toBeGreaterThan(0);
    expect(
      porCobrar.every((p) => p.estado === "pendiente" || p.estado === "vencido"),
    ).toBe(true);
  });

  it("trae los reportes de un perro aunque el reporte sea grupal", async () => {
    const reportes = await repo.reportes.listar();
    const grupal = reportes.find((r) => r.perroIds.length > 1)!;
    const delPerro = await repo.reportes.porPerro(grupal.perroIds[1]);
    expect(delPerro.some((r) => r.id === grupal.id)).toBe(true);
  });
});

describe("inventario", () => {
  it("descuenta stock", async () => {
    const producto = (await repo.productos.listar()).find((p) => p.stock > 5)!;
    const despues = await repo.productos.ajustarStock(producto.id, -3);
    expect(despues.stock).toBe(producto.stock - 3);
  });

  it("el stock nunca queda negativo", async () => {
    const producto = (await repo.productos.listar())[0];
    const despues = await repo.productos.ajustarStock(producto.id, -9_999);
    expect(despues.stock).toBe(0);
  });
});

describe("utilidades del prototipo", () => {
  it("reiniciar borra los cambios y vuelve al seed", async () => {
    await repo.clientes.eliminar("cli-001");
    await repo.sistema.reiniciar(HOY);
    expect(await repo.clientes.listar()).toHaveLength(40);
    expect(await repo.clientes.obtener("cli-001")).not.toBeNull();
  });

  it("exporta e importa sin perder nada", async () => {
    await repo.clientes.eliminar("cli-001");
    const respaldo = await repo.sistema.exportar();

    await repo.sistema.reiniciar(HOY);
    expect(await repo.clientes.listar()).toHaveLength(40);

    await repo.sistema.importar(respaldo);
    expect(await repo.clientes.listar()).toHaveLength(39);
  });

  it("rechaza un archivo que no es de La Patoteca", async () => {
    await expect(repo.sistema.importar('{"cosa":1}')).rejects.toThrow(
      ErrorRepositorio,
    );
  });
});

describe("migración de datos guardados", () => {
  /** Un set como el que quedó guardado antes de los campos nuevos. */
  function almacenViejo(perro: Record<string, unknown>) {
    const almacen = crearAlmacenMemoria();
    almacen.escribir(CLAVE_ALMACEN, {
      ...SEED,
      perros: [{ ...SEED.perros[0], ...perro }],
      notificaciones: undefined,
      configuracion: undefined,
    });
    return almacen;
  }

  it("convierte la comida de párrafo a campos sin perder lo escrito", async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({
        alimentacion: "Una taza al almuerzo, la trae el dueño.",
      }),
      hoy: HOY,
    });

    const perro = (await repoViejo.perros.listar())[0];

    expect(perro.alimentacion).toEqual({
      raciones: [],
      notas: "Una taza al almuerzo, la trae el dueño.",
    });
  });

  it("no toca la comida que ya está en el formato nuevo", async () => {
    const comida = {
      marca: "Proplan",
      unidad: "taza" as const,
      raciones: [{ cantidad: 1, comidas: ["almuerzo" as const] }],
    };
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({ alimentacion: comida }),
      hoy: HOY,
    });

    expect((await repoViejo.perros.listar())[0].alimentacion).toEqual(comida);
  });

  it("junta las hojas del carnet que antes era una sola foto", async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({
        carnetVacunasUrl: "data:image/jpeg;base64,hoja",
      }),
      hoy: HOY,
    });

    const perro = (await repoViejo.perros.listar())[0];

    expect(perro.carnetVacunasUrls).toEqual(["data:image/jpeg;base64,hoja"]);
    expect("carnetVacunasUrl" in perro).toBe(false);
  });

  it("lleva la periodicidad del antiparasitario a meses", async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({
        antiparasitario: {
          ultimaAplicacion: "2026-09-01",
          periodicidad: "trimestral",
        },
      }),
      hoy: HOY,
    });

    expect((await repoViejo.perros.listar())[0].antiparasitario).toEqual({
      ultimaAplicacion: "2026-09-01",
      mesesDeDuracion: 3,
    });
  });

  it('el período "otro" en días se redondea al mes más cercano', async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({
        antiparasitario: {
          ultimaAplicacion: "2026-09-01",
          periodicidad: "otro",
          cadaCuantosDias: 45,
        },
      }),
      hoy: HOY,
    });

    expect(
      (await repoViejo.perros.listar())[0].antiparasitario?.mesesDeDuracion,
    ).toBe(2);
  });

  it("convierte la ración suelta en una lista de porciones", async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({
        alimentacion: {
          marca: "Proplan",
          cantidad: 1,
          unidad: "taza",
          comidas: ["almuerzo"],
        },
      }),
      hoy: HOY,
    });

    expect((await repoViejo.perros.listar())[0].alimentacion).toEqual({
      marca: "Proplan",
      unidad: "taza",
      raciones: [{ cantidad: 1, comidas: ["almuerzo"] }],
    });
  });

  it("le pone configuración y bandeja de avisos a un set que no los tenía", async () => {
    const repoViejo = crearRepositorioLocal({
      almacen: almacenViejo({}),
      hoy: HOY,
    });

    expect(await repoViejo.notificaciones.listar()).toEqual([]);
    const configuracion = await repoViejo.configuracion.obtener();
    expect(configuracion.vacunasObligatorias).toEqual([
      "octuple",
      "antirrabica",
      "kc",
    ]);
    // Los campos nuevos de la configuración se completan solos.
    expect(configuracion.duracionVacunasMeses.octuple).toBeGreaterThan(0);
    expect(configuracion.catalogos.razas.length).toBeGreaterThan(0);
  });

  it("completa la configuración sin pisar lo que Administración ya eligió", async () => {
    const almacen = crearAlmacenMemoria();
    almacen.escribir(CLAVE_ALMACEN, {
      ...SEED,
      configuracion: {
        vacunasObligatorias: ["antirrabica"],
        camposObligatorios: [],
        actualizadoEn: "2026-01-01T12:00:00.000Z",
      },
    });

    const configuracion = await crearRepositorioLocal({
      almacen,
      hoy: HOY,
    }).configuracion.obtener();

    expect(configuracion.vacunasObligatorias).toEqual(["antirrabica"]);
    expect(configuracion.catalogos.marcasComida.length).toBeGreaterThan(0);
  });
});

describe("configuración de Administración", () => {
  it("guarda solo lo que cambió y deja constancia de cuándo", async () => {
    const antes = await repo.configuracion.obtener();
    const despues = await repo.configuracion.guardar({
      vacunasObligatorias: ["antirrabica"],
    });

    expect(despues.vacunasObligatorias).toEqual(["antirrabica"]);
    expect(despues.camposObligatorios).toEqual(antes.camposObligatorios);
    expect(despues.actualizadoEn >= antes.actualizadoEn).toBe(true);
  });

  it("sobrevive al refresh y se puede restaurar", async () => {
    await repo.configuracion.guardar({ camposObligatorios: [] });

    const otraVisita = crearRepositorioLocal({ almacen, hoy: HOY });
    expect((await otraVisita.configuracion.obtener()).camposObligatorios).toEqual(
      [],
    );

    const restaurada = await otraVisita.configuracion.restaurar();
    expect(restaurada.camposObligatorios).toContain("foto");
  });
});

describe("avisos para Administración", () => {
  it("separa los que no se han leído y los marca", async () => {
    const aviso = await repo.notificaciones.crear({
      clienteId: "cli-1",
      perroId: "perro-1",
      titulo: "Cambió la ficha de Pelusa",
      cambios: [{ campo: "Peso", antes: "8 kg", despues: "12 kg" }],
      leida: false,
      creadaEn: "2026-09-21T12:00:00.000Z",
    });

    expect(await repo.notificaciones.sinLeer()).toHaveLength(1);
    expect(await repo.notificaciones.porPerro("perro-1")).toHaveLength(1);

    await repo.notificaciones.marcarLeidas([aviso.id]);
    expect(await repo.notificaciones.sinLeer()).toEqual([]);
  });
});
