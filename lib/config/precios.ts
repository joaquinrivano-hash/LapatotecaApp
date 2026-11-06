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

/**
 * Paseos, del flyer "Paseos".
 *
 * La unidad es el tramo de 15 minutos; media hora son dos. El flyer no
 * vende paseos de una hora, así que la app tampoco.
 *
 * Vive fuera de PRECIOS porque el hotel cobra EXACTAMENTE esto por los
 * paseos de la estadía: el flyer dice "puedes incluir paseos a la estadía
 * de tu perrito", así que es el mismo precio y tiene que salir del mismo
 * lugar. Dos copias se desincronizan la primera vez que una suba.
 */
const PASEO = {
  15: 2_000,
  30: 4_000,
} as const;

/**
 * La promo del flyer: cada TRES paseos de la misma duración salen menos
 * que comprados sueltos. Son totales, no el precio de cada uno.
 */
const PASEO_PACK_3 = {
  15: 5_000,
  30: 10_000,
} as const;

export const PRECIOS = {
  /** Evaluación obligatoria antes de la primera reserva de un perro. */
  diaDePrueba: 10_000,
  /**
   * Lo que se cobra si el día de prueba se cancela con menos de 24 horas.
   * Reemplaza al cobro del día: no se suma.
   */
  cancelacionTardiaDiaDePrueba: 5_000,

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
    /** Paseo de 30 min durante la estadía. Es el mismo del flyer. */
    paseo: PASEO[30],
    /** El mismo adicional, en 15 min. */
    paseoCorto: PASEO[15],
  },

  /**
   * Baño, del afiche "Spa para perritos".
   *
   * El precio depende del LARGO DEL PELO y del tamaño, no de un nivel de
   * servicio: antes había express y premium, y eso no existe en el afiche.
   * Bañar a un peludo toma más tiempo y más secado, que es lo que se cobra.
   */
  spa: {
    peloCorto: { chico: 18_000, grande: 25_000 },
    peloLargo: { chico: 24_000, grande: 30_000 },
  },

  paseo: PASEO,
  paseoPack3: PASEO_PACK_3,

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
export type DuracionPaseo = 15 | 30;

/** Cuántos paseos entran en la promo del flyer. */
export const PASEOS_POR_PACK = 3;
