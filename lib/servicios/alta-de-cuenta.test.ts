/**
 * El alta con cuentas de verdad, y su final que depende de Supabase.
 *
 * Lo que más importa acá es el ORDEN: validar antes de crear la cuenta de
 * acceso. Con el orden al revés, un perro que no se puede recibir deja una
 * cuenta huérfana en Supabase Auth que la app no sabe borrar, y esa persona
 * queda sin poder registrarse nunca más con su propio correo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { NEGOCIO } from "@/lib/config/negocio";
import type { Autenticacion } from "@/lib/auth/tipos";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria, type Almacen } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  altaPendiente,
  completarAltaPendiente,
  reemplazarAlmacenDeAltas,
  registrarDueno,
} from "@/lib/servicios/alta-de-cuenta";
import { RegistroRechazado } from "@/lib/servicios/registro";

const HOY = "2026-06-15";
const AHORA = "2026-06-15T12:00:00.000Z";

const CUENTA = {
  nombre: "Camila",
  apellido: "Rojas",
  email: "  Camila@Correo.CL ",
  telefono: "9 8765 4321",
  comuna: "Providencia",
};

const PERRO = {
  nombre: "Trufa",
  raza: "Quiltro",
  pesoKg: 11.5,
  sexo: "hembra" as const,
  esterilizado: true,
  fechaNacimiento: "2022-03-10",
  fotoUrl: "data:image/jpeg;base64,aG9sYQ==",
  carnetVacunasUrls: ["data:image/jpeg;base64,aG9sYQ=="],
  alimentacion: {
    marca: "Proplan",
    unidad: "taza" as const,
    raciones: [{ cantidad: 1, comidas: ["almuerzo" as const] }],
  },
  vacunas: NEGOCIO.admision.vacunasObligatorias.map((tipo) => ({
    tipo,
    fechaAplicacion: "2026-05-01",
  })),
  desparasitadoHasta: "2027-01-01",
};

let repo: RepositorioPatoteca;
let almacen: Almacen;

/** Una autenticación de mentira que dice si quedó sesión o no. */
function auth(faltaConfirmar: boolean): Autenticacion & {
  registrar: ReturnType<typeof vi.fn>;
} {
  const registrar = vi.fn().mockResolvedValue({
    identidad: faltaConfirmar ? null : { rol: "cliente" as const },
    faltaConfirmar,
  });
  return { registrar } as unknown as Autenticacion & {
    registrar: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  const datos = crearAlmacenMemoria();
  datos.escribir(CLAVE_ALMACEN, {
    hoy: HOY,
    clientes: [],
    perros: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen: datos });

  almacen = crearAlmacenMemoria();
  reemplazarAlmacenDeAltas(almacen);
});

describe("registrarDueno", () => {
  it("con sesión abierta crea la ficha al tiro", async () => {
    const a = auth(false);
    const resultado = await registrarDueno(
      repo,
      a,
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    expect(resultado.estado).toBe("lista");
    expect(await repo.clientes.listar()).toHaveLength(1);
    expect(await repo.perros.listar()).toHaveLength(1);
    // Nada que terminar después.
    expect(altaPendiente()).toBeNull();
  });

  it("normaliza el correo y manda el nombre completo a la cuenta", async () => {
    const a = auth(false);
    await registrarDueno(
      repo,
      a,
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    expect(a.registrar).toHaveBeenCalledWith({
      email: "camila@correo.cl",
      password: "secreta",
      nombre: "Camila Rojas",
    });
  });

  it("sin sesión guarda la ficha y no escribe nada en la base", async () => {
    const resultado = await registrarDueno(
      repo,
      auth(true),
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    expect(resultado).toEqual({
      estado: "falta_confirmar",
      email: "camila@correo.cl",
    });
    // La cuenta de acceso existe; la ficha todavía no, porque sin sesión
    // cualquier insert sería con auth.uid() nulo.
    expect(await repo.clientes.listar()).toEqual([]);
    expect(altaPendiente()?.perro.nombre).toBe("Trufa");
  });

  // Lo más importante del archivo: si se creara la cuenta primero, un perro
  // que no se puede recibir dejaría una cuenta huérfana que la app no sabe
  // borrar, y esa persona no podría registrarse nunca más con su correo.
  it("valida la ficha ANTES de crear la cuenta de acceso", async () => {
    const a = auth(false);
    // Un macho sin castrar, que es de lo poco que no tiene vuelta. El peso
    // ya no sirve de ejemplo: desde que existe `excepcionPeso` avisa pero
    // deja crear la cuenta, porque eso lo decide Administración mirando al
    // perro y no el formulario.
    const sinCastrar = {
      ...PERRO,
      sexo: "macho" as const,
      esterilizado: false,
    };

    await expect(
      registrarDueno(
        repo,
        a,
        { cuenta: CUENTA, perro: sinCastrar, password: "secreta" },
        AHORA,
      ),
    ).rejects.toThrow(RegistroRechazado);

    expect(a.registrar).not.toHaveBeenCalled();
  });

  it("y tampoco crea la cuenta si falta algo de la ficha", async () => {
    const a = auth(false);
    const incompleto = { ...PERRO, alimentacion: undefined };

    await expect(
      registrarDueno(
        repo,
        a,
        { cuenta: CUENTA, perro: incompleto, password: "secreta" },
        AHORA,
      ),
    ).rejects.toThrow(RegistroRechazado);

    expect(a.registrar).not.toHaveBeenCalled();
    expect(altaPendiente()).toBeNull();
  });
});

describe("completarAltaPendiente", () => {
  it("termina el alta que quedó esperando el correo", async () => {
    await registrarDueno(
      repo,
      auth(true),
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    const cuenta = await completarAltaPendiente(repo, AHORA);

    expect(cuenta?.perro.nombre).toBe("Trufa");
    expect(await repo.clientes.listar()).toHaveLength(1);
    expect(altaPendiente()).toBeNull();
  });

  // Quien confirmó el correo en otro teléfono: la ficha no viajó, y eso no
  // es un error, es volver a pedírsela.
  it("sin nada guardado responde null, sin romperse", async () => {
    await expect(completarAltaPendiente(repo, AHORA)).resolves.toBeNull();
    expect(await repo.clientes.listar()).toEqual([]);
  });

  // Si se olvidara antes de escribir y la escritura fallara, los datos se
  // perderían sin que nadie lo note.
  it("no olvida la ficha si la escritura falla", async () => {
    await registrarDueno(
      repo,
      auth(true),
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    vi.spyOn(repo.perros, "crear").mockRejectedValueOnce(
      new Error("se cayó la red"),
    );

    await expect(completarAltaPendiente(repo, AHORA)).rejects.toThrow(
      /se cayó la red/,
    );
    expect(altaPendiente()?.perro.nombre).toBe("Trufa");
  });

  it("no la vuelve a crear si ya se completó", async () => {
    await registrarDueno(
      repo,
      auth(true),
      { cuenta: CUENTA, perro: PERRO, password: "secreta" },
      AHORA,
    );

    await completarAltaPendiente(repo, AHORA);
    await completarAltaPendiente(repo, AHORA);

    expect(await repo.clientes.listar()).toHaveLength(1);
  });
});
