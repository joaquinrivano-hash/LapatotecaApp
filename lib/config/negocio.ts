/**
 * Parámetros operativos de La Patoteca. Los montos viven en `precios.ts`;
 * acá están las reglas que no son plata: capacidad, horarios, umbrales,
 * vigencias y requisitos de admisión.
 */

export const NEGOCIO = {
  zonaHoraria: "America/Santiago",

  capacidad: {
    /**
     * Máximo de perros SIMULTÁNEOS, compartido entre hotel y jardín.
     * No son 25 de cada uno: es un solo espacio físico.
     */
    maximoSimultaneo: 25,
    /**
     * Granularidad con la que se valida el traslape. Con 30 minutos, un perro
     * que sale a las 13:00 libera el cupo para otro que entra a las 13:30.
     */
    minutosPorSlot: 30,
  },

  jardin: {
    horaApertura: 7,
    horaCierre: 19,
    /** Hasta estas horas inclusive se cobra la jornada corta. */
    horasJornadaCorta: 6,
    /** Margen antes de empezar a cobrar el recargo fuera de horario. */
    minutosGracia: 15,
  },

  hotel: {
    horasPorBloque: 24,
    /** Atraso perdonado en el check-out antes de cobrar horas extra. */
    horasToleranciaCheckout: 2,
    /** Descuentos por duración: umbrales ESTRICTOS (más de N bloques). */
    bloquesParaDescuento10: 7,
    bloquesParaDescuento15: 14,
    /** Fracción del total que se paga al reservar. */
    fraccionAbono: 0.3,
    /** Cancelando con al menos estas horas de aviso, el abono se devuelve entero. */
    horasParaDevolucion: 48,
  },

  planes: {
    /** Días corridos desde la compra para usar los días del pack. */
    vigenciaDias: { p5: 15, p20: 45 },
  },

  admision: {
    pesoMaximoKg: 20,
    /** Las hembras no tienen requisito de esterilización. */
    esterilizacionObligatoriaEnMachos: true,
    vacunasObligatorias: ["sextuple", "antirrabica", "traqueobronquitis"],
  },

  /** Un cliente está "activo" si tiene plan vigente con saldo o estadía reciente. */
  clienteActivo: {
    diasDesdeUltimaEstadia: 30,
  },

  spa: {
    /** Hasta este peso el spa cobra tarifa de perro chico. */
    pesoMaximoChicoKg: 10,
  },

  traslado: {
    kmIncluidos: 5,
    /** Tramos en hora local de Santiago, formato HH:MM. */
    horariosPunta: [
      { desde: "07:00", hasta: "09:30" },
      { desde: "18:00", hasta: "20:00" },
    ],
  },

  cobroMensual: {
    /** Día del mes en que se emite la cuenta unificada. */
    diaDelMes: 1,
  },
} as const;

export type TipoVacuna = (typeof NEGOCIO.admision.vacunasObligatorias)[number];
