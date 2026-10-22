/**
 * Los bloques de llegada del día de prueba.
 *
 * El día de prueba es media jornada de jardín, y la llegada se elige en
 * bloques de 30 minutos. Dos perros nuevos entrando juntos es una
 * presentación que nadie alcanza a acompañar, así que **por bloque se acepta
 * uno solo**, aparte del cupo general de la casa.
 *
 * Todo lo de acá es puro: recibe la ocupación ya armada y no sabe que existe
 * un repositorio.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { verificarCapacidad, type OcupanteRango } from "@/lib/rules/capacidad";
import { horasEntre, instanteEn } from "@/lib/utils/fecha";
import type { FechaISO, ID, InstanteISO } from "@/lib/types";

export type MotivoNoDisponible = "pasado" | "tomado" | "sin_cupo";

export interface BloqueDeEntrada {
  /** Minutos desde la medianoche de Santiago: 450 = 07:30. */
  minutoDelDia: number;
  inicio: InstanteISO;
  fin: InstanteISO;
  disponible: boolean;
  motivo?: MotivoNoDisponible;
}

export const MOTIVO_EN_PALABRAS: Record<MotivoNoDisponible, string> = {
  pasado: "Ya pasó",
  tomado: "Ocupado por otro perrito que viene por primera vez",
  sin_cupo: "La casa está llena a esa hora",
};

/** Los minutos a los que se puede llegar, según la configuración. */
export function minutosDeEntrada(): number[] {
  const { horaPrimeraEntrada, horaUltimaEntrada, minutosEntreEntradas } =
    NEGOCIO.diaDePrueba;

  const minutos: number[] = [];
  for (
    let minuto = horaPrimeraEntrada * 60;
    minuto <= horaUltimaEntrada * 60;
    minuto += minutosEntreEntradas
  ) {
    minutos.push(minuto);
  }
  return minutos;
}

/** Cuándo empieza y cuándo termina si llega a esa hora. */
export function rangoDelBloque(
  fecha: FechaISO,
  minutoDelDia: number,
): { inicio: InstanteISO; fin: InstanteISO } {
  return {
    inicio: instanteEn(fecha, minutoDelDia),
    fin: instanteEn(
      fecha,
      minutoDelDia + NEGOCIO.diaDePrueba.horasDeEstadia * 60,
    ),
  };
}

export interface EntradaDeBloques {
  fecha: FechaISO;
  /** Quiénes ya ocupan la casa ese día, hotel y jardín juntos. */
  ocupantes: OcupanteRango[];
  /** A qué minuto llegan los días de prueba ya agendados. */
  diasDePruebaTomados: number[];
  /** Perro que quiere entrar, para no contarlo contra sí mismo. */
  perroId: ID;
  /**
   * Minuto del día en que estamos, si la fecha es hoy. Sin esto, ningún
   * bloque se marca como pasado.
   */
  minutoActual?: number;
}

export function bloquesDeEntrada({
  fecha,
  ocupantes,
  diasDePruebaTomados,
  perroId,
  minutoActual,
}: EntradaDeBloques): BloqueDeEntrada[] {
  const tomados = new Set(diasDePruebaTomados);

  return minutosDeEntrada().map((minutoDelDia) => {
    const { inicio, fin } = rangoDelBloque(fecha, minutoDelDia);

    const motivo = ((): MotivoNoDisponible | undefined => {
      if (minutoActual !== undefined && minutoDelDia < minutoActual) {
        return "pasado";
      }
      if (tomados.has(minutoDelDia)) return "tomado";

      const capacidad = verificarCapacidad(
        [{ perroId, linea: "jardin", inicio, fin }],
        ocupantes,
      );
      return capacidad.hayCupo ? undefined : "sin_cupo";
    })();

    return { minutoDelDia, inicio, fin, disponible: !motivo, motivo };
  });
}

/** Si un día tiene al menos una hora libre. Para pintar el calendario. */
export function hayBloquesLibres(bloques: BloqueDeEntrada[]): boolean {
  return bloques.some((b) => b.disponible);
}

/* ── Cambiar o cancelar ────────────────────────────────────────────── */

export interface PoliticaDeCancelacion {
  /** Horas que faltan para la llegada. Negativo si ya pasó. */
  horasDeAviso: number;
  /** Con aviso suficiente no se cobra nada. */
  sinCosto: boolean;
  /** Lo que cuesta cancelar o cambiar ahora. */
  costo: number;
}

/**
 * Lo que cuesta cancelar o mover el día de prueba con tantas horas de aviso.
 *
 * Separada de `politicaDeCancelacion` porque en la nube las horas las mide la
 * base con su propio reloj, y lo que vuelve es ese número: la regla tiene que
 * poder aplicarse a él sin rehacer la cuenta con la hora del navegador.
 */
export function politicaConAviso(horasDeAviso: number): PoliticaDeCancelacion {
  const sinCosto = horasDeAviso >= NEGOCIO.diaDePrueba.horasParaCancelarSinCosto;

  return {
    horasDeAviso,
    sinCosto,
    costo: sinCosto ? 0 : PRECIOS.cancelacionTardiaDiaDePrueba,
  };
}

export function politicaDeCancelacion(
  inicioProgramado: InstanteISO,
  ahora: InstanteISO = new Date().toISOString(),
): PoliticaDeCancelacion {
  return politicaConAviso(horasEntre(ahora, inicioProgramado));
}
