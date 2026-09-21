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
  diaDePrueba: DiaDePrueba;
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
  conPaseo: boolean;
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
  diasTotales: number;
  diasUsados: number;
  compradoEn: InstanteISO;
  venceEn: FechaISO;
  precio: number;
  /** Si vino de una suscripción recurrente que se recarga el día 1. */
  suscripcionId?: ID;
}

export type EstadoSuscripcion = "activa" | "pausada" | "cancelada";

export interface Suscripcion {
  id: ID;
  clienteId: ID;
  perroId: ID;
  tipo: TipoPlan;
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
