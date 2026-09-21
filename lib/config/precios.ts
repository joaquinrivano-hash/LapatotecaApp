/**
 * Única fuente de verdad de los montos de La Patoteca. Todo en pesos chilenos,
 * enteros, sin decimales.
 *
 * Si necesitas un precio en un componente, impórtalo desde acá.
 * Un monto escrito a mano en una pantalla es un bug.
 */

export const PRECIOS = {
  /** Evaluación obligatoria antes de la primera reserva de un perro. */
  diaDePrueba: 10_000,

  jardin: {
    /** Jornada de hasta 6 horas inclusive. */
    diaSueltoCorto: 10_000,
    /** Jornada de más de 6 horas. */
    diaSueltoLargo: 18_000,
    /** Por hora iniciada después del cierre, según el check-out real. */
    horaFueraDeHorario: 1_000,
  },

  planes: {
    p5: { dias: 5, precio: 75_000, nombre: "Plan 5 días" },
    p20: { dias: 20, precio: 200_000, nombre: "Plan 20 días" },
  },

  hotel: {
    /** Cada bloque de 24 horas de alojamiento. */
    bloque24h: 24_000,
    /** Por hora iniciada una vez agotada la tolerancia de check-out. */
    horaExtra: 1_000,
    /** Adicional opcional por paseo durante la estadía. */
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

  traslado: {
    /** Cubre hasta NEGOCIO.traslado.kmIncluidos. */
    base: 8_000,
    porKmAdicional: 700,
    recargoHorarioPunta: 2_000,
    /** El traslado nunca cobra más que esto. */
    tope: 15_000,
  },
} as const;

/**
 * Descuentos como fracción (0.10 = 10%).
 *
 * Se aplican ACUMULADOS EN CASCADA, en el orden en que están declarados acá:
 * primero duración, después segundo perro, después cliente activo.
 * Ver `lib/rules/descuentos.ts`.
 */
export const DESCUENTOS = {
  /** Hotel con más de 7 bloques de 24h. */
  hotelSobre7Dias: 0.1,
  /** Hotel con más de 14 bloques de 24h. Reemplaza al anterior, no se suma. */
  hotelSobre14Dias: 0.15,
  /** Desde el segundo perro del mismo dueño en la misma reserva. */
  segundoPerro: 0.2,
  /** Spa y paseos sueltos para clientes activos. */
  clienteActivo: 0.2,
} as const;

export type TipoPlan = keyof typeof PRECIOS.planes;
export type NivelSpa = keyof typeof PRECIOS.spa;
export type DuracionPaseo = 30 | 60;
