/**
 * Modelo de dominio de La Patoteca.
 *
 * Convenciones de fecha:
 * - `FechaISO`  = "2026-09-21"         (un día del calendario en Santiago)
 * - `InstanteISO` = ISO 8601 completo   (un momento exacto, con offset)
 * Nunca mezcles los dos: el día de una estadía es un dato distinto de la hora
 * exacta en que el perro entró.
 */

export type ID = string;
export type FechaISO = string;
export type InstanteISO = string;

import type { TipoPlan, NivelSpa, DuracionPaseo } from "@/lib/config/precios";
import type { TipoVacuna } from "@/lib/config/negocio";

export type { TipoPlan, NivelSpa, DuracionPaseo, TipoVacuna };

export type Rol = "cliente" | "staff" | "admin";
export type Linea = "hotel" | "jardin";

/* ── Clientes y perros ─────────────────────────────────────────────── */

export type Sexo = "macho" | "hembra";

export interface Vacuna {
  tipo: TipoVacuna;
  fechaAplicacion: FechaISO;
  fechaVencimiento: FechaISO;
}

export type EstadoDiaDePrueba =
  | "pendiente"
  | "agendado"
  | "aprobado"
  | "rechazado";

export interface DiaDePrueba {
  estado: EstadoDiaDePrueba;
  fecha?: FechaISO;
  nota?: string;
}

/**
 * El antiparasitario que le dieron y cuánto le dura.
 *
 * De acá sale `desparasitadoHasta`, que es lo que mira la admisión: el dueño
 * dice cuándo se lo dio y qué duración tiene el formato, y la vigencia se
 * calcula (`vigenciaAntiparasitario` en `lib/rules/perro.ts`). Pedirle la
 * fecha de vencimiento sería pedirle que haga la cuenta él.
 */
export interface Antiparasitario {
  ultimaAplicacion: FechaISO;
  /** 1 o 3 meses, que es lo que traen los formatos que se venden. */
  mesesDeDuracion: number;
  marca?: string;
}

export type Comida = "desayuno" | "almuerzo" | "cena";
export type UnidadRacion = "g" | "taza" | "scoop";

/**
 * Qué come el perro, en campos y no en un párrafo.
 *
 * A la hora de almuerzo nadie lee un texto libre buscando la ración: se mira
 * la marca, cuánto va y en qué comidas. `notas` queda para lo que no cabe en
 * esos campos ("si no come al almuerzo, no insistir").
 *
 * Todo es opcional en el tipo porque los perros cargados antes de que esto
 * existiera no tienen los datos; lo obligatorio al CREAR se valida en
 * `lib/rules/alta-perro.ts`, que es donde la regla se puede cambiar.
 */
export interface Alimentacion {
  marca?: string;
  cantidad?: number;
  unidad?: UnidadRacion;
  comidas: Comida[];
  notas?: string;
}

export interface Medicamento {
  nombre: string;
  dosis: string;
  frecuencia: string;
}

export interface Alergias {
  tiene: boolean;
  detalle?: string;
}

export interface Perro {
  id: ID;
  clienteId: ID;
  nombre: string;
  raza: string;
  pesoKg: number;
  sexo: Sexo;
  esterilizado: boolean;
  fechaNacimiento?: FechaISO;
  fotoUrl?: string;
  vacunas: Vacuna[];
  /**
   * Hasta cuándo está vigente la desparasitación interna y externa.
   * `undefined` = sin registro: avisa, pero no bloquea (los perros cargados
   * antes de que existiera el campo no tienen por qué quedar rechazados).
   */
  desparasitadoHasta?: FechaISO;
  /** El folleto lo exige explícitamente. `undefined` = sin evaluar. */
  sociable?: boolean;
  diaDePrueba: DiaDePrueba;
  /**
   * Fotos del carnet de vacunación, una por hoja.
   *
   * Son varias porque un carnet real tiene las vacunas repartidas en distintas
   * páginas y con una sola foto siempre falta la que importa.
   */
  carnetVacunasUrls?: string[];
  /** De dónde sale `desparasitadoHasta`. Ver `Antiparasitario`. */
  antiparasitario?: Antiparasitario;
  /** Qué come, cuánto y en qué comidas. Ver `Alimentacion`. */
  alimentacion?: Alimentacion;
  /** Remedios que toma todos los días, con dosis y frecuencia. */
  medicamentos?: Medicamento[];
  /** `undefined` = nunca se preguntó; `{tiene:false}` = el dueño dijo que no. */
  alergias?: Alergias;
  /** Remedios, mañas y cuidados especiales: lo que no se puede olvidar. */
  indicaciones?: string;
  /** Todo lo demás, en texto libre. */
  notas?: string;
  creadoEn: InstanteISO;
}

export interface Cliente {
  id: ID;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  comuna: string;
  direccion?: string;
  creadoEn: InstanteISO;
}

/* ── Cotizaciones ──────────────────────────────────────────────────── */

export interface LineaCotizacion {
  concepto: string;
  detalle?: string;
  monto: number;
}

export interface DescuentoAplicado {
  concepto: string;
  /** Fracción: 0.2 = 20%. */
  porcentaje: number;
  /** Monto descontado, siempre positivo. */
  monto: number;
}

/**
 * Resultado de cualquier cálculo de precio. Siempre trae el desglose completo:
 * el cliente tiene que poder ver de dónde sale cada peso.
 */
export interface Cotizacion {
  lineas: LineaCotizacion[];
  subtotal: number;
  descuentos: DescuentoAplicado[];
  total: number;
  /** Solo en hotel: 30% que se paga al reservar. */
  abono?: number;
}

/* ── Hotel ─────────────────────────────────────────────────────────── */

export type EstadoReserva =
  | "pendiente"
  | "confirmada"
  | "en_curso"
  | "finalizada"
  | "cancelada"
  | "no_show";

export interface ReservaHotel {
  id: ID;
  clienteId: ID;
  perroId: ID;
  inicioProgramado: InstanteISO;
  finProgramado: InstanteISO;
  inicioReal?: InstanteISO;
  finReal?: InstanteISO;
  /** Cantidad de paseos contratados durante la estadía, a $4.000 cada uno. */
  paseosContratados: number;
  estado: EstadoReserva;
  cotizacion: Cotizacion;
  abonoPagado: boolean;
  canceladaEn?: InstanteISO;
  creadaEn: InstanteISO;
}

/* ── Jardín ────────────────────────────────────────────────────────── */

export type EstadoEstadia =
  | "esperada"
  | "presente"
  | "finalizada"
  | "cancelada"
  | "no_show";

export type OrigenEstadia = "dia_suelto" | "plan" | "dia_de_prueba";

/** La unidad de asistencia del jardín: un perro, un día. */
export interface EstadiaJardin {
  id: ID;
  clienteId: ID;
  perroId: ID;
  fecha: FechaISO;
  inicioProgramado: InstanteISO;
  finProgramado: InstanteISO;
  /** Hora real de check-in registrada por staff. */
  inicioReal?: InstanteISO;
  /** Hora real de check-out. De acá sale el recargo fuera de horario. */
  finReal?: InstanteISO;
  origen: OrigenEstadia;
  planId?: ID;
  estado: EstadoEstadia;
  cotizacion?: Cotizacion;
  creadaEn: InstanteISO;
}

/* ── Planes y suscripciones ────────────────────────────────────────── */

export interface PlanComprado {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
  /** En el pase libre, los días hábiles que cubre el mes. */
  diasTotales: number;
  diasUsados: number;
  compradoEn: InstanteISO;
  venceEn: FechaISO;
  precio: number;
  /**
   * Los días no son acumulables: comprar un pack nuevo cierra el anterior.
   * Acá queda cuándo se cerró, para que el historial no mienta.
   */
  cerradoEn?: InstanteISO;
  /** Si vino de una suscripción recurrente que se recarga el día 1. */
  suscripcionId?: ID;
}

export type EstadoSuscripcion = "activa" | "pausada" | "cancelada";

export interface Suscripcion {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
  /** Días que se recargan cada mes. Se ignora en el pase libre. */
  diasContratados?: number;
  estado: EstadoSuscripcion;
  creadaEn: InstanteISO;
  proximoCobro: FechaISO;
}

/* ── Servicios spot ────────────────────────────────────────────────── */

export type TipoServicio = "spa" | "paseo" | "traslado";
export type EstadoServicio = "agendado" | "realizado" | "cancelado";

export interface ServicioAgendado {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoServicio;
  fechaHora: InstanteISO;
  /** Solo spa. */
  nivelSpa?: NivelSpa;
  /** Solo paseo. */
  duracionMin?: DuracionPaseo;
  /** Solo traslado. */
  km?: number;
  estado: EstadoServicio;
  cotizacion: Cotizacion;
  creadoEn: InstanteISO;
}

/* ── Pagos ─────────────────────────────────────────────────────────── */

export type MetodoPago = "webpay" | "transferencia" | "efectivo";
export type EstadoPago = "pendiente" | "pagado" | "vencido" | "reembolsado";

export type ConceptoPago =
  | "dia_de_prueba"
  | "abono_hotel"
  | "saldo_hotel"
  | "dia_suelto"
  | "plan"
  | "servicio"
  | "tienda"
  | "cuenta_mensual";

export interface Pago {
  id: ID;
  clienteId: ID;
  concepto: ConceptoPago;
  /** Id de la reserva, estadía, plan, servicio u orden que originó el cobro. */
  referenciaId?: ID;
  /**
   * Si este cobro ya quedó incluido en una cuenta mensual. Deja de ser
   * cobrable por su cuenta: se cobra a través de la cuenta, y contarlo en la
   * cobranza sería cobrarlo dos veces.
   */
  cuentaMensualId?: ID;
  monto: number;
  estado: EstadoPago;
  metodo?: MetodoPago;
  emitidoEn: InstanteISO;
  venceEn?: FechaISO;
  pagadoEn?: InstanteISO;
}

/**
 * La cuenta que se emite el día 1: junta la renovación de las suscripciones
 * con el consolidado de consumos sueltos del mes anterior.
 */
export interface CuentaMensual {
  id: ID;
  clienteId: ID;
  /** Mes consumido, "2026-08". Se emite el día 1 del mes siguiente. */
  periodo: string;
  emitidaEn: InstanteISO;
  renovaciones: LineaCotizacion[];
  consumos: LineaCotizacion[];
  total: number;
  estado: EstadoPago;
}

/* ── Tienda ────────────────────────────────────────────────────────── */

export type CategoriaProducto =
  | "alimento"
  | "snack"
  | "juguete"
  | "accesorio"
  | "higiene";

export interface Producto {
  id: ID;
  nombre: string;
  descripcion: string;
  categoria: CategoriaProducto;
  precio: number;
  stock: number;
  imagenUrl?: string;
  activo: boolean;
}

export interface ItemCarrito {
  productoId: ID;
  cantidad: number;
}

export interface ItemOrden extends ItemCarrito {
  nombre: string;
  precioUnitario: number;
}

export type EstadoOrden = "pendiente" | "pagada" | "entregada" | "cancelada";

export interface OrdenTienda {
  id: ID;
  clienteId: ID;
  items: ItemOrden[];
  total: number;
  estado: EstadoOrden;
  creadaEn: InstanteISO;
}

/* ── Reportes e incidentes ─────────────────────────────────────────── */

/** Un reporte puede ir a varios perros a la vez (la foto de la manada). */
export interface Reporte {
  id: ID;
  perroIds: ID[];
  fecha: FechaISO;
  nota: string;
  fotoUrl?: string;
  autorStaff: string;
  creadoEn: InstanteISO;
}

export type TipoIncidente =
  | "comportamiento"
  | "salud"
  | "pelea"
  | "escape"
  | "otro";

export type GravedadIncidente = "leve" | "moderado" | "grave";

export interface Incidente {
  id: ID;
  perroId: ID;
  fecha: FechaISO;
  tipo: TipoIncidente;
  gravedad: GravedadIncidente;
  descripcion: string;
  autorStaff: string;
  creadoEn: InstanteISO;
}

/* ── Mensajería saliente ───────────────────────────────────────────── */

export type CanalMensaje = "whatsapp" | "email" | "sms";

/**
 * Estados que reporta WhatsApp Business por webhook. `pendiente` y `enviando`
 * son nuestros; el resto viene del proveedor.
 */
export type EstadoMensaje =
  | "pendiente"
  | "enviando"
  | "enviado"
  | "entregado"
  | "leido"
  | "fallido";

export interface ReferenciaMensaje {
  tipo: "reporte" | "incidente" | "reserva" | "pago";
  id: ID;
}

export interface MensajeSaliente {
  id: ID;
  canal: CanalMensaje;
  clienteId: ID;
  /** Teléfono en E.164, como lo exige WhatsApp: +56912345678. */
  destino: string;
  /** Nombre de la plantilla aprobada en WhatsApp Manager. */
  plantilla: string;
  idioma: string;
  /** Parámetros posicionales de la plantilla, en orden. */
  parametros: string[];
  /** Texto ya armado, para mostrarlo en la app sin volver a renderizar. */
  vistaPrevia: string;
  adjuntoUrl?: string;
  referencia?: ReferenciaMensaje;
  estado: EstadoMensaje;
  intentos: number;
  error?: string;
  /** Id que devolvió el proveedor, para cruzar con sus webhooks. */
  idProveedor?: string;
  creadoEn: InstanteISO;
  actualizadoEn: InstanteISO;
}

/* ── Ocupación ─────────────────────────────────────────────────────── */

/** Un slot de 30 minutos con su carga. */
export interface SlotOcupacion {
  /** Minutos desde la medianoche de Santiago: 450 = 07:30. */
  minutoDelDia: number;
  hotel: number;
  jardin: number;
  total: number;
}

/**
 * Vista unificada que consultan capacidad, calendario y KPIs.
 *
 * OJO: `pico` (máximo simultáneo) y `perrosDistintos` (cuántos pasaron) son
 * números distintos y no intercambiables. El cupo de 25 se mide contra `pico`.
 */
export interface OcupacionDia {
  fecha: FechaISO;
  slots: SlotOcupacion[];
  pico: number;
  picoMinutoDelDia: number;
  perrosDistintos: number;
  perrosHotel: number;
  perrosJardin: number;
}

/* ── Configuración editable desde Administración ───────────────────── */

/**
 * Los campos del alta que Administración puede exigir o no.
 *
 * `NEGOCIO` es una constante de compilación: sirve para lo que no cambia
 * nunca (el máximo de 25 cupos), pero no para algo que la dueña quiera
 * ajustar un martes sin llamar a nadie. Por eso esto vive en el repositorio,
 * como cualquier otro dato.
 */
export type CampoDeAlta =
  | "fechaNacimiento"
  | "foto"
  | "carnetVacunas"
  | "alimentacion"
  | "antiparasitario";

/** Las listas que el formulario ofrece en un desplegable. */
export interface Catalogos {
  razas: string[];
  marcasComida: string[];
  marcasAntiparasitario: string[];
}

export type NombreDeCatalogo = keyof Catalogos;

export interface Configuracion {
  vacunasObligatorias: TipoVacuna[];
  /** Cuánto dura cada vacuna desde que se pone, en meses. */
  duracionVacunasMeses: Record<TipoVacuna, number>;
  camposObligatorios: CampoDeAlta[];
  catalogos: Catalogos;
  actualizadoEn: InstanteISO;
}

/* ── Avisos para Administración ────────────────────────────────────── */

export interface CambioDeCampo {
  /** Cómo se llama el campo en pantalla: "Peso", "Comida"… */
  campo: string;
  antes?: string;
  despues?: string;
}

/**
 * Un aviso para Administración de algo que hizo el dueño.
 *
 * Guarda el antes y el después de cada campo: "cambió la ficha" no le sirve a
 * nadie; "el peso pasó de 8 a 12 kg" es un dato que puede cambiar la
 * admisión.
 */
export interface Notificacion {
  id: ID;
  clienteId: ID;
  perroId?: ID;
  titulo: string;
  cambios: CambioDeCampo[];
  leida: boolean;
  creadaEn: InstanteISO;
}
