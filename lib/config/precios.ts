/**
 * Única fuente de verdad de los montos de La Patoteca. Todo en pesos chilenos,
 * enteros, sin decimales.
 *
 * Los valores vienen del folleto oficial de agosto 2026. Están acá justamente
 * para poder cambiarlos: ajusta el número y las reglas, los tests y todas las
 * pantallas se acomodan solas.
 *
 * Si necesitas un precio en un componente, impórtalo desde acá.
 * Un monto escrito a mano en una pantalla es un bug.
 */

export const PRECIOS = {
  /** Evaluación obligatoria antes de la primera reserva de un perro. */
  diaDePrueba: 10_000,

  jardin: {
    /**
     * Tarifas por tiempo. Los tramos se definen en `negocio.ts` y estos son
     * sus precios: corta, media y larga.
     */
    jornadaCorta: 10_000,
    jornadaMedia: 16_000,
    jornadaLarga: 18_000,
    /** Por hora iniciada después del cierre, según el check-out real. */
    horaFueraDeHorario: 1_000,
  },

  planes: {
    /**
     * Los planes se cobran POR DÍA, y el precio por día baja según cuántos se
     * contraten. Los tramos se evalúan de arriba abajo.
     */
    tramosPorDia: [
      { desdeDias: 5, hastaDias: 10, precioPorDia: 15_000 },
      { desdeDias: 11, hastaDias: null, precioPorDia: 14_000 },
    ],
    /** Precio fijo mensual por todos los días hábiles del mes. */
    paseLibre: 220_000,
  },

  hotel: {
    /** Cada bloque de 24 horas de alojamiento. */
    bloque24h: 24_000,
    /** Por hora iniciada una vez agotada la tolerancia de check-out. */
    horaExtra: 1_000,
    /** Adicional opcional por paseo de 30 min durante la estadía. */
    paseo: 4_000,
  },

  spa: {
    express: { chico: 13_000, grande: 18_000 },
    premium: { chico: 25_000, grande: 30_000 },
  },

  paseo: {
    30: 5_000,
    60: 10_000,
  },

  /**
   * Traslados: matriz de tramo de distancia por horario. El último tramo tiene
   * `hastaKm: null` y cubre todo lo que venga más lejos.
   */
  traslado: {
    tramos: [
      { hastaKm: 5, normal: 8_000, punta: 10_000 },
      { hastaKm: 10, normal: 12_000, punta: 15_000 },
    ],
  },
} as const;

/**
 * Descuentos como fracción (0.10 = 10%).
 *
 * Se aplican ACUMULADOS EN CASCADA, en el orden en que están declarados acá.
 * Ver `lib/rules/descuentos.ts`.
 */
export const DESCUENTOS = {
  /** Hotel desde 7 noches. */
  hotelDesde7Noches: 0.1,
  /** Hotel desde 14 noches. Reemplaza al anterior, no se suma. */
  hotelDesde14Noches: 0.15,
  /** Hotel, adicional, si el cliente tiene un plan de jardín vigente. */
  hotelConPlanDeJardin: 0.1,
  /** Desde el segundo perro del mismo dueño en el mismo día o reserva. */
  segundoPerro: 0.2,
  /** Spa premium y paseos sueltos, para clientes activos. */
  clienteActivo: 0.2,
} as const;

/** Un plan es por días contratados, o el pase libre del mes. */
export type TipoPlan = "dias" | "pase_libre";
export type NivelSpa = keyof typeof PRECIOS.spa;
export type DuracionPaseo = 30 | 60;
