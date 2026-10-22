import { describe, expect, it } from "vitest";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import {
  aDevolverAlCancelar,
  bloquesDeEntrada,
  cobroDelDiaDePrueba,
  hayBloquesLibres,
  minutosDeEntrada,
  politicaConAviso,
  politicaDeCancelacion,
  rangoDelBloque,
} from "@/lib/rules/dia-de-prueba";
import type { OcupanteRango } from "@/lib/rules/capacidad";
import type { Pago } from "@/lib/types";

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

describe("politicaDeCancelacion", () => {
  const CORTE = NEGOCIO.diaDePrueba.horasParaCancelarSinCosto;

  it("justo en el corte todavía es sin costo: el umbral es inclusivo", () => {
    expect(politicaConAviso(CORTE)).toEqual({
      horasDeAviso: CORTE,
      sinCosto: true,
      costo: 0,
    });
  });

  it("un minuto menos ya es cancelación tardía", () => {
    const politica = politicaConAviso(CORTE - 1 / 60);
    expect(politica.sinCosto).toBe(false);
    expect(politica.costo).toBe(PRECIOS.cancelacionTardiaDiaDePrueba);
  });

  it("con el día ya empezado también es tardía", () => {
    expect(politicaConAviso(-2).costo).toBe(PRECIOS.cancelacionTardiaDiaDePrueba);
  });

  it("desde las fechas, mide el aviso hasta la llegada", () => {
    const politica = politicaDeCancelacion(
      "2026-09-29T13:00:00.000Z",
      "2026-09-28T13:00:00.000Z",
    );
    expect(politica.horasDeAviso).toBe(24);
    expect(politica.sinCosto).toBe(true);
  });
});

describe("aDevolverAlCancelar", () => {
  const PRECIO = PRECIOS.diaDePrueba;
  const CARGO = PRECIOS.cancelacionTardiaDiaDePrueba;

  it("a tiempo vuelve todo lo pagado", () => {
    expect(aDevolverAlCancelar(politicaConAviso(48), PRECIO)).toBe(PRECIO);
  });

  it("tarde la casa se queda con el cargo y devuelve el resto", () => {
    expect(aDevolverAlCancelar(politicaConAviso(3), PRECIO)).toBe(
      PRECIO - CARGO,
    );
  });

  it("si no pagó, no hay nada que devolver", () => {
    expect(aDevolverAlCancelar(politicaConAviso(48), 0)).toBe(0);
    expect(aDevolverAlCancelar(politicaConAviso(3), 0)).toBe(0);
  });

  it("nunca devuelve en negativo", () => {
    expect(aDevolverAlCancelar(politicaConAviso(3), CARGO - 1000)).toBe(0);
  });
});

describe("cobroDelDiaDePrueba", () => {
  const cobro = (id: string, emitidoEn: string, concepto = "dia_de_prueba") =>
    ({
      id,
      clienteId: "c1",
      concepto,
      referenciaId: "e1",
      monto: 10000,
      estado: "pendiente",
      emitidoEn,
    }) as Pago;

  it("es el primero que se emitió, no el cargo por moverlo tarde", () => {
    const pagos = [
      cobro("cargo", "2026-06-15T10:00:00.000Z"),
      cobro("dia", "2026-06-10T10:00:00.000Z"),
      cobro("otro", "2026-06-01T10:00:00.000Z", "dia_suelto"),
    ];
    expect(cobroDelDiaDePrueba(pagos, "e1")?.id).toBe("dia");
  });
});
