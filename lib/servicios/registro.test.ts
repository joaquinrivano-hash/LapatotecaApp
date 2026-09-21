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
  cotizarDiaDePrueba,
  crearCuenta,
  reparosParaEntrar,
  RegistroRechazado,
} from "./registro";

const LUNES = "2026-06-15";
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
  it("se agenda como jornada de jardín y deja al perro agendado", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });

    const { estadia, perro: actualizado } = await agendarDiaDePrueba(
      repo,
      perro.id,
      LUNES,
      en("10:00"),
    );

    expect(estadia.origen).toBe("dia_de_prueba");
    expect(estadia.estado).toBe("esperada");
    expect(estadia.cotizacion?.total).toBe(PRECIOS.diaDePrueba);
    expect(estadia.inicioProgramado).toBe(
      en(`${NEGOCIO.jardin.horaApertura}:00`),
    );
    expect(actualizado.diaDePrueba).toEqual({
      estado: "agendado",
      fecha: LUNES,
    });
  });

  it("no lo pide a sí mismo: un perro sin día de prueba igual puede tomarlo", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });
    const previa = await cotizarDiaDePrueba(repo, perro.id, LUNES);

    expect(previa.admision.admitido).toBe(true);
    expect(previa.sePuede).toBe(true);
  });

  it("no deja tomarlo dos veces", async () => {
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });
    await agendarDiaDePrueba(repo, perro.id, LUNES);

    await expect(agendarDiaDePrueba(repo, perro.id, LUNES)).rejects.toThrow(
      RegistroRechazado,
    );
  });

  it("respeta el tope de cupos del día", async () => {
    montar({ estadiasJardin: llenarJardin(NEGOCIO.capacidad.maximoSimultaneo) });
    const { perro } = await crearCuenta(repo, { cuenta: CUENTA, perro: PERRO });

    const previa = await cotizarDiaDePrueba(repo, perro.id, LUNES);
    expect(previa.capacidad.hayCupo).toBe(false);
    expect(previa.sePuede).toBe(false);

    // Un solo motivo con la franja, no 24 líneas: el mensaje es el titular.
    await expect(
      agendarDiaDePrueba(repo, perro.id, LUNES),
    ).rejects.toMatchObject({
      motivos: ["Ese día ya está lleno entre las 07:00 y las 18:30."],
    });
  });

  it("no cobra al agendar: el día de prueba se cobra al cerrar la jornada", async () => {
    const { cliente, perro } = await crearCuenta(repo, {
      cuenta: CUENTA,
      perro: PERRO,
    });
    await agendarDiaDePrueba(repo, perro.id, LUNES);

    expect(await repo.pagos.porCliente(cliente.id)).toHaveLength(0);
  });
});
