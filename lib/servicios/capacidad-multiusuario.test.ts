/**
 * ¿Cuadra la capacidad cuando entran varios dueños nuevos y van agendando?
 *
 * Los tests de `capacidad.test.ts` prueban la REGLA con rangos armados a
 * mano. Esto prueba la OPERACIÓN: dueños que se crean la cuenta de verdad
 * (`crearCuenta`), les aprueban el perro y después van agendando uno tras
 * otro contra el mismo día, cada uno viendo lo que dejaron los anteriores.
 *
 * Es un recorrido distinto y es donde la capacidad se rompería sin que
 * ningún test de la regla se enterara: cada reserva cotiza contra lo que
 * YA está guardado, así que lo que se verifica acá es que lo guardado se
 * esté leyendo completo —hotel y jardín juntos— y que el pico del día
 * nunca pase de 25.
 *
 * La invariante que persigue todo el archivo es una sola: **ninguna franja
 * de ningún día supera `maximoSimultaneo`**. No "no hay más de 25 perros en
 * el día" —eso es otro número, y más grande— sino que en ningún momento
 * haya 26 juntos.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { NEGOCIO } from "@/lib/config/negocio";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { calcularOcupacionDia } from "@/lib/rules/capacidad";
import { minutosDeEntrada } from "@/lib/rules/dia-de-prueba";
import { aprobarSinDiaDePrueba } from "@/lib/servicios/evaluacion";
import {
  agendarDiaDePrueba,
  crearCuenta,
  RegistroRechazado,
} from "@/lib/servicios/registro";
import {
  crearReservaHotel,
  ocupantesEnRango,
  reservarDiaJardin,
  ReservaRechazada,
} from "@/lib/servicios/reservas";
import { hhmmDesdeMinutos, instanteEnHora } from "@/lib/utils/fecha";
import type { Perro } from "@/lib/types";

const HOY = "2026-06-10";
const AHORA = instanteEnHora(HOY, "10:00");
/** El día que todos van a pelearse. Un martes. */
const DIA = "2026-06-16";

const MAXIMO = NEGOCIO.capacidad.maximoSimultaneo;
const APERTURA = NEGOCIO.jardin.horaApertura * 60;
const CIERRE = NEGOCIO.jardin.horaCierre * 60;

let repo: RepositorioPatoteca;

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: HOY,
    clientes: [],
    perros: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
});

/**
 * Un dueño nuevo que se crea la cuenta como en el portal.
 *
 * Pasa por `crearCuenta` y no por el repositorio directo a propósito: así
 * el perro nace con la misma ficha que tendría uno de verdad, admisión
 * incluida, y lo que se está probando es el camino que usa la app.
 */
async function dueñoNuevo(n: number): Promise<Perro> {
  const { perro } = await crearCuenta(
    repo,
    {
      cuenta: {
        nombre: `Dueño${n}`,
        apellido: "Pérez",
        email: `duenio${n}@correo.cl`,
        telefono: `9 8765 43${String(n).padStart(2, "0")}`,
        comuna: "Providencia",
      },
      perro: {
        nombre: `Perro${n}`,
        raza: "Quiltro",
        pesoKg: 11,
        sexo: "hembra",
        esterilizado: true,
        fechaNacimiento: "2022-03-10",
        fotoUrl: "data:image/jpeg;base64,aG9sYQ==",
        carnetVacunasUrls: ["data:image/jpeg;base64,aG9sYQ=="],
        alimentacion: {
          marca: "Proplan",
          unidad: "taza",
          raciones: [{ cantidad: 1, comidas: ["almuerzo"] }],
        },
        vacunas: NEGOCIO.admision.vacunasObligatorias.map((tipo) => ({
          tipo,
          fechaAplicacion: "2026-05-01",
        })),
        desparasitadoHasta: "2027-01-01",
      },
    },
    AHORA,
  );
  return perro;
}

/** Nuevo, y además habilitado para reservar: la casa ya lo conoce. */
async function dueñoHabilitado(n: number): Promise<Perro> {
  const perro = await dueñoNuevo(n);
  await aprobarSinDiaDePrueba(repo, perro.id, AHORA);
  return perro;
}

/** La ocupación real del día, leída de lo que quedó guardado. */
async function ocupacionDe(dia = DIA) {
  return calcularOcupacionDia(dia, await ocupantesEnRango(repo, dia, dia));
}

/** La invariante: ninguna franja del día pasa del máximo. */
async function franjasPasadasDeCupo(dia = DIA) {
  const { slots } = await ocupacionDe(dia);
  return slots
    .filter((s) => s.total > MAXIMO)
    .map((s) => `${hhmmDesdeMinutos(s.minutoDelDia)} → ${s.total}`);
}

describe("varios dueños nuevos agendando el mismo día", () => {
  it("25 llenan la jornada completa y el 26 queda afuera", async () => {
    const perros = [];
    for (let i = 0; i < MAXIMO + 1; i += 1) {
      perros.push(await dueñoHabilitado(i));
    }

    for (let i = 0; i < MAXIMO; i += 1) {
      await reservarDiaJardin(
        repo,
        { perroId: perros[i].id, fecha: DIA },
        AHORA,
      );
    }

    const ocupacion = await ocupacionDe();
    expect(ocupacion.pico).toBe(MAXIMO);
    expect(ocupacion.perrosDistintos).toBe(MAXIMO);

    // El 26 no entra, y el "no" dice qué franja chocó.
    const rechazo = await reservarDiaJardin(
      repo,
      { perroId: perros[MAXIMO].id, fecha: DIA },
      AHORA,
    ).catch((e) => e);

    expect(rechazo).toBeInstanceOf(ReservaRechazada);
    expect((rechazo as ReservaRechazada).motivos.join(" ")).toContain("cupo");

    // Y lo que importa de verdad: el rechazo no dejó nada a medias.
    expect(await franjasPasadasDeCupo()).toEqual([]);
    expect((await ocupacionDe()).pico).toBe(MAXIMO);
  });

  it("el que se va a mediodía libera el cupo: 50 perros, pico de 25", async () => {
    const mediodia = (APERTURA + CIERRE) / 2;

    for (let i = 0; i < MAXIMO; i += 1) {
      const perro = await dueñoHabilitado(i);
      await reservarDiaJardin(
        repo,
        { perroId: perro.id, fecha: DIA, hastaMinuto: mediodia },
        AHORA,
      );
    }

    // La segunda tanda entra justo cuando la primera se va. El traslape es
    // estricto, así que las 13:00 no se pisan.
    for (let i = 0; i < MAXIMO; i += 1) {
      const perro = await dueñoHabilitado(MAXIMO + i);
      await reservarDiaJardin(
        repo,
        { perroId: perro.id, fecha: DIA, desdeMinuto: mediodia },
        AHORA,
      );
    }

    const ocupacion = await ocupacionDe();
    expect(ocupacion.perrosDistintos).toBe(MAXIMO * 2);
    expect(ocupacion.pico).toBe(MAXIMO);
    expect(await franjasPasadasDeCupo()).toEqual([]);
  });

  it("hotel y jardín comparten los 25, no son 25 de cada uno", async () => {
    const enHotel = 20;

    for (let i = 0; i < enHotel; i += 1) {
      const perro = await dueñoHabilitado(i);
      await crearReservaHotel(
        repo,
        {
          perroId: perro.id,
          inicio: instanteEnHora("2026-06-15", "18:00"),
          fin: instanteEnHora("2026-06-17", "12:00"),
        },
        AHORA,
      );
    }

    // Quedan 5 cupos de jardín, no 25.
    for (let i = 0; i < MAXIMO - enHotel; i += 1) {
      const perro = await dueñoHabilitado(100 + i);
      await reservarDiaJardin(
        repo,
        { perroId: perro.id, fecha: DIA },
        AHORA,
      );
    }

    const ocupacion = await ocupacionDe();
    expect(ocupacion.pico).toBe(MAXIMO);
    expect(ocupacion.perrosHotel).toBe(enHotel);
    expect(ocupacion.perrosJardin).toBe(MAXIMO - enHotel);

    const sobra = await dueñoHabilitado(200);
    await expect(
      reservarDiaJardin(repo, { perroId: sobra.id, fecha: DIA }, AHORA),
    ).rejects.toBeInstanceOf(ReservaRechazada);

    expect(await franjasPasadasDeCupo()).toEqual([]);
  });

  it("el día de prueba de un dueño nuevo tampoco entra en una casa llena", async () => {
    for (let i = 0; i < MAXIMO; i += 1) {
      const perro = await dueñoHabilitado(i);
      await reservarDiaJardin(
        repo,
        { perroId: perro.id, fecha: DIA },
        AHORA,
      );
    }

    // El límite de un perro nuevo por bloque es ADEMÁS de los 25, no en vez
    // de los 25: el bloque está libre y aun así no hay dónde ponerlo.
    const nuevo = await dueñoNuevo(300);
    const rechazo = await agendarDiaDePrueba(
      repo,
      nuevo.id,
      DIA,
      minutosDeEntrada()[0],
      AHORA,
    ).catch((e) => e);

    expect(rechazo).toBeInstanceOf(RegistroRechazado);
    expect((rechazo as RegistroRechazado).motivos.join(" ")).toContain("llena");
    expect(await franjasPasadasDeCupo()).toEqual([]);
  });

  it("cada bloque de llegada toma un solo perro nuevo, aunque la casa esté vacía", async () => {
    const [primerBloque, segundoBloque] = minutosDeEntrada();

    const uno = await dueñoNuevo(0);
    await agendarDiaDePrueba(repo, uno.id, DIA, primerBloque, AHORA);

    const otro = await dueñoNuevo(1);
    const rechazo = await agendarDiaDePrueba(
      repo,
      otro.id,
      DIA,
      primerBloque,
      AHORA,
    ).catch((e) => e);

    expect(rechazo).toBeInstanceOf(RegistroRechazado);

    // El bloque siguiente sí: lo que está tomado es la hora, no el día.
    await expect(
      agendarDiaDePrueba(repo, otro.id, DIA, segundoBloque, AHORA),
    ).resolves.toBeTruthy();

    expect(await franjasPasadasDeCupo()).toEqual([]);
  });

  it("una semana entera de reservas cruzadas no deja ninguna franja pasada de cupo", async () => {
    const dias = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"];

    // Hotel largo: cruza los cuatro días y ocupa de corrido.
    for (let i = 0; i < 8; i += 1) {
      const perro = await dueñoHabilitado(i);
      await crearReservaHotel(
        repo,
        {
          perroId: perro.id,
          inicio: instanteEnHora(dias[0], "09:00"),
          fin: instanteEnHora(dias[3], "17:00"),
        },
        AHORA,
      );
    }

    // Y jardín todos los días, intentando pasarse: 30 por día contra 17
    // cupos libres. Los que no caben se rechazan, no se cuelan.
    let tomados = 0;
    let rechazados = 0;
    for (const dia of dias) {
      for (let i = 0; i < 30; i += 1) {
        const perro = await dueñoHabilitado(1000 + tomados + rechazados);
        try {
          await reservarDiaJardin(repo, { perroId: perro.id, fecha: dia }, AHORA);
          tomados += 1;
        } catch (error) {
          expect(error).toBeInstanceOf(ReservaRechazada);
          rechazados += 1;
        }
      }
    }

    expect(tomados).toBe((MAXIMO - 8) * dias.length);
    expect(rechazados).toBe((30 - (MAXIMO - 8)) * dias.length);

    for (const dia of dias) {
      expect(await franjasPasadasDeCupo(dia)).toEqual([]);
      expect((await ocupacionDe(dia)).pico).toBe(MAXIMO);
    }
  });
});

/**
 * Y el límite de todo lo anterior, escrito a propósito.
 *
 * Todo lo de arriba pasa porque cada dueño agenda DESPUÉS del anterior: su
 * cotización ya ve la reserva que acaba de quedar guardada. Agendar es
 * cotizar y después escribir, y entre las dos cosas no hay nada que impida
 * que entre otro: dos dueños que aprietan "confirmar" en el mismo instante
 * cotizan los dos contra la misma casa, los dos ven cupo, y los dos entran.
 *
 * Esto describe al PROTOTIPO, que es sobre lo que corre este archivo: el
 * repositorio local no tiene candado, así que la ventana existe ahí.
 *
 * En la nube ya no. Desde `20261106120000_lo_que_el_dueno_no_se_salta.sql`
 * el cupo lo cuenta la base, bajo un candado de transacción
 * (`lo_que_cuida_la_casa`): dos dueños confirmando en el mismo instante
 * entran uno después del otro, y el segundo ve lo que agendó el primero.
 * Lo prueba `supabase/pruebas/aislamiento.sh` ("el perro 26 no entra").
 *
 * Se deja el test porque documenta un límite real del modo demo, y porque
 * si algún día la gemela local gana el candado, tiene que caer y cambiarse
 * por el `toBeLessThanOrEqual` que está al lado.
 */
describe("el límite del prototipo: sin candado, los simultáneos se pasan", () => {
  it("dos dueños confirmando en el mismo instante se pueden pasar", async () => {
    const perros = [];
    for (let i = 0; i < MAXIMO + 5; i += 1) {
      perros.push(await dueñoHabilitado(i));
    }

    // Todos a la vez: ninguno alcanza a ver lo que agendó el otro.
    const resultados = await Promise.allSettled(
      perros.map((p) =>
        reservarDiaJardin(repo, { perroId: p.id, fecha: DIA }, AHORA),
      ),
    );
    const aceptadas = resultados.filter((r) => r.status === "fulfilled").length;

    expect(aceptadas).toBe(MAXIMO + 5);
    expect((await ocupacionDe()).pico).toBeGreaterThan(MAXIMO);

    // Lo que SÍ se cumple: en cuanto se agenda uno tras otro, cuadra. La
    // misma tanda en secuencia corta en 25 exactos.
    expect(aceptadas).not.toBe(MAXIMO);
  });

  it("y en secuencia la misma tanda corta justo en el máximo", async () => {
    let aceptadas = 0;
    for (let i = 0; i < MAXIMO + 5; i += 1) {
      const perro = await dueñoHabilitado(i);
      try {
        await reservarDiaJardin(repo, { perroId: perro.id, fecha: DIA }, AHORA);
        aceptadas += 1;
      } catch {
        // Rechazada por capacidad, que es lo que corresponde.
      }
    }

    expect(aceptadas).toBe(MAXIMO);
    expect((await ocupacionDe()).pico).toBe(MAXIMO);
    expect(await franjasPasadasDeCupo()).toEqual([]);
  });
});
