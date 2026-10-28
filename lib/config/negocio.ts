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
    /**
     * Cancelando con al menos estas horas de aviso, el día se devuelve: el
     * cobro se anula y, si venía de un plan, el día vuelve al pack.
     *
     * Son 24 y no las 48 del hotel porque es un solo día: pedir dos días de
     * aviso para cancelar una jornada suelta deja sin salida a cualquiera
     * que se enferme el día antes. Con menos aviso el cupo ya no se alcanza
     * a revender, así que el día se pierde.
     */
    horasParaCancelarSinCosto: 24,
  },

  asistencia: {
    /**
     * Hasta cuántos minutos de desfase entre lo que pasó y cuándo se marcó
     * se considera "al día".
     *
     * Marcar exactamente en el instante es imposible con un perro en brazos,
     * así que un par de minutos no es un atraso: es la vida real. Avisar de
     * eso sería enseñarle a la pantalla a quejarse de nada, y una pantalla
     * que se queja de nada se deja de mirar.
     */
    minutosDeMarcaAlDia: 5,
    /**
     * Margen antes de llamar "temprano" o "tarde" a una llegada o un retiro.
     *
     * Un perro que llega diez minutos antes de lo agendado no llegó
     * temprano: llegó. Sin este margen, el análisis diría que casi nadie es
     * puntual, que es una manera elegante de no decir nada.
     */
    minutosDePuntualidad: 15,
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
    fraccionAbono: 0.5,
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
   * Las tareas del día, sacadas de cómo trabaja la casa en el grupo de
   * WhatsApp "La Patoteca REPORTES" (marzo a octubre de 2026).
   */
  tareas: {
    /**
     * Las tres pasadas del día. Cada una empieza con la ventana de reportes
     * del mismo orden (`reportes.ventanas`), y la de la mañana desde que
     * abre la casa: el desayuno se sirve antes de las 8.
     */
    rondas: [
      { clave: "manana", nombre: "Mañana", comida: "Desayuno", comieron: "Desayunaron" },
      { clave: "mediodia", nombre: "Mediodía", comida: "Almuerzo", comieron: "Almorzaron" },
      { clave: "tarde", nombre: "Tarde", comida: "Cena", comieron: "Cenaron" },
    ],
    /**
     * Lo que se hace en cada ronda, en el orden en que aparece en los
     * reportes. `conHora` es porque el grupo lo anota con la hora
     * ("Se limpiaron cacas (14:30)"): el turno siguiente quiere saber
     * cuánto hace.
     */
    pasosDeRonda: [
      { clave: "comida", titulo: "Comida", hecho: "Comieron", conHora: false },
      {
        clave: "cacas",
        titulo: "Recoger cacas y limpiar pipís",
        hecho: "Se recogieron cacas y limpiaron pipís",
        conHora: true,
      },
      {
        clave: "aguas",
        titulo: "Cambiar las aguas",
        hecho: "Se cambiaron las aguas",
        conHora: true,
      },
      {
        clave: "reportes",
        titulo: "Mandar los reportes a los dueños",
        hecho: "Se mandaron todos los reportes",
        conHora: false,
      },
    ],
    /**
     * La rutina de aseo que se ofrece cargar cuando todavía no hay ninguna.
     * Es un punto de partida armado con lo que más aparece en los reportes
     * —la cerámica casi todos los días, el paseo como el pendiente que más
     * se repite— y con las instrucciones que se fueron dando en el grupo.
     * Administración la ajusta después: los días, el orden, el texto.
     *
     * Días: 0 = domingo … 6 = sábado.
     */
    rutinaSugerida: [
      { titulo: "Barrer y trapear cerámica", dias: [0, 1, 2, 3, 4, 5, 6], ronda: "manana",
        instrucciones: "Lavar el trapero y trapear dos veces. No echar tanto lavapiso por vez." },
      { titulo: "Paseo de la mañana", dias: [0, 1, 2, 3, 4, 5, 6], ronda: "manana" },
      { titulo: "Barrer patio y hojas", dias: [0, 1, 2, 3, 4, 5, 6] },
      { titulo: "Cambiar bolsas de basura", dias: [0, 1, 2, 3, 4, 5, 6] },
      { titulo: "Cambiar sabanillas sucias", dias: [0, 1, 2, 3, 4, 5, 6] },
      { titulo: "Paseo de la tarde", dias: [0, 1, 2, 3, 4, 5, 6], ronda: "tarde" },
      { titulo: "Lavandería: lavar y colgar", dias: [1, 3, 5],
        instrucciones: "Llenar 3/4 del tanque, una tapita de detergente y 1/4 de suavizante. 45 a 59 minutos según lo gruesas que sean las cosas. Todo lo que está en el suelo de la lavandería se lava." },
      { titulo: "Barrer y trapear madera (entrada y piezas)", dias: [1, 4] },
      { titulo: "Limpiar paredes del living", dias: [1],
        instrucciones: "Patas marcadas en ventanas, pipís, guardapolvos y puertas, sobre todo abajo y alrededor de las manillas." },
      { titulo: "Lavar y enjuagar patio", dias: [2],
        instrucciones: "Mojar el piso, poco detergente (hace mucha espuma), refregar y enjuagar. Después enzimático en gotitas por todos lados, refregar de nuevo y enjuagar bien. Si llueve, queda para cuando pare." },
      { titulo: "Limpiar cocina", dias: [2, 6],
        instrucciones: "Mover todos los muebles que se puedan y barrer y trapear por debajo. Limpiar el microondas por dentro y por abajo." },
      { titulo: "Limpiar baños", dias: [3] },
      { titulo: "Limpiar ventanas", dias: [3] },
      { titulo: "Lavar pérgola y zona techo verde", dias: [4],
        instrucciones: "Echar el enzimático antes de enjuagar. Sacar los pelos del desagüe de la pérgola." },
      { titulo: "Cambiar y lavar cubresillón", dias: [5],
        instrucciones: "59 minutos de lavado. Si tiene hoyos, se cosen: hilo y aguja en el primer cajón de la sala de comidas." },
      { titulo: "Barrer y trapear frontis y vereda", dias: [5] },
      { titulo: "Pasto: vinagre y bicarbonato", dias: [6],
        instrucciones: "Sacar primero los pelos del pasto, sobre todo cerca de la cerámica y alrededor de la manguera." },
      { titulo: "Trapear pieza de comidas y camas", dias: [0],
        instrucciones: "Sin perros adentro." },
    ],
  },

  /**
   * Datos para transferir de fábrica. Van vacíos a propósito: son de la
   * cuenta real del negocio y los completa Administración en
   * /admin/configuracion (`Configuracion.transferencia`). Mientras estén
   * vacíos, la app dice que los datos llegan por WhatsApp.
   */
  transferencia: {
    titular: "",
    rut: "",
    banco: "",
    tipoDeCuenta: "",
    numero: "",
    email: "",
  },

  /**
   * Dónde está la casa: Providencia, cerca de Diagonal Oriente con Manuel
   * Montt. El buscador de direcciones prioriza lo que queda cerca de acá,
   * así "Italia 1500" sugiere la avenida de Ñuñoa y no una calle de Arica.
   *
   * También es contra lo que se mide si alguien fichó en la casa, así que
   * tiene que ser el punto exacto de la puerta y no el de la esquina: un
   * punto corrido 200 metros haría que todos los fichajes salieran lejos.
   */
  ubicacion: {
    lat: -33.4436,
    lng: -70.6189,
    /** Hasta dónde se prioriza, en metros. Más lejos igual aparece. */
    radioSugerenciasM: 25_000,
  },

  cobroMensual: {
    /** Día del mes en que se emite la cuenta unificada. */
    diaDelMes: 1,
  },

  /** La planilla de turnos. */
  turnos: {
    /**
     * Las horas que la planilla tiene que cubrir.
     *
     * Son las de atención del folleto, no las 24 del día. La casa funciona
     * 24/7 y de noche quedan los perros de hotel durmiendo, pero eso no es
     * una pregunta de planilla: la dueña vive ahí. Marcar cada noche como
     * descubierta haría que el aviso rojo apareciera los siete días y
     * entonces se deja de mirar, justo cuando aparezca el que importa.
     */
    horasQueSeCubren: { desde: "07:00", hasta: "21:00" },
    /** Fichar al minuto exacto no lo hace nadie. */
    minutosDeTolerancia: 10,
    /**
     * Hasta dónde un fichaje cuenta como "en la casa", en metros. No es
     * cero porque el GPS adentro de una casa se corre unas decenas de
     * metros, y una planilla que acusa a todos de fichar en la calle se
     * deja de mirar.
     */
    radioDeLaCasaM: 150,
    /**
     * Con menos precisión que esto, el celular no sabe dónde está: un
     * punto de ±2 km sacado de la antena no dice ni sí ni no.
     */
    precisionMaximaM: 150,
  },
} as const;

export type TipoVacuna = (typeof NEGOCIO.admision.vacunasObligatorias)[number];
