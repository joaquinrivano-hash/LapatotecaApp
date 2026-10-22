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
import type { FechaISO, ID, InstanteISO, Pago } from "@/lib/types";

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

/**
 * El cobro DEL DÍA de prueba: el primero que se emitió.
 *
 * Los que vienen después son cargos por moverlo encima de la hora, y esos no
 * se tocan al cancelar: cada aviso tardío se cobra, y cancelar después a
 * tiempo no borra el anterior.
 */
export function cobroDelDiaDePrueba(
  pagos: Pago[],
  estadiaId: ID,
): Pago | undefined {
  return pagos
    .filter((p) => p.referenciaId === estadiaId && p.concepto === "dia_de_prueba")
    .sort(
      (a, b) =>
        a.emitidoEn.localeCompare(b.emitidoEn) || a.id.localeCompare(b.id),
    )[0];
}

/**
 * Cuánto de lo ya pagado vuelve al cancelar.
 *
 * A tiempo, todo. Tarde, la casa se queda con el cargo y devuelve el resto:
 * quien pagó $10.000 y cancela sobre la hora debe $5.000, no $10.000.
 */
export function aDevolverAlCancelar(
  politica: PoliticaDeCancelacion,
  pagado: number,
): number {
  return politica.sinCosto ? pagado : Math.max(0, pagado - politica.costo);
}

export interface CobroPerdonado {
  id: ID;
  cambios: Partial<Pago>;
}

/**
 * Qué pasa con los cobros de un día de prueba que la casa perdona.
 *
 * Es el cliente antiguo: viene hace tiempo, se inscribe en la app y alcanzó
 * a agendar su día de prueba antes de que Administración lo aprobara. No es
 * una cancelación del dueño —la decide la casa—, así que no hay política de
 * aviso: se perdona entero, también el cargo por moverlo tarde, porque nunca
 * debió tener que agendarlo.
 *
 * Igual que una cancelación a tiempo:
 *
 * - **Pendiente** → anulado: queda reembolsado en cero, que es la constancia
 *   de que existió. No hay plata que mover.
 * - **Pagado** → reembolsado conservando el monto: es lo que se le debe, y
 *   lo que aparece en "Por devolver".
 * - **Ya reembolsado** → no se toca. Así perdonar dos veces no hace nada.
 */
export function perdonarCobrosDelDiaDePrueba(
  pagos: Pago[],
  estadiaId: ID,
): { cobros: CobroPerdonado[]; aDevolver: number } {
  const cobros: CobroPerdonado[] = [];
  let aDevolver = 0;

  for (const pago of pagos) {
    if (pago.referenciaId !== estadiaId || pago.concepto !== "dia_de_prueba") {
      continue;
    }
    if (pago.estado === "pagado") {
      aDevolver += pago.monto;
      cobros.push({
        id: pago.id,
        cambios: { estado: "reembolsado", venceEn: undefined },
      });
    } else if (pago.estado === "pendiente" || pago.estado === "vencido") {
      cobros.push({
        id: pago.id,
        cambios: {
          monto: 0,
          estado: "reembolsado",
          pagadoEn: undefined,
          venceEn: undefined,
        },
      });
    }
  }

  return { cobros, aDevolver };
}
