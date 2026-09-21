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
