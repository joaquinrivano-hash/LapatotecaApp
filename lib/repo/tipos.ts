/**
 * Contrato de acceso a datos.
 *
 * La UI habla SOLO con estas interfaces, nunca con el seed ni con
 * localStorage. Hoy las implementa `RepositorioLocal` sobre datos mock;
 * mañana las implementará `RepositorioSupabase` y no habrá que tocar ni un
 * componente.
 *
 * Por eso todo es `Promise` desde ahora, aunque la implementación local
 * responda al instante: cuando entre la red, la firma no cambia.
 *
 * Si para armar una pantalla necesitas saltarte el repositorio, el que está
 * mal es el repositorio: agrégale el método.
 */

import type {
  Cliente,
  Configuracion,
  CuentaMensual,
  EstadiaJardin,
  FechaISO,
  ID,
  Incidente,
  MensajeSaliente,
  Notificacion,
  OrdenTienda,
  Pago,
  Perro,
  PlanComprado,
  Producto,
  Reporte,
  ReservaHotel,
  ServicioAgendado,
  Suscripcion,
  Turno,
  InstanteISO,
  Rol,
} from "@/lib/types";

/** Datos para crear una entidad: el id lo pone el repositorio. */
export type SinId<T> = Omit<T, "id">;

export interface ColeccionRepo<T extends { id: ID }> {
  listar(): Promise<T[]>;
  obtener(id: ID): Promise<T | null>;
  crear(datos: SinId<T>): Promise<T>;
  actualizar(id: ID, cambios: Partial<SinId<T>>): Promise<T>;
  /** Guarda varias entidades ya existentes de una vez. */
  guardarVarios(entidades: T[]): Promise<T[]>;
  eliminar(id: ID): Promise<void>;
}

export interface ClienteRepo extends ColeccionRepo<Cliente> {
  /** Busca por nombre, apellido, email o teléfono. */
  buscar(texto: string): Promise<Cliente[]>;
}

export interface PerroRepo extends ColeccionRepo<Perro> {
  porCliente(clienteId: ID): Promise<Perro[]>;
  /** Busca por nombre del perro o del dueño. */
  buscar(texto: string): Promise<Perro[]>;
}

export interface ReservaHotelRepo extends ColeccionRepo<ReservaHotel> {
  porCliente(clienteId: ID): Promise<ReservaHotel[]>;
  porPerro(perroId: ID): Promise<ReservaHotel[]>;
  /** Reservas que se traslapan con el rango, aunque hayan empezado antes. */
  enRango(desde: FechaISO, hasta: FechaISO): Promise<ReservaHotel[]>;
}

export interface EstadiaJardinRepo extends ColeccionRepo<EstadiaJardin> {
  porFecha(fecha: FechaISO): Promise<EstadiaJardin[]>;
  porCliente(clienteId: ID): Promise<EstadiaJardin[]>;
  porPerro(perroId: ID): Promise<EstadiaJardin[]>;
  enRango(desde: FechaISO, hasta: FechaISO): Promise<EstadiaJardin[]>;
}

export interface PlanRepo extends ColeccionRepo<PlanComprado> {
  porCliente(clienteId: ID): Promise<PlanComprado[]>;
  porPerro(perroId: ID): Promise<PlanComprado[]>;
}

export interface SuscripcionRepo extends ColeccionRepo<Suscripcion> {
  porCliente(clienteId: ID): Promise<Suscripcion[]>;
  activas(): Promise<Suscripcion[]>;
}

export interface ServicioRepo extends ColeccionRepo<ServicioAgendado> {
  porCliente(clienteId: ID): Promise<ServicioAgendado[]>;
  porPerro(perroId: ID): Promise<ServicioAgendado[]>;
  enRango(desde: FechaISO, hasta: FechaISO): Promise<ServicioAgendado[]>;
}

export interface PagoRepo extends ColeccionRepo<Pago> {
  porCliente(clienteId: ID): Promise<Pago[]>;
  /** Todo lo que está pendiente o vencido, que es la cobranza. */
  porCobrar(): Promise<Pago[]>;
  enRango(desde: FechaISO, hasta: FechaISO): Promise<Pago[]>;
}

export interface CuentaMensualRepo extends ColeccionRepo<CuentaMensual> {
  porCliente(clienteId: ID): Promise<CuentaMensual[]>;
  porPeriodo(periodo: string): Promise<CuentaMensual[]>;
}

export interface ProductoRepo extends ColeccionRepo<Producto> {
  activos(): Promise<Producto[]>;
  /** Suma (o resta, con delta negativo) unidades al stock. */
  ajustarStock(id: ID, delta: number): Promise<Producto>;
}

export interface OrdenRepo extends ColeccionRepo<OrdenTienda> {
  porCliente(clienteId: ID): Promise<OrdenTienda[]>;
}

export interface ReporteRepo extends ColeccionRepo<Reporte> {
  porPerro(perroId: ID): Promise<Reporte[]>;
  porFecha(fecha: FechaISO): Promise<Reporte[]>;
}

export interface IncidenteRepo extends ColeccionRepo<Incidente> {
  porPerro(perroId: ID): Promise<Incidente[]>;
  enRango(desde: FechaISO, hasta: FechaISO): Promise<Incidente[]>;
}

/** La bandeja de salida: qué se le mandó a cada dueño y cómo le llegó. */
export interface MensajeRepo extends ColeccionRepo<MensajeSaliente> {
  porCliente(clienteId: ID): Promise<MensajeSaliente[]>;
  porReferencia(tipo: string, id: ID): Promise<MensajeSaliente[]>;
  /** Los que quedaron fallidos y se pueden reintentar. */
  fallidos(): Promise<MensajeSaliente[]>;
  enRango(desde: FechaISO, hasta: FechaISO): Promise<MensajeSaliente[]>;
}

/** Quién cubre qué horas, qué día. */
export interface TurnoRepo extends ColeccionRepo<Turno> {
  enRango(desde: FechaISO, hasta: FechaISO): Promise<Turno[]>;
  porPersona(perfilId: ID): Promise<Turno[]>;
}

/** Utilidades que solo existen porque esto es un prototipo con datos mock. */
export interface NotificacionRepo extends ColeccionRepo<Notificacion> {
  sinLeer(): Promise<Notificacion[]>;
  porPerro(perroId: ID): Promise<Notificacion[]>;
  marcarLeidas(ids: ID[]): Promise<void>;
}

/**
 * Lo que Administración puede exigir en una ficha nueva.
 *
 * No es una colección: es un solo registro que siempre existe. Por eso no
 * tiene `crear` ni `eliminar` — `obtener()` devuelve la configuración de
 * fábrica si todavía nadie la tocó.
 */
export interface ConfiguracionRepo {
  obtener(): Promise<Configuracion>;
  guardar(
    cambios: Partial<Omit<Configuracion, "actualizadoEn">>,
  ): Promise<Configuracion>;
  /** Vuelve a los valores de `NEGOCIO`. */
  restaurar(): Promise<Configuracion>;
}

/**
 * Quién tiene cuenta y con qué rol.
 *
 * Vive acá y no en `lib/types` a propósito: no es una entidad del negocio
 * —no es un perro ni una reserva— sino la administración de los accesos, que
 * existe por tener cuentas de verdad.
 */
export interface MiembroDelEquipo {
  id: ID;
  nombre: string;
  rol: Rol;
  creadoEn: InstanteISO;
}

export interface Invitacion {
  /** Siempre en minúscula: "Maria@" y "maria@" son la misma persona. */
  email: string;
  rol: Rol;
  creadaEn: InstanteISO;
  /** Cuándo se gastó. Una invitación que sirve para siempre la reutiliza alguien. */
  usadaEn?: InstanteISO;
}

/**
 * El alta de la gente que trabaja acá.
 *
 * Va al revés que el alta de un dueño: el formulario del portal exige un
 * perro, así que una cuidadora no entra por ahí. Y el rol no se puede pedir
 * al registrarse, porque entonces cualquiera se haría admin en el primer
 * formulario. Por eso Administración anota el correo ANTES y la base le pone
 * el rol cuando esa persona se registre.
 */
export interface EquipoRepo {
  /** Todas las cuentas con su rol, para ver quién es quién. */
  miembros(): Promise<MiembroDelEquipo[]>;
  invitaciones(): Promise<Invitacion[]>;
  invitar(email: string, rol: Rol): Promise<Invitacion>;
  /** Solo tiene sentido con una que no se haya usado. */
  cancelarInvitacion(email: string): Promise<void>;
  cambiarRol(id: ID, rol: Rol): Promise<MiembroDelEquipo>;
}

export interface SistemaRepo {
  /** Día de referencia con el que se generaron los datos actuales. */
  anclaje(): Promise<FechaISO>;
  /** Borra todo y vuelve a generar el seed. No se puede deshacer. */
  reiniciar(hoy?: FechaISO): Promise<void>;
  exportar(): Promise<string>;
  importar(json: string): Promise<void>;
}

export interface RepositorioPatoteca {
  clientes: ClienteRepo;
  perros: PerroRepo;
  reservasHotel: ReservaHotelRepo;
  estadiasJardin: EstadiaJardinRepo;
  planes: PlanRepo;
  suscripciones: SuscripcionRepo;
  servicios: ServicioRepo;
  pagos: PagoRepo;
  cuentasMensuales: CuentaMensualRepo;
  productos: ProductoRepo;
  ordenes: OrdenRepo;
  reportes: ReporteRepo;
  incidentes: IncidenteRepo;
  mensajes: MensajeRepo;
  turnos: TurnoRepo;
  notificaciones: NotificacionRepo;
  configuracion: ConfiguracionRepo;
  equipo: EquipoRepo;
  sistema: SistemaRepo;
}
