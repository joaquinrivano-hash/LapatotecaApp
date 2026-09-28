import { beforeEach, describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { EstadiaJardin } from "@/lib/types";
import {
  agendarDiaDePrueba,
  cancelarDiaDePrueba,
  cotizarDiaDePrueba,
  crearCuenta,
  disponibilidadDeUnDia,
  reparosParaEntrar,
  reprogramarDiaDePrueba,
  RegistroRechazado,
} from "./registro";

const LUNES = "2026-06-15";
const MARTES = "2026-06-16";
/** Un instante del día anterior, para agendar "con tiempo". */
const DOMINGO = "2026-06-14T12:00:00.000Z";
const en = (hora: string, dia = LUNES) => instanteEnHora(dia, hora);

const CUENTA = {
  nombre: "Camila",
  apellido: "Rojas",
  email: "camila@correo.cl",
  telefono: "9 8765 4321",
  comuna: "Providencia",
};

const PERRO = {
  nombre: "Trufa",
  raza: "Quiltro",
  pesoKg: 11.5,
  sexo: "hembra" as const,
  esterilizado: true,
  // Los campos que Administración exige por defecto: sin ellos crearCuenta
  // rechaza la ficha, que es justamente lo que queremos que haga.
  fechaNacimiento: "2022-03-10",
  fotoUrl: "data:image/jpeg;base64,aG9sYQ==",
  carnetVacunasUrl: "data:image/jpeg;base64,aG9sYQ==",
  alimentacion: {
    marca: "Proplan",
    cantidad: 1,
    unidad: "taza" as const,
    comidas: ["almuerzo" as const],
  },
  vacunas: NEGOCIO.admision.vacunasObligatorias.map((tipo) => ({
    tipo,
    fechaVencimiento: "2027-01-01",
  })),
  desparasitadoHasta: "2027-01-01",
};

let repo: RepositorioPatoteca;

function montar(datos: Partial<DatosPatoteca> = {}) {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: LUNES,
    clientes: [],
    perros: [],
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

describe("crearCuenta", () => {
  it("deja al cliente con su perro y el día de prueba pendiente", async () => {
    const { cliente, perro } = await crearCuenta(
      repo,
      { cuenta: CUENTA, perro: PERRO },
      en("10:00"),
    );

    expect(cliente.nombre).toBe("Camila");
    expect(perro.clienteId).toBe(cliente.id);
    expect(perro.diaDePrueba.estado).toBe("pendiente");
    expect(perro.vacunas).toHaveLength(
      NEGOCIO.admision.vacunasObligatorias.length,
    );

    expect(await repo.clientes.listar()).toHaveLength(1);
    expect(await repo.perros.porCliente(cliente.id)).toHaveLength(1);
  });

  it("guarda el teléfono en E.164, que es lo que pide WhatsApp", async () => {
    const { cliente } = await crearCuenta(repo, {
      cuenta: { ...CUENTA, telefono: "9 8765 4321" },
      perro: PERRO,
    });
    expect(cliente.telefono).toBe("+56987654321");
  });

  it("no crea nada si el perro no cumple los requisitos de entrada", async () => {
    await expect(
      crearCuenta(repo, {
        cuenta: CUENTA,
        perro: { ...PERRO, pesoKg: NEGOCIO.admision.pesoMaximoKg + 5 },
      }),
    ).rejects.toThrow(RegistroRechazado);

    expect(await repo.clientes.listar()).toHaveLength(0);
    expect(await repo.perros.listar()).toHaveLength(0);
  });

  it("avisa del macho sin esterilizar, no de la hembra", () => {
    expect(
      reparosParaEntrar({ ...PERRO, sexo: "macho", esterilizado: false }),
    ).toHaveLength(1);
    expect(
      reparosParaEntrar({ ...PERRO, sexo: "hembra", esterilizado: false }),
    ).toHaveLength(0);
  });
});

describe("día de prueba", () => {
  const A_LAS_9 = 9 * 60;

  it("se agenda como media jornada desde la hora elegida", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });

    const { estadia, perro: actualizado } = await agendarDiaDePrueba(
      repo,
      perro.id,
      LUNES,
      A_LAS_9,
    );

    expect(estadia.origen).toBe("dia_de_prueba");
    expect(estadia.estado).toBe("esperada");
    expect(estadia.inicioProgramado).toBe(en("9:00"));
    expect(estadia.finProgramado).toBe(
      en(`${9 + NEGOCIO.diaDePrueba.horasDeEstadia}:00`),
    );
    expect(actualizado.diaDePrueba).toEqual({
      estado: "agendado",
      fecha: LUNES,
    });
  });

  it("cobra al agendar, y el cobro nace pendiente", async () => {
    const { cliente, perro } = await crearCuenta(repo, {
      cuenta: CUENTA,
      perro: PERRO,
    });
    const { pago } = await agendarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9);

    expect(pago.monto).toBe(PRECIOS.diaDePrueba);
    expect(pago.estado).toBe("pendiente");
    expect(pago.concepto).toBe("dia_de_prueba");
    expect(await repo.pagos.porCliente(cliente.id)).toHaveLength(1);
  });

  it("no lo pide a sí mismo: un perro sin día de prueba igual puede tomarlo", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });
    const previa = await cotizarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9);

    expect(previa.admision.admitido).toBe(true);
    expect(previa.sePuede).toBe(true);
  });

  it("no deja tomarlo dos veces", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });
    await agendarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9);

    await expect(
      agendarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9),
    ).rejects.toThrow(RegistroRechazado);
  });

  it("respeta el tope de cupos de la casa", async () => {
    montar({ estadiasJardin: llenarJardin(NEGOCIO.capacidad.maximoSimultaneo) });
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });

    const dia = await disponibilidadDeUnDia(repo, perro.id, LUNES, DOMINGO);
    expect(dia.libres).toBe(0);

    await expect(
      agendarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9, DOMINGO),
    ).rejects.toMatchObject({
      motivos: ["La casa está llena a esa hora, elige otra hora."],
    });
  });

  it("no deja dos días de prueba en el mismo bloque", async () => {
    const primero = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });
    await agendarDiaDePrueba(repo, primero.perro.id, LUNES, A_LAS_9);

    const segundo = await crearCuenta(repo, {
      cuenta: { ...CUENTA, email: "otro@ejemplo.cl" },
      perro: { ...PERRO, nombre: "Mora" },
    });

    const dia = await disponibilidadDeUnDia(
      repo,
      segundo.perro.id,
      LUNES,
      DOMINGO,
    );
    expect(dia.bloques.find((b) => b.minutoDelDia === A_LAS_9)?.motivo).toBe(
      "tomado",
    );

    // Media hora después sí se puede.
    await expect(
      agendarDiaDePrueba(repo, segundo.perro.id, LUNES, A_LAS_9 + 30),
    ).resolves.toBeTruthy();
  });
});

describe("cambiar o cancelar el día de prueba", () => {
  const A_LAS_9 = 9 * 60;

  /** Dos días antes: aviso de sobra. */
  const CON_TIEMPO = DOMINGO;
  /** La misma mañana: menos de 24 horas. */
  const ENCIMA = en("6:00");

  async function conDiaAgendado() {
    const { cliente, perro } = await crearCuenta(repo, {
      cuenta: CUENTA,
      perro: PERRO,
    });
    await agendarDiaDePrueba(repo, perro.id, LUNES, A_LAS_9, CON_TIEMPO);
    return { cliente, perro };
  }

  it("con 24 horas o más, cancelar no cuesta nada y anula el cobro", async () => {
    const { cliente, perro } = await conDiaAgendado();

    const { politica } = await cancelarDiaDePrueba(repo, perro.id, CON_TIEMPO);

    expect(politica.sinCosto).toBe(true);
    expect(politica.costo).toBe(0);

    const pagos = await repo.pagos.porCliente(cliente.id);
    expect(pagos[0].estado).toBe("reembolsado");
    expect(pagos[0].monto).toBe(0);
  });

  it("con menos de 24 horas se cobra la cancelación tardía", async () => {
    const { cliente, perro } = await conDiaAgendado();

    const { politica } = await cancelarDiaDePrueba(repo, perro.id, ENCIMA);

    expect(politica.sinCosto).toBe(false);
    expect(politica.costo).toBe(PRECIOS.cancelacionTardiaDiaDePrueba);

    const pagos = await repo.pagos.porCliente(cliente.id);
    expect(pagos[0].monto).toBe(PRECIOS.cancelacionTardiaDiaDePrueba);
    expect(pagos[0].estado).toBe("pendiente");
  });

  it("cancelar devuelve al perro a la fila: puede volver a agendar", async () => {
    const { perro } = await conDiaAgendado();
    await cancelarDiaDePrueba(repo, perro.id, CON_TIEMPO);

    expect((await repo.perros.obtener(perro.id))!.diaDePrueba.estado).toBe(
      "pendiente",
    );
    await expect(
      agendarDiaDePrueba(repo, perro.id, MARTES, A_LAS_9, CON_TIEMPO),
    ).resolves.toBeTruthy();
  });

  it("y libera el bloque para otro perrito", async () => {
    const { perro } = await conDiaAgendado();
    await cancelarDiaDePrueba(repo, perro.id, CON_TIEMPO);

    const otro = await crearCuenta(repo, {
      cuenta: { ...CUENTA, email: "otro@ejemplo.cl" },
      perro: { ...PERRO, nombre: "Mora" },
    });
    const dia = await disponibilidadDeUnDia(
      repo,
      otro.perro.id,
      LUNES,
      CON_TIEMPO,
    );

    expect(dia.bloques.find((b) => b.minutoDelDia === A_LAS_9)?.disponible).toBe(
      true,
    );
  });

  it("reprogramar con tiempo mueve la hora sin cobrar de más", async () => {
    const { cliente, perro } = await conDiaAgendado();

    const { estadia, politica } = await reprogramarDiaDePrueba(
      repo,
      perro.id,
      MARTES,
      11 * 60,
      CON_TIEMPO,
    );

    expect(politica.sinCosto).toBe(true);
    expect(estadia.fecha).toBe(MARTES);
    expect(await repo.pagos.porCliente(cliente.id)).toHaveLength(1);
  });

  it("reprogramar encima de la hora suma el cargo por el cambio", async () => {
    const { cliente, perro } = await conDiaAgendado();

    await reprogramarDiaDePrueba(repo, perro.id, MARTES, 11 * 60, ENCIMA);

    const pagos = await repo.pagos.porCliente(cliente.id);
    expect(pagos).toHaveLength(2);
    expect(pagos[1].monto).toBe(PRECIOS.cancelacionTardiaDiaDePrueba);
  });

  it("no deja mover el día a una hora ocupada", async () => {
    const { perro } = await conDiaAgendado();
    const otro = await crearCuenta(repo, {
      cuenta: { ...CUENTA, email: "otro@ejemplo.cl" },
      perro: { ...PERRO, nombre: "Mora" },
    });
    await agendarDiaDePrueba(repo, otro.perro.id, MARTES, 11 * 60, CON_TIEMPO);

    await expect(
      reprogramarDiaDePrueba(repo, perro.id, MARTES, 11 * 60, CON_TIEMPO),
    ).rejects.toThrow(RegistroRechazado);
  });

  it("sin día agendado, cancelar avisa en vez de reventar", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });

    await expect(cancelarDiaDePrueba(repo, perro.id)).rejects.toThrow(
      RegistroRechazado,
    );
  });
});
