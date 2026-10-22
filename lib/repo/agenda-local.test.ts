/**
 * Los rechazos de la agenda en el prototipo.
 *
 * Son los mismos que hace la base en `20261022150000_cambios_de_agenda.sql`
 * y que `supabase/pruebas/aislamiento.sh` prueba allá. Los servicios
 * adelantan los más comunes con un mensaje para el dueño; estos son los que
 * no pasan aunque alguien llame directo.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenMemoria } from "@/lib/repo/almacen";
import { ErrorRepositorio } from "@/lib/repo/error";
import { CLAVE_ALMACEN, crearRepositorioLocal } from "@/lib/repo/local";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { instanteEnHora } from "@/lib/utils/fecha";
import type { EstadiaJardin } from "@/lib/types";

const LUNES = "2026-06-15";
const en = (hora: string, dia = LUNES) => instanteEnHora(dia, hora);
const CON_TIEMPO = "2026-06-13T12:00:00.000Z";

let repo: RepositorioPatoteca;

const DIA: EstadiaJardin = {
  id: "est-1",
  clienteId: "cli-1",
  perroId: "perro-1",
  fecha: LUNES,
  inicioProgramado: en("09:00"),
  finProgramado: en("15:00"),
  origen: "dia_de_prueba",
  estado: "esperada",
  creadaEn: "2026-06-10T12:00:00.000Z",
};

beforeEach(() => {
  const almacen = crearAlmacenMemoria();
  almacen.escribir(CLAVE_ALMACEN, {
    hoy: LUNES,
    clientes: [],
    perros: [
      {
        id: "perro-1",
        clienteId: "cli-1",
        nombre: "Trufa",
        vacunas: [],
        diaDePrueba: { estado: "agendado", fecha: LUNES },
      },
    ],
    estadiasJardin: [DIA],
    pagos: [],
  } as unknown as DatosPatoteca);
  repo = crearRepositorioLocal({ almacen });
});

describe("agenda local", () => {
  it("no cancela dos veces", async () => {
    await repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO);
    await expect(
      repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(ErrorRepositorio);
  });

  it("no mueve el día a una hora que ya pasó", async () => {
    await expect(
      repo.agenda.reprogramarDiaDePrueba(
        DIA.id,
        { fecha: "2026-06-12", inicio: en("09:00", "2026-06-12"), fin: en("15:00", "2026-06-12") },
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no sirve/);
  });

  it("no acepta un horario que no calza con el día", async () => {
    await expect(
      repo.agenda.reprogramarDiaDePrueba(
        DIA.id,
        { fecha: "2026-06-17", inicio: en("09:00", "2026-06-16"), fin: en("15:00", "2026-06-16") },
        CON_TIEMPO,
      ),
    ).rejects.toThrow(/no sirve/);
  });

  it("el día de prueba no se cancela con la regla del jardín", async () => {
    await expect(
      repo.agenda.cancelarDiaDeJardin(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(/su propia pantalla/);
  });

  it("un día de jardín no se cancela con la regla del día de prueba", async () => {
    await repo.estadiasJardin.actualizar(DIA.id, { origen: "dia_suelto" });
    await expect(
      repo.agenda.cancelarDiaDePrueba(DIA.id, CON_TIEMPO),
    ).rejects.toThrow(/no es un día de prueba/);
  });
});
