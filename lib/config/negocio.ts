/**
 * Parámetros operativos de La Patoteca, tomados del folleto de agosto 2026.
 * Los montos viven en `precios.ts`; acá están las reglas que no son plata:
 * capacidad, horarios, umbrales, vigencias y requisitos.
 *
 * Todo esto es editable: cambia el valor y las reglas lo respetan.
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
    /**
     * Tramos de la tarifa por tiempo, en horas:
     *   menos de 4 h            → jornada corta
     *   entre 4 y 8 h inclusive → jornada media
     *   más de 8 h              → jornada larga
     */
    horasJornadaCorta: 4,
    horasJornadaMedia: 8,
    /** Margen antes de empezar a cobrar el recargo fuera de horario. */
    minutosGracia: 15,
  },

  diaDePrueba: {
    /**
     * Media jornada de un día de jardín normal: el jardín abre 12 horas
     * (7:00-19:00) y el día de prueba es la mitad.
     */
    horasDeEstadia: 6,
    /** Primera y última hora a la que puede llegar. */
    horaPrimeraEntrada: 7,
    horaUltimaEntrada: 13,
    /**
     * Las llegadas se espacian: dos perros nuevos entrando juntos es una
     * presentación que nadie alcanza a acompañar.
     */
    minutosEntreEntradas: 30,
    /** Cuántos días de prueba se aceptan en un mismo bloque de llegada. */
    maximoPorBloque: 1,
    /** Cancelando con al menos estas horas de aviso no se cobra nada. */
    horasParaCancelarSinCosto: 24,
  },

  hotel: {
    horasPorBloque: 24,
    /** Atraso perdonado en el check-out antes de cobrar horas extra. */
    horasToleranciaCheckout: 2,
    /** Descuentos por duración: umbrales INCLUSIVOS ("desde N noches"). */
    nochesParaDescuento10: 7,
    nochesParaDescuento15: 14,
    /** Fracción del total que se paga al reservar. */
    fraccionAbono: 0.3,
    /** Cancelando con al menos estas horas de aviso, el abono se devuelve entero. */
    horasParaDevolucion: 48,
  },

  planes: {
    /** Mínimo de días que se puede contratar en un plan. */
    minimoDias: 5,
    /**
     * Los planes son MENSUALES y se pagan por adelantado: valen hasta el
     * último día del mes en que se compran. Los días no usados no pasan al mes
     * siguiente.
     */
    vigenciaHastaFinDeMes: true,
    /** Los días del plan se usan de lunes a viernes. */
    soloDiasHabiles: true,
  },

  /**
   * Lo que se le exige a una ficha nueva, por defecto.
   *
   * Es un punto de partida: la configuración de verdad vive en el
   * repositorio (`Configuracion`) para que Administración la cambie
   * sin tocar código. Esto es lo que se usa la primera vez y cuando alguien
   * aprieta "volver a lo de siempre".
   *
   * Un campo entra en esta lista recién cuando el formulario sabe pedirlo:
   * exigir algo que no se puede llenar deja el alta trancada sin explicación.
   */
  altaDePerro: {
    camposObligatorios: [
      "fechaNacimiento",
      "foto",
      "carnetVacunas",
      "alimentacion",
    ],
  },

  admision: {
    pesoMaximoKg: 20,
    /** Las hembras no tienen requisito de esterilización. */
    esterilizacionObligatoriaEnMachos: true,
    /**
     * Desde qué edad se exige la castración de los machos.
     *
     * Antes de eso el veterinario todavía no la indica, así que rechazar a un
     * cachorro de cuatro meses sería rechazarlo por algo que ni siquiera
     * puede hacer.
     */
    mesesParaExigirCastracion: 7,
    vacunasObligatorias: ["octuple", "antirrabica", "kc"],
    /**
     * Cuánto dura cada vacuna desde que se pone.
     *
     * Al dueño se le pide **cuándo se la pusieron**, no hasta cuándo vale: la
     * primera fecha está en el carnet y la segunda es una cuenta. Son valores
     * editables desde Administración porque los protocolos cambian y la KC
     * según la marca dura entre 6 y 12 meses.
     */
    duracionVacunasMeses: { octuple: 12, antirrabica: 12, kc: 12 },
    /** Desparasitación interna y externa al día. */
    exigeDesparasitacion: true,
    /** El perro tiene que ser 100% sociable. */
    exigeSociabilidad: true,
  },

  antiparasitario: {
    /** Lo que dura un antiparasitario según el formato. En meses. */
    duracionesEnMeses: [1, 3],
  },

  /** Un cliente está "activo" si tiene plan vigente con saldo o estadía reciente. */
  clienteActivo: {
    diasDesdeUltimaEstadia: 30,
  },

  spa: {
    /** Perro pequeño: bajo este peso. Desde acá y hasta el máximo, mediano. */
    pesoChicoBajoKg: 10,
    pesoMaximoKg: 25,
    /** El descuento a clientes solo aplica al baño premium. */
    descuentoSoloEnPremium: true,
  },

  traslado: {
    /** Tramos en hora local de Santiago, formato HH:MM. */
    horariosPunta: [
      { desde: "07:00", hasta: "09:00" },
      { desde: "17:00", hasta: "20:00" },
    ],
  },

  reportes: {
    /** Ventanas en que se mandan los 2 o 3 reportes del día. */
    ventanas: [
      { desde: "08:00", hasta: "10:30" },
      { desde: "13:00", hasta: "15:00" },
      { desde: "18:00", hasta: "19:30" },
    ],
  },

  /**
   * Datos para transferir. Van vacíos a propósito: son de la cuenta real del
   * negocio y hay que completarlos antes de cobrarle a alguien. Mientras
   * estén vacíos, la app dice que los datos llegan por WhatsApp.
   */
  transferencia: {
    titular: "",
    rut: "",
    banco: "",
    tipoDeCuenta: "",
    numero: "",
    email: "",
  },

  cobroMensual: {
    /** Día del mes en que se emite la cuenta unificada. */
    diaDelMes: 1,
  },
} as const;

export type TipoVacuna = (typeof NEGOCIO.admision.vacunasObligatorias)[number];
