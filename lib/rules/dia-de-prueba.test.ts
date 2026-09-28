import { describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import {
  bloquesDeEntrada,
  hayBloquesLibres,
  minutosDeEntrada,
  rangoDelBloque,
} from "@/lib/rules/dia-de-prueba";
import type { OcupanteRango } from "@/lib/rules/capacidad";

const LUNES = "2026-09-28";

function llenarLaCasa(cantidad: number): OcupanteRango[] {
  const { inicio, fin } = rangoDelBloque(LUNES, 7 * 60);
  return Array.from({ length: cantidad }, (_, i) => ({
    perroId: `otro-${i}`,
    linea: "jardin" as const,
    inicio,
    fin,
  }));
}

const base = {
  fecha: LUNES,
  ocupantes: [] as OcupanteRango[],
  diasDePruebaTomados: [] as number[],
  perroId: "p1",
};

describe("minutosDeEntrada", () => {
  it("va de la primera a la última hora, cada media hora", () => {
    const minutos = minutosDeEntrada();

    expect(minutos[0]).toBe(NEGOCIO.diaDePrueba.horaPrimeraEntrada * 60);
    expect(minutos.at(-1)).toBe(NEGOCIO.diaDePrueba.horaUltimaEntrada * 60);
    expect(minutos[1] - minutos[0]).toBe(
      NEGOCIO.diaDePrueba.minutosEntreEntradas,
    );
  });
});

describe("rangoDelBloque", () => {
  it("dura media jornada desde la hora de llegada", () => {
    const { inicio, fin } = rangoDelBloque(LUNES, 9 * 60);
    const horas =
      (new Date(fin).getTime() - new Date(inicio).getTime()) / 3_600_000;

    expect(horas).toBe(NEGOCIO.diaDePrueba.horasDeEstadia);
  });
});

describe("bloquesDeEntrada", () => {
  it("con la casa vacía están todos libres", () => {
    const bloques = bloquesDeEntrada(base);

    expect(bloques).toHaveLength(minutosDeEntrada().length);
    expect(bloques.every((b) => b.disponible)).toBe(true);
    expect(hayBloquesLibres(bloques)).toBe(true);
  });

  it("no deja dos días de prueba en el mismo bloque", () => {
    const bloques = bloquesDeEntrada({
      ...base,
      diasDePruebaTomados: [8 * 60],
    });

    const ocho = bloques.find((b) => b.minutoDelDia === 8 * 60)!;
    expect(ocho.disponible).toBe(false);
    expect(ocho.motivo).toBe("tomado");

    // El de al lado, media hora después, sigue libre.
    expect(bloques.find((b) => b.minutoDelDia === 8 * 60 + 30)!.disponible).toBe(
      true,
    );
  });

  it("cierra los bloques donde la casa ya está llena", () => {
    const bloques = bloquesDeEntrada({
      ...base,
      ocupantes: llenarLaCasa(NEGOCIO.capacidad.maximoSimultaneo),
    });

    const siete = bloques.find((b) => b.minutoDelDia === 7 * 60)!;
    expect(siete.disponible).toBe(false);
    expect(siete.motivo).toBe("sin_cupo");
  });

  it("un cupo libre alcanza para entrar", () => {
    const bloques = bloquesDeEntrada({
      ...base,
      ocupantes: llenarLaCasa(NEGOCIO.capacidad.maximoSimultaneo - 1),
    });

    expect(bloques.find((b) => b.minutoDelDia === 7 * 60)!.disponible).toBe(true);
  });

  it("marca como pasados los bloques de hoy que ya fueron", () => {
    const bloques = bloquesDeEntrada({ ...base, minutoActual: 10 * 60 });

    expect(bloques.find((b) => b.minutoDelDia === 9 * 60)!.motivo).toBe("pasado");
    expect(bloques.find((b) => b.minutoDelDia === 10 * 60)!.disponible).toBe(true);
  });

  it("un día sin ninguna hora libre se puede detectar de una", () => {
    const bloques = bloquesDeEntrada({
      ...base,
      diasDePruebaTomados: minutosDeEntrada(),
    });

    expect(hayBloquesLibres(bloques)).toBe(false);
  });
});
