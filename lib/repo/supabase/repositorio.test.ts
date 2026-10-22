/**
 * Lo que el repositorio le pide a la base, y lo que hace con la respuesta.
 *
 * Sin red: el cliente es falso y registra la cadena de llamadas. Lo que se
 * verifica acá es todo lo que NO se puede leer de un vistazo —que `crear` no
 * mande id, que la paginación exista, que un rango ancho se recorte después—
 * y que el día que alguien lo "simplifique" el test se caiga.
 *
 * Lo que las políticas dejan pasar es otra prueba, contra un Postgres de
 * verdad: `supabase/pruebas/aislamiento.sh`.
 */

import { describe, expect, it } from "vitest";

import { clienteFalso, filas } from "@/lib/repo/supabase/falso";
import { crearRepositorioSupabase } from "@/lib/repo/supabase/repositorio";
import type { Cotizacion } from "@/lib/types";

const repo = (responder?: Parameters<typeof clienteFalso>[0]) => {
  const falso = clienteFalso(responder);
  return { ...falso, repo: crearRepositorioSupabase(falso.cliente) };
};

describe("crear", () => {
  it("no manda id: la llave primaria la pone la base", async () => {
    const { repo: r, argumentosDe } = repo(() => ({
      data: { id: "uuid-1", nombre: "Javiera" },
    }));

    await r.clientes.crear({
      nombre: "Javiera",
      apellido: "Soto",
      email: "j@x.cl",
      telefono: "+56911111111",
      comuna: "Providencia",
      creadoEn: "2026-09-10T12:00:00.000Z",
    });

    const [fila] = argumentosDe("insert") as [Record<string, unknown>];
    expect(fila).not.toHaveProperty("id");
  });

  it("traduce los campos a columnas", async () => {
    const { repo: r, argumentosDe } = repo(() => ({ data: { id: "uuid-1" } }));

    await r.perros.crear({
      clienteId: "uuid-c",
      nombre: "Pelusa",
      raza: "Quiltro",
      pesoKg: 9,
      sexo: "hembra",
      esterilizado: true,
      vacunas: [],
      diaDePrueba: { estado: "pendiente" },
      creadoEn: "2026-09-10T12:00:00.000Z",
    });

    const [fila] = argumentosDe("insert") as [Record<string, unknown>];
    expect(fila).toMatchObject({
      cliente_id: "uuid-c",
      peso_kg: 9,
      creado_en: "2026-09-10T12:00:00.000Z",
    });
  });

  it("devuelve la fila de la base convertida en entidad", async () => {
    const { repo: r } = repo(() => ({
      data: { id: "uuid-1", cliente_id: "uuid-c", peso_kg: 9, notas: null },
    }));

    const perro = await r.perros.crear({
      clienteId: "uuid-c",
      nombre: "Pelusa",
      raza: "Quiltro",
      pesoKg: 9,
      sexo: "hembra",
      esterilizado: true,
      vacunas: [],
      diaDePrueba: { estado: "pendiente" },
      creadoEn: "2026-09-10T12:00:00.000Z",
    });

    expect(perro.id).toBe("uuid-1");
    expect(perro.clienteId).toBe("uuid-c");
    // El null de la base no se deja pasar: el tipo dice "no está".
    expect(perro).not.toHaveProperty("notas");
  });
});

describe("actualizar", () => {
  // `actualizar(id, { notas: undefined })` es el dueño BORRANDO la nota.
  // Omitir la columna dejaría el valor viejo.
  it("manda null por un campo presente en undefined", async () => {
    const { repo: r, argumentosDe } = repo(() => ({ data: { id: "uuid-1" } }));

    await r.perros.actualizar("uuid-1", { notas: undefined });

    expect(argumentosDe("update")).toEqual([{ notas: null }]);
  });

  it("falla con un mensaje claro si no quedó ninguna fila", async () => {
    const { repo: r } = repo(() => ({ data: null }));

    await expect(r.perros.actualizar("uuid-1", { pesoKg: 10 })).rejects.toThrow(
      /No existe perros con id uuid-1/,
    );
  });
});

describe("obtener", () => {
  // Un id de la forma vieja (`cli-001`, guardado en el navegador antes de la
  // nube) no es un uuid y Postgres lo rechaza. Para la app eso es "no existe".
  it("responde null ante un id que no tiene forma de uuid", async () => {
    const { repo: r } = repo(() => ({
      error: { code: "22P02", message: 'invalid input syntax for type uuid' },
    }));

    await expect(r.clientes.obtener("cli-001")).resolves.toBeNull();
  });

  it("responde null cuando no hay fila", async () => {
    const { repo: r } = repo(() => ({ data: null }));
    await expect(r.clientes.obtener("uuid-9")).resolves.toBeNull();
  });
});

describe("paginación", () => {
  // PostgREST corta en 1.000 filas y NO avisa. Un `listar()` de una sola
  // vuelta perdería registros en silencio el día que el negocio pase ese
  // número, y el tablero mostraría menos plata de la que hay.
  it("sigue pidiendo páginas hasta que llega una incompleta", async () => {
    const pagina = (desde: number, cuantas: number) =>
      Array.from({ length: cuantas }, (_, i) => ({ id: `uuid-${desde + i}` }));

    const { repo: r, todosLos } = repo(({ operaciones }) => {
      const rango = operaciones.find(([n]) => n === "range")?.[1] as number[];
      return filas(...(rango[0] === 0 ? pagina(0, 1000) : pagina(1000, 7)));
    });

    const todos = await r.pagos.listar();

    expect(todos).toHaveLength(1007);
    expect(todosLos("range")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("se detiene en la primera página si vino incompleta", async () => {
    const { repo: r, todosLos } = repo(() => filas({ id: "uuid-1" }));
    await r.pagos.listar();
    expect(todosLos("range")).toHaveLength(1);
  });
});

describe("orden", () => {
  // Sin `order` el orden de Postgres no está definido, y los historiales de
  // la app se muestran en el orden en que vienen.
  it("pide un orden estable, con el id como desempate", async () => {
    const { repo: r, todosLos } = repo(() => filas());
    await r.pagos.listar();
    expect(todosLos("order")).toEqual([
      ["emitido_en", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });
});

describe("buscar", () => {
  // "javiera soto" tiene el nombre en una columna y el apellido en otra, así
  // que una sola condición con el texto completo no encontraría nada.
  // Encadenar `.or()` los junta con AND: cada palabra en cualquier columna.
  it("encadena un or por palabra", async () => {
    const { repo: r, todosLos } = repo(() => filas());

    await r.clientes.buscar("javiera soto");

    const ors = todosLos("or").map(([filtro]) => filtro as string);
    expect(ors).toHaveLength(2);
    expect(ors[0]).toContain("javiera");
    expect(ors[1]).toContain("soto");
    expect(ors[0]).toContain('nombre.ilike."*javiera*"');
    expect(ors[0]).toContain('email.ilike."*javiera*"');
  });

  it("sin texto, lista todo sin filtrar", async () => {
    const { repo: r, todosLos } = repo(() => filas());
    await r.clientes.buscar("   ");
    expect(todosLos("or")).toEqual([]);
  });

  it("busca el perro por su nombre y también por su dueño", async () => {
    const { repo: r, aTabla } = repo(({ tabla }) =>
      tabla === "clientes" ? filas({ id: "uuid-c1" }) : filas(),
    );

    await r.perros.buscar("javiera");

    expect(aTabla("clientes")).toHaveLength(1);
    const [filtro] = aTabla("perros")[0].operaciones.find(
      ([n]) => n === "or",
    )?.[1] as [string];
    expect(filtro).toContain('nombre.ilike."*javiera*"');
    expect(filtro).toContain("cliente_id.in.(uuid-c1)");
  });

  // `cliente_id.in.()` con la lista vacía es sintaxis inválida y la base
  // rechazaría la consulta entera.
  it("omite la condición del dueño si ningún dueño calza", async () => {
    const { repo: r, aTabla } = repo(() => filas());

    await r.perros.buscar("pelusa");

    const [filtro] = aTabla("perros")[0].operaciones.find(
      ([n]) => n === "or",
    )?.[1] as [string];
    expect(filtro).not.toContain("cliente_id.in");
  });
});

describe("reservasHotel.enRango", () => {
  const alMediodia = (dia: string) => `${dia}T15:00:00.000Z`;

  const correr = (data: Record<string, unknown>[]) => {
    const { repo: r } = repo(() => filas(...data));
    return r.reservasHotel.enRango("2026-09-10", "2026-09-12");
  };

  // El día de una estadía sale de `coalesce(real, programado)` y eso un
  // filtro de PostgREST no lo sabe expresar: la base devuelve de más y el
  // traslape exacto se calcula después.
  it("incluye la que se corrió hacia adentro del rango", async () => {
    const encontradas = await correr([
      {
        id: "uuid-1",
        inicio_programado: alMediodia("2026-09-01"),
        fin_programado: alMediodia("2026-09-02"),
        inicio_real: alMediodia("2026-09-11"),
        fin_real: alMediodia("2026-09-11"),
      },
    ]);
    expect(encontradas.map((r) => r.id)).toEqual(["uuid-1"]);
  });

  it("descarta la que se corrió hacia afuera", async () => {
    const encontradas = await correr([
      {
        id: "uuid-2",
        inicio_programado: alMediodia("2026-09-11"),
        fin_programado: alMediodia("2026-09-11"),
        inicio_real: alMediodia("2026-09-01"),
        fin_real: alMediodia("2026-09-02"),
      },
    ]);
    expect(encontradas).toEqual([]);
  });

  it("usa lo programado cuando todavía no hay horas reales", async () => {
    const encontradas = await correr([
      {
        id: "uuid-3",
        inicio_programado: alMediodia("2026-09-11"),
        fin_programado: alMediodia("2026-09-13"),
      },
      {
        id: "uuid-4",
        inicio_programado: alMediodia("2026-09-20"),
        fin_programado: alMediodia("2026-09-21"),
      },
    ]);
    expect(encontradas.map((r) => r.id)).toEqual(["uuid-3"]);
  });

  it("le pide a la base un rango más ancho que el pedido", async () => {
    const { repo: r, todosLos } = repo(() => filas());
    await r.reservasHotel.enRango("2026-09-10", "2026-09-12");
    // Dos `or` encadenados (empieza antes del fin, termina después del
    // inicio), que es el traslape expresado con las cuatro columnas.
    expect(todosLos("or")).toHaveLength(2);
  });
});

describe("estadiasJardin.enRango", () => {
  // `fecha` es una columna `date`: el día ya está guardado como día y el
  // filtro es exacto, sin recorte posterior.
  it("filtra en la base, sin holgura", async () => {
    const { repo: r, todosLos } = repo(() => filas());
    await r.estadiasJardin.enRango("2026-09-10", "2026-09-12");
    expect(todosLos("gte")).toEqual([["fecha", "2026-09-10"]]);
    expect(todosLos("lte")).toEqual([["fecha", "2026-09-12"]]);
  });
});

describe("pagos", () => {
  it("porCobrar pide lo pendiente y lo vencido", async () => {
    const { repo: r, argumentosDe } = repo(() => filas());
    await r.pagos.porCobrar();
    expect(argumentosDe("in")).toEqual(["estado", ["pendiente", "vencido"]]);
  });

  it("enRango recorta por el día de Santiago", async () => {
    const { repo: r } = repo(() =>
      filas(
        { id: "uuid-1", emitido_en: "2026-09-11T15:00:00.000Z" },
        { id: "uuid-2", emitido_en: "2026-09-14T15:00:00.000Z" },
      ),
    );
    const encontrados = await r.pagos.enRango("2026-09-10", "2026-09-12");
    expect(encontrados.map((p) => p.id)).toEqual(["uuid-1"]);
  });
});

describe("productos.ajustarStock", () => {
  // Darle `update` sobre `productos` al dueño para que la compra baje el
  // stock le daría también la capacidad de cambiarle el PRECIO, y ese precio
  // lo lee toda la vitrina.
  it("descontar pasa por la función, no por un update a la tabla", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: { id: "uuid-p", stock: 4 },
    }));

    const producto = await r.productos.ajustarStock("uuid-p", -1);

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:descontar_stock"]);
    expect(argumentosDe("rpc")).toEqual([{ producto: "uuid-p", cantidad: 1 }]);
    expect(producto.stock).toBe(4);
  });

  it("reponer sí es un update, que es cosa de Administración", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: { id: "uuid-p", stock: 7 },
    }));

    await r.productos.ajustarStock("uuid-p", 2);

    expect(llamadas.every((l) => l.tabla === "productos")).toBe(true);
    expect(argumentosDe("update")).toEqual([{ stock: 9 }]);
  });
});

describe("filtros que no son una columna suelta", () => {
  it("reportes.porPerro pregunta si el arreglo contiene al perro", async () => {
    const { repo: r, argumentosDe } = repo(() => filas());
    await r.reportes.porPerro("uuid-perro");
    expect(argumentosDe("contains")).toEqual(["perro_ids", ["uuid-perro"]]);
  });

  it("mensajes.porReferencia entra al jsonb", async () => {
    const { repo: r, todosLos } = repo(() => filas());
    await r.mensajes.porReferencia("reserva", "uuid-r");
    expect(todosLos("eq")).toEqual([
      ["referencia->>tipo", "reserva"],
      ["referencia->>id", "uuid-r"],
    ]);
  });

  it("notificaciones.marcarLeidas no llama a nada con la lista vacía", async () => {
    const { repo: r, llamadas } = repo(() => filas());
    await r.notificaciones.marcarLeidas([]);
    expect(llamadas).toEqual([]);
  });
});

describe("los errores se explican", () => {
  // `new row violates row-level security policy for table "pagos"` es
  // correcto y no le dice nada a nadie.
  it("un rechazo de RLS dice que no hay permiso", async () => {
    const { repo: r } = repo(() => ({
      error: {
        code: "42501",
        message: 'new row violates row-level security policy for table "pagos"',
      },
    }));

    await expect(
      r.pagos.crear({
        clienteId: "uuid-c",
        concepto: "dia_suelto",
        monto: 16000,
        estado: "pendiente",
        emitidoEn: "2026-09-10T12:00:00.000Z",
      }),
    ).rejects.toThrow(/No tienes permiso/);
  });

  it("un duplicado dice que ya existe", async () => {
    const { repo: r } = repo(() => ({
      error: { code: "23505", message: "duplicate key value" },
    }));

    await expect(
      r.cuentasMensuales.crear({
        clienteId: "uuid-c",
        periodo: "2026-09",
        emitidaEn: "2026-10-01T12:00:00.000Z",
        renovaciones: [],
        consumos: [],
        total: 0,
        estado: "pendiente",
      }),
    ).rejects.toThrow(/Ya existe un registro/);
  });
});

describe("configuración", () => {
  it("si nadie la tocó, responde la de fábrica", async () => {
    const { repo: r } = repo(() => ({ data: null }));
    const config = await r.configuracion.obtener();
    expect(config.vacunasObligatorias.length).toBeGreaterThan(0);
  });

  // `upsert` reemplaza la fila: mandar solo los cambios dejaría las demás
  // columnas en null y la base las tiene como `not null`.
  it("guardar escribe la fila completa, no solo el cambio", async () => {
    const { repo: r, argumentosDe } = repo(({ operaciones }) =>
      operaciones.some(([n]) => n === "upsert")
        ? { data: { id: true, campos_obligatorios: ["foto"] } }
        : { data: null },
    );

    await r.configuracion.guardar({ camposObligatorios: ["foto"] });

    const [fila] = argumentosDe("upsert") as [Record<string, unknown>];
    expect(fila.id).toBe(true);
    expect(fila.campos_obligatorios).toEqual(["foto"]);
    // Lo que no se tocó viaja igual, con su valor actual.
    expect(fila.vacunas_obligatorias).toBeDefined();
    expect(fila.catalogos).toBeDefined();
  });
});

describe("sistema", () => {
  // En el prototipo regeneraban datos mock. Acá borrarían los clientes, las
  // reservas y los cobros de verdad, y los dejarían sin vuelta.
  it("reiniciar no existe en la nube y lo dice", async () => {
    const { repo: r } = repo(() => filas());
    await expect(r.sistema.reiniciar()).rejects.toThrow(/solo del prototipo/);
  });

  it("importar tampoco, y por otro motivo", async () => {
    const { repo: r } = repo(() => filas());
    await expect(r.sistema.importar("{}")).rejects.toThrow(
      /a medio cargar/,
    );
  });

  it("exportar recorre las 16 tablas del dominio y la configuración", async () => {
    const { repo: r, llamadas } = repo(({ tabla }) =>
      tabla === "configuracion" ? { data: null } : filas({ id: "uuid-1" }),
    );

    const json = await r.sistema.exportar();
    const set = JSON.parse(json) as Record<string, unknown>;

    expect(llamadas).toHaveLength(17);
    expect(set.clientes).toHaveLength(1);
    expect(set.configuracion).toBeDefined();
    expect(set.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("equipo", () => {
  it("invita en minúscula y sin espacios", async () => {
    const { repo: r, argumentosDe } = repo(() => ({
      data: { email: "maria@lapatoteca.cl", rol: "staff" },
    }));

    await r.equipo.invitar("  Maria@LaPatoteca.CL ", "staff");

    const [fila] = argumentosDe("upsert") as [Record<string, unknown>];
    expect(fila.email).toBe("maria@lapatoteca.cl");
    expect(fila.rol).toBe("staff");
  });

  // Volver a invitar a quien ya gastó su invitación tiene que servir: si no,
  // una cuidadora que se equivocó de correo al registrarse quedaría trancada
  // para siempre.
  it("volver a invitar reabre una invitación ya usada", async () => {
    const { repo: r, argumentosDe } = repo(() => ({
      data: { email: "maria@lapatoteca.cl", rol: "staff" },
    }));

    await r.equipo.invitar("maria@lapatoteca.cl", "staff");

    const [fila] = argumentosDe("upsert") as [Record<string, unknown>];
    expect(fila.usada_en).toBeNull();
  });

  it("cancelar también normaliza el correo", async () => {
    const { repo: r, argumentosDe } = repo(() => filas());
    await r.equipo.cancelarInvitacion(" Maria@LaPatoteca.CL ");
    expect(argumentosDe("eq")).toEqual(["email", "maria@lapatoteca.cl"]);
  });

  it("cambiar el rol escribe en perfiles", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: { id: "uuid-p", nombre: "María", rol: "admin" },
    }));

    const miembro = await r.equipo.cambiarRol("uuid-p", "admin");

    expect(llamadas.map((l) => l.tabla)).toEqual(["perfiles"]);
    expect(argumentosDe("update")).toEqual([{ rol: "admin" }]);
    expect(miembro.rol).toBe("admin");
  });

  it("cambiar el rol de una cuenta que no existe falla claro", async () => {
    const { repo: r } = repo(() => ({ data: null }));
    await expect(r.equipo.cambiarRol("uuid-x", "staff")).rejects.toThrow(
      /No existe la cuenta uuid-x/,
    );
  });

  it("el equipo sale en el orden en que se fue sumando", async () => {
    const { repo: r, argumentosDe } = repo(() => filas());
    await r.equipo.miembros();
    expect(argumentosDe("order")).toEqual(["creado_en", { ascending: true }]);
  });
});

describe("agenda", () => {
  // El dueño no puede tocar un cobro: con `update` sobre `pagos` se dejaría
  // cualquiera en $0 desde la consola. Cancelar y mover tienen que pasar
  // enteros por una función de la base, nunca por updates sueltos. Así fue
  // como la cancelación del día de prueba quedaba a medias.
  const ESTADIA = {
    id: "uuid-e",
    perro_id: "uuid-perro",
    fecha: "2026-10-23",
    inicio_programado: "2026-10-23T12:00:00+00:00",
    estado: "cancelada",
  };

  it("cancelar el día de prueba es una sola llamada a la función", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: {
        estadia: ESTADIA,
        horas_de_aviso: 3.5,
        sin_costo: false,
        costo: 5000,
      },
    }));

    const { estadia, politica } = await r.agenda.cancelarDiaDePrueba(
      "uuid-e",
      "2026-10-23T08:30:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:cancelar_dia_de_prueba"]);
    // Sin la hora: la que vale es la de la base. Si la mandara el navegador,
    // atrasar el teléfono sería cancelar gratis.
    expect(argumentosDe("rpc")).toEqual([{ estadia: "uuid-e" }]);
    expect(politica).toEqual({ horasDeAviso: 3.5, sinCosto: false, costo: 5000 });
    expect(estadia.perroId).toBe("uuid-perro");
    expect(estadia.inicioProgramado).toBe("2026-10-23T12:00:00.000Z");
  });

  it("cancelar trae cuánto hay que devolver, y sin el dato es cero", async () => {
    // La hora no viaja: la que vale es la de la base.
    const AHORA = "2026-10-22T08:30:00.000Z";
    const pagado = repo(() => ({
      data: {
        estadia: ESTADIA,
        horas_de_aviso: 30,
        sin_costo: true,
        costo: 0,
        a_devolver: 10000,
      },
    }));
    expect(
      (await pagado.repo.agenda.cancelarDiaDePrueba("uuid-e", AHORA)).aDevolver,
    ).toBe(10000);

    // La función de antes no lo devolvía: entonces no tocaba lo pagado.
    const antes = repo(() => ({
      data: { estadia: ESTADIA, horas_de_aviso: 30, sin_costo: true, costo: 0 },
    }));
    expect(
      (await antes.repo.agenda.cancelarDiaDePrueba("uuid-e", AHORA)).aDevolver,
    ).toBe(0);
  });

  it("mover el día manda el nuevo horario y trae el cargo, si hubo", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: {
        estadia: { ...ESTADIA, estado: "esperada" },
        horas_de_aviso: 5,
        sin_costo: false,
        costo: 5000,
        cargo: { id: "uuid-cargo", monto: 5000, estado: "pendiente", referencia_id: "uuid-e" },
      },
    }));

    const { cargo, politica } = await r.agenda.reprogramarDiaDePrueba(
      "uuid-e",
      {
        fecha: "2026-10-27",
        inicio: "2026-10-27T13:00:00.000Z",
        fin: "2026-10-27T19:00:00.000Z",
      },
      "2026-10-23T07:00:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:reprogramar_dia_de_prueba"]);
    expect(argumentosDe("rpc")).toEqual([
      {
        estadia: "uuid-e",
        nueva_fecha: "2026-10-27",
        nuevo_inicio: "2026-10-27T13:00:00.000Z",
        nuevo_fin: "2026-10-27T19:00:00.000Z",
      },
    ]);
    expect(politica.sinCosto).toBe(false);
    expect(cargo).toMatchObject({ id: "uuid-cargo", referenciaId: "uuid-e" });
  });

  it("mover con tiempo no trae cargo", async () => {
    const { repo: r } = repo(() => ({
      data: { estadia: ESTADIA, horas_de_aviso: 50, sin_costo: true, costo: 0, cargo: null },
    }));

    const { cargo } = await r.agenda.reprogramarDiaDePrueba(
      "uuid-e",
      { fecha: "2026-10-27", inicio: "2026-10-27T13:00:00.000Z", fin: "2026-10-27T19:00:00.000Z" },
      "2026-10-23T07:00:00.000Z",
    );

    expect(cargo).toBeNull();
  });

  it("cancelar un día de jardín trae lo que la base decidió", async () => {
    const { repo: r, llamadas } = repo(() => ({
      data: {
        estadia: ESTADIA,
        horas_de_aviso: 30,
        devuelve: true,
        a_devolver: 18000,
        plan: { id: "uuid-plan", dias_usados: 3 },
      },
    }));

    const resultado = await r.agenda.cancelarDiaDeJardin(
      "uuid-e",
      "2026-10-22T06:00:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:cancelar_dia_de_jardin"]);
    expect(resultado.devolucion.devuelve).toBe(true);
    expect(resultado.devolucion.horasDeAviso).toBe(30);
    expect(resultado.aDevolver).toBe(18000);
    expect(resultado.planDevuelto).toMatchObject({ id: "uuid-plan", diasUsados: 3 });
  });

  it("sin plan no inventa uno", async () => {
    const { repo: r } = repo(() => ({
      data: { estadia: ESTADIA, horas_de_aviso: 2, devuelve: false, a_devolver: 0, plan: null },
    }));

    const resultado = await r.agenda.cancelarDiaDeJardin("uuid-e", "2026-10-23T10:00:00.000Z");

    expect(resultado.devolucion.devuelve).toBe(false);
    expect(resultado.planDevuelto).toBeNull();
  });

  it("lo que la base rechaza llega con su motivo", async () => {
    const { repo: r } = repo(() => ({
      error: { code: "P0001", message: "Ese día ya no se puede cancelar." },
    }));

    await expect(
      r.agenda.cancelarDiaDePrueba("uuid-e", "2026-10-23T08:30:00.000Z"),
    ).rejects.toThrow(/Ese día ya no se puede cancelar/);
  });
});

describe("notificaciones.crear", () => {
  // El dueño deja avisos y no los lee. Pedir la fila de vuelta (`.select()`,
  // que es `insert … returning`) exige la política de LECTURA y el insert
  // permitido fallaba igual.
  it("deja el aviso sin pedirlo de vuelta", async () => {
    const { repo: r, todosLos, argumentosDe } = repo(() => ({}));

    const aviso = await r.notificaciones.crear({
      clienteId: "uuid-c",
      perroId: "uuid-perro",
      titulo: "Camila canceló el día de Trufa",
      cambios: [],
      leida: false,
      creadaEn: "2026-10-22T12:00:00.000Z",
    });

    expect(todosLos("select")).toEqual([]);
    const [fila] = argumentosDe("insert") as [Record<string, unknown>];
    expect(fila.id).toBe(aviso.id);
    expect(fila.cliente_id).toBe("uuid-c");
    expect(aviso.titulo).toBe("Camila canceló el día de Trufa");
  });

  it("si la base lo rechaza, falla claro", async () => {
    const { repo: r } = repo(() => ({
      error: { code: "42501", message: "new row violates row-level security" },
    }));

    await expect(
      r.notificaciones.crear({
        clienteId: "uuid-c",
        titulo: "x",
        cambios: [],
        leida: false,
        creadaEn: "2026-10-22T12:00:00.000Z",
      }),
    ).rejects.toThrow(/No tienes permiso/);
  });
});

describe("agenda: agendar y comprar", () => {
  // El dueño no escribe `planes` ni el día de prueba de su perro: con eso se
  // dejaría el saldo del pack en cero o se aprobaría solo. Cada una es una
  // sola llamada a una función de la base.
  const HORARIO = {
    fecha: "2026-10-27",
    inicio: "2026-10-27T12:00:00.000Z",
    fin: "2026-10-27T18:00:00.000Z",
  };
  const COTIZACION: Cotizacion = {
    lineas: [],
    subtotal: 10000,
    descuentos: [],
    total: 10000,
  };

  it("agendar el día de prueba manda el horario y la cotización que vio", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: {
        estadia: { id: "uuid-e", origen: "dia_de_prueba" },
        pago: { id: "uuid-g", monto: 10000, estado: "pendiente" },
        perro: { id: "uuid-perro", dia_de_prueba: { estado: "agendado", fecha: "2026-10-27" } },
      },
    }));

    const { estadia, pago, perro } = await r.agenda.agendarDiaDePrueba(
      "uuid-perro",
      HORARIO,
      COTIZACION,
      "2026-10-22T12:00:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:agendar_dia_de_prueba"]);
    expect(argumentosDe("rpc")).toEqual([
      {
        perro: "uuid-perro",
        nueva_fecha: "2026-10-27",
        nuevo_inicio: "2026-10-27T12:00:00.000Z",
        nuevo_fin: "2026-10-27T18:00:00.000Z",
        la_cotizacion: COTIZACION,
      },
    ]);
    expect(estadia.origen).toBe("dia_de_prueba");
    expect(pago.estado).toBe("pendiente");
    expect(perro.diaDePrueba.estado).toBe("agendado");
  });

  it("agendar con plan es una llamada, no un update al saldo", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: {
        estadia: { id: "uuid-e", origen: "plan", plan_id: "uuid-plan" },
        plan: { id: "uuid-plan", dias_usados: 4 },
      },
    }));

    const { estadia, plan } = await r.agenda.agendarDiaConPlan(
      "uuid-plan",
      HORARIO,
      COTIZACION,
      "2026-10-22T12:00:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:agendar_dia_con_plan"]);
    expect(argumentosDe("rpc")).toMatchObject([{ plan: "uuid-plan" }]);
    expect(estadia.planId).toBe("uuid-plan");
    expect(plan.diasUsados).toBe(4);
  });

  it("comprar un plan no manda ni el precio ni los días: los calcula la base", async () => {
    const { repo: r, llamadas, argumentosDe } = repo(() => ({
      data: {
        plan: { id: "uuid-plan", dias_totales: 12, precio: 168000 },
        pago: { id: "uuid-g", concepto: "plan", monto: 168000, estado: "pendiente" },
      },
    }));

    const { plan, pago } = await r.agenda.comprarPlan(
      "uuid-perro",
      { tipo: "dias", dias: 12 },
      "2026-10-22T12:00:00.000Z",
    );

    expect(llamadas.map((l) => l.tabla)).toEqual(["rpc:comprar_plan_de_jardin"]);
    expect(argumentosDe("rpc")).toEqual([
      { perro: "uuid-perro", tipo_de_plan: "dias", dias: 12 },
    ]);
    expect(plan).toMatchObject({ diasTotales: 12, precio: 168000 });
    expect(pago.estado).toBe("pendiente");
  });

  it("el pase libre va sin días: los pone el mes", async () => {
    const { repo: r, argumentosDe } = repo(() => ({
      data: { plan: { id: "uuid-plan" }, pago: { id: "uuid-g" } },
    }));

    await r.agenda.comprarPlan(
      "uuid-perro",
      { tipo: "pase_libre" },
      "2026-10-22T12:00:00.000Z",
    );

    expect(argumentosDe("rpc")).toEqual([
      { perro: "uuid-perro", tipo_de_plan: "pase_libre", dias: null },
    ]);
  });
});
