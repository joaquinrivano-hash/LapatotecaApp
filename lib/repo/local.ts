/**
 * Implementación del repositorio sobre datos mock + localStorage.
 *
 * Mantiene todo el set en memoria y lo vuelca completo en cada mutación. Es
 * simple a propósito: el prototipo maneja unos pocos miles de registros y lo
 * que importa es que las acciones del usuario sobrevivan a un refresh.
 *
 * Cuando entre Supabase, este archivo se reemplaza por `supabase.ts` y el
 * resto de la app no se entera.
 */

import { generarSeed, type DatosPatoteca } from "@/lib/data/seed";
import { crearAlmacenLocal, type Almacen } from "@/lib/repo/almacen";
import { configuracionPorDefecto } from "@/lib/rules/alta-perro";
import type {
  ClienteRepo,
  ColeccionRepo,
  ConfiguracionRepo,
  CuentaMensualRepo,
  EstadiaJardinRepo,
  IncidenteRepo,
  MensajeRepo,
  NotificacionRepo,
  OrdenRepo,
  PagoRepo,
  PerroRepo,
  PlanRepo,
  ProductoRepo,
  ReporteRepo,
  RepositorioPatoteca,
  ReservaHotelRepo,
  ServicioRepo,
  SinId,
  SistemaRepo,
  SuscripcionRepo,
} from "@/lib/repo/tipos";
import { fechaISO, hoyISO } from "@/lib/utils/fecha";
import type {
  Cliente,
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
} from "@/lib/types";

export const CLAVE_ALMACEN = "patoteca:datos:v1";

export class ErrorRepositorio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorRepositorio";
  }
}

/** Todo lo que sale del repositorio es una copia: nadie muta el set por error. */
function clonar<T>(valor: T): T {
  return structuredClone(valor);
}

/** Para buscar sin que las tildes y las mayúsculas estorben. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface Contexto {
  datos(): DatosPatoteca;
  persistir(): void;
}

class ColeccionLocal<T extends { id: ID }> implements ColeccionRepo<T> {
  constructor(
    protected ctx: Contexto,
    private prefijo: string,
    private seleccionar: (datos: DatosPatoteca) => T[],
  ) {}

  protected lista(): T[] {
    return this.seleccionar(this.ctx.datos());
  }

  protected async filtrar(predicado: (entidad: T) => boolean): Promise<T[]> {
    return clonar(this.lista().filter(predicado));
  }

  private nuevoId(): ID {
    let maximo = 0;
    for (const entidad of this.lista()) {
      const n = Number(String(entidad.id).split("-").pop());
      if (Number.isFinite(n) && n > maximo) maximo = n;
    }
    return `${this.prefijo}-${String(maximo + 1).padStart(3, "0")}`;
  }

  async listar(): Promise<T[]> {
    return clonar(this.lista());
  }

  async obtener(id: ID): Promise<T | null> {
    const entidad = this.lista().find((e) => e.id === id);
    return entidad ? clonar(entidad) : null;
  }

  async crear(datos: SinId<T>): Promise<T> {
    const entidad = { ...datos, id: this.nuevoId() } as T;
    this.lista().push(entidad);
    this.ctx.persistir();
    return clonar(entidad);
  }

  async actualizar(id: ID, cambios: Partial<SinId<T>>): Promise<T> {
    const lista = this.lista();
    const indice = lista.findIndex((e) => e.id === id);
    if (indice === -1) {
      throw new ErrorRepositorio(`No existe ${this.prefijo} con id ${id}`);
    }
    lista[indice] = { ...lista[indice], ...cambios };
    this.ctx.persistir();
    return clonar(lista[indice]);
  }

  async guardarVarios(entidades: T[]): Promise<T[]> {
    const lista = this.lista();
    for (const entidad of entidades) {
      const indice = lista.findIndex((e) => e.id === entidad.id);
      if (indice === -1) lista.push(clonar(entidad));
      else lista[indice] = clonar(entidad);
    }
    this.ctx.persistir();
    return clonar(entidades);
  }

  async eliminar(id: ID): Promise<void> {
    const lista = this.lista();
    const indice = lista.findIndex((e) => e.id === id);
    if (indice === -1) return;
    lista.splice(indice, 1);
    this.ctx.persistir();
  }
}

/** ¿El rango [desde, hasta] toca el rango [a, b]? Todo en días de Santiago. */
const seTraslapan = (
  a: FechaISO,
  b: FechaISO,
  desde: FechaISO,
  hasta: FechaISO,
) => a <= hasta && b >= desde;

class ClientesLocal extends ColeccionLocal<Cliente> implements ClienteRepo {
  async buscar(texto: string): Promise<Cliente[]> {
    const q = normalizar(texto);
    if (!q) return this.listar();
    return this.filtrar((c) =>
      normalizar(
        `${c.nombre} ${c.apellido} ${c.email} ${c.telefono} ${c.comuna}`,
      ).includes(q),
    );
  }
}

class PerrosLocal extends ColeccionLocal<Perro> implements PerroRepo {
  porCliente(clienteId: ID) {
    return this.filtrar((p) => p.clienteId === clienteId);
  }

  async buscar(texto: string): Promise<Perro[]> {
    const q = normalizar(texto);
    if (!q) return this.listar();

    // Busca también por el nombre del dueño: en la práctica el staff dice
    // "el perro de la Javiera" tanto como "Pelusa".
    const duenos = new Map(
      this.ctx
        .datos()
        .clientes.map((c) => [c.id, normalizar(`${c.nombre} ${c.apellido}`)]),
    );

    return this.filtrar(
      (p) =>
        normalizar(`${p.nombre} ${p.raza}`).includes(q) ||
        (duenos.get(p.clienteId) ?? "").includes(q),
    );
  }
}

class ReservasHotelLocal
  extends ColeccionLocal<ReservaHotel>
  implements ReservaHotelRepo
{
  porCliente(clienteId: ID) {
    return this.filtrar((r) => r.clienteId === clienteId);
  }

  porPerro(perroId: ID) {
    return this.filtrar((r) => r.perroId === perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((r) =>
      seTraslapan(
        fechaISO(r.inicioReal ?? r.inicioProgramado),
        fechaISO(r.finReal ?? r.finProgramado),
        desde,
        hasta,
      ),
    );
  }
}

class EstadiasJardinLocal
  extends ColeccionLocal<EstadiaJardin>
  implements EstadiaJardinRepo
{
  porFecha(fecha: FechaISO) {
    return this.filtrar((e) => e.fecha === fecha);
  }

  porCliente(clienteId: ID) {
    return this.filtrar((e) => e.clienteId === clienteId);
  }

  porPerro(perroId: ID) {
    return this.filtrar((e) => e.perroId === perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((e) => e.fecha >= desde && e.fecha <= hasta);
  }
}

class PlanesLocal extends ColeccionLocal<PlanComprado> implements PlanRepo {
  porCliente(clienteId: ID) {
    return this.filtrar((p) => p.clienteId === clienteId);
  }

  porPerro(perroId: ID) {
    return this.filtrar((p) => p.perroId === perroId);
  }
}

class SuscripcionesLocal
  extends ColeccionLocal<Suscripcion>
  implements SuscripcionRepo
{
  porCliente(clienteId: ID) {
    return this.filtrar((s) => s.clienteId === clienteId);
  }

  activas() {
    return this.filtrar((s) => s.estado === "activa");
  }
}

class ServiciosLocal
  extends ColeccionLocal<ServicioAgendado>
  implements ServicioRepo
{
  porCliente(clienteId: ID) {
    return this.filtrar((s) => s.clienteId === clienteId);
  }

  porPerro(perroId: ID) {
    return this.filtrar((s) => s.perroId === perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((s) => {
      const f = fechaISO(s.fechaHora);
      return f >= desde && f <= hasta;
    });
  }
}

class PagosLocal extends ColeccionLocal<Pago> implements PagoRepo {
  porCliente(clienteId: ID) {
    return this.filtrar((p) => p.clienteId === clienteId);
  }

  porCobrar() {
    return this.filtrar(
      (p) => p.estado === "pendiente" || p.estado === "vencido",
    );
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((p) => {
      const f = fechaISO(p.emitidoEn);
      return f >= desde && f <= hasta;
    });
  }
}

class CuentasMensualesLocal
  extends ColeccionLocal<CuentaMensual>
  implements CuentaMensualRepo
{
  porCliente(clienteId: ID) {
    return this.filtrar((c) => c.clienteId === clienteId);
  }

  porPeriodo(periodo: string) {
    return this.filtrar((c) => c.periodo === periodo);
  }
}

class ProductosLocal extends ColeccionLocal<Producto> implements ProductoRepo {
  activos() {
    return this.filtrar((p) => p.activo);
  }

  async ajustarStock(id: ID, delta: number): Promise<Producto> {
    const producto = this.lista().find((p) => p.id === id);
    if (!producto) {
      throw new ErrorRepositorio(`No existe producto con id ${id}`);
    }
    // El stock nunca queda negativo: si no alcanza, queda en cero y la
    // pantalla de inventario lo muestra como agotado.
    return this.actualizar(id, { stock: Math.max(0, producto.stock + delta) });
  }
}

class OrdenesLocal extends ColeccionLocal<OrdenTienda> implements OrdenRepo {
  porCliente(clienteId: ID) {
    return this.filtrar((o) => o.clienteId === clienteId);
  }
}

class ReportesLocal extends ColeccionLocal<Reporte> implements ReporteRepo {
  porPerro(perroId: ID) {
    return this.filtrar((r) => r.perroIds.includes(perroId));
  }

  porFecha(fecha: FechaISO) {
    return this.filtrar((r) => r.fecha === fecha);
  }
}

class IncidentesLocal
  extends ColeccionLocal<Incidente>
  implements IncidenteRepo
{
  porPerro(perroId: ID) {
    return this.filtrar((i) => i.perroId === perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((i) => i.fecha >= desde && i.fecha <= hasta);
  }
}

class MensajesLocal
  extends ColeccionLocal<MensajeSaliente>
  implements MensajeRepo
{
  porCliente(clienteId: ID) {
    return this.filtrar((m) => m.clienteId === clienteId);
  }

  porReferencia(tipo: string, id: ID) {
    return this.filtrar(
      (m) => m.referencia?.tipo === tipo && m.referencia.id === id,
    );
  }

  fallidos() {
    return this.filtrar((m) => m.estado === "fallido");
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.filtrar((m) => {
      const f = fechaISO(m.creadoEn);
      return f >= desde && f <= hasta;
    });
  }
}

/**
 * El set guardado puede venir de una versión anterior del prototipo, sin las
 * colecciones que se agregaron después. En vez de borrarle los datos al
 * usuario, se rellenan las que falten.
 */
class NotificacionesLocal
  extends ColeccionLocal<Notificacion>
  implements NotificacionRepo
{
  sinLeer() {
    return this.filtrar((n) => !n.leida);
  }

  porPerro(perroId: ID) {
    return this.filtrar((n) => n.perroId === perroId);
  }

  async marcarLeidas(ids: ID[]) {
    const pendientes = new Set(ids);
    for (const notificacion of this.ctx.datos().notificaciones) {
      if (pendientes.has(notificacion.id)) notificacion.leida = true;
    }
    this.ctx.persistir();
  }
}

function normalizarDatos(datos: DatosPatoteca): DatosPatoteca {
  const vacias: (keyof DatosPatoteca)[] = [
    "clientes",
    "perros",
    "reservasHotel",
    "estadiasJardin",
    "planes",
    "suscripciones",
    "servicios",
    "pagos",
    "cuentasMensuales",
    "productos",
    "ordenes",
    "reportes",
    "incidentes",
    "mensajes",
    "notificaciones",
  ];

  for (const clave of vacias) {
    if (!Array.isArray(datos[clave])) {
      (datos as unknown as Record<string, unknown>)[clave] = [];
    }
  }

  // La configuración gana campos con el tiempo; los que falten se completan
  // con los de fábrica en vez de reemplazar lo que Administración ya eligió.
  const fabrica = configuracionPorDefecto();
  datos.configuracion = {
    ...fabrica,
    ...datos.configuracion,
    duracionVacunasMeses: {
      ...fabrica.duracionVacunasMeses,
      ...datos.configuracion?.duracionVacunasMeses,
    },
    catalogos: { ...fabrica.catalogos, ...datos.configuracion?.catalogos },
    actualizadoEn: datos.configuracion?.actualizadoEn ?? fabrica.actualizadoEn,
  };

  migrarPerros(datos.perros);

  return datos;
}

/**
 * Pone al día los perros guardados antes de que existieran los campos nuevos.
 *
 * Se migra en el lugar en vez de cambiar la clave del almacén: los datos que
 * alguien tiene en su celular son SU demo, y empezar de cero sería perderla.
 * Cada paso tiene que poder correr dos veces sin hacer daño, porque esto se
 * ejecuta en cada carga.
 */
function migrarPerros(perros: Perro[]): void {
  for (const perro of perros) {
    // La comida era un párrafo y ahora son campos. Lo escrito no se tira: se
    // guarda como nota, que es exactamente lo que era.
    const comida = perro.alimentacion as unknown;
    if (typeof comida === "string") {
      perro.alimentacion = comida.trim()
        ? { raciones: [], notas: comida }
        : undefined;
    }

    // La comida tenía UNA ración suelta y ahora puede tener varias, para los
    // perros que desayunan distinto de lo que cenan.
    const plato = perro.alimentacion as unknown as
      | {
          cantidad?: number;
          comidas?: string[];
          raciones?: unknown[];
        }
      | undefined;
    // "scoop" se llamaba así cuando el campo era nuestro; ahora la opción se
    // llama "medida", que es como lo dice la gente.
    if (plato && (plato as { unidad?: string }).unidad === "scoop") {
      (plato as { unidad?: string }).unidad = "medida";
    }

    if (plato && !plato.raciones) {
      plato.raciones =
        plato.cantidad !== undefined || (plato.comidas ?? []).length > 0
          ? [{ cantidad: plato.cantidad, comidas: plato.comidas ?? [] }]
          : [];
      delete plato.cantidad;
      delete plato.comidas;
    }

    // El carnet era una foto y ahora son las hojas que haga falta.
    const viejo = perro as unknown as { carnetVacunasUrl?: string };
    if (viejo.carnetVacunasUrl) {
      perro.carnetVacunasUrls = [
        ...(perro.carnetVacunasUrls ?? []),
        viejo.carnetVacunasUrl,
      ];
      delete viejo.carnetVacunasUrl;
    }

    // El antiparasitario se declaraba con una periodicidad y ahora con los
    // meses que dura el formato.
    const bicho = perro.antiparasitario as unknown as
      | { periodicidad?: string; cadaCuantosDias?: number; mesesDeDuracion?: number }
      | undefined;
    if (bicho && bicho.mesesDeDuracion === undefined) {
      bicho.mesesDeDuracion = mesesDeLaPeriodicidad(bicho);
      delete bicho.periodicidad;
      delete bicho.cadaCuantosDias;
    }
  }
}

/** Las periodicidades viejas, llevadas a meses. */
function mesesDeLaPeriodicidad(viejo: {
  periodicidad?: string;
  cadaCuantosDias?: number;
}): number {
  const enMeses: Record<string, number> = {
    mensual: 1,
    trimestral: 3,
    semestral: 6,
    anual: 12,
  };
  if (viejo.periodicidad && enMeses[viejo.periodicidad]) {
    return enMeses[viejo.periodicidad];
  }
  // "otro" se guardaba en días; se redondea al mes más cercano, mínimo uno.
  return Math.max(1, Math.round((viejo.cadaCuantosDias ?? 30) / 30));
}

export interface OpcionesRepositorioLocal {
  almacen?: Almacen;
  /** Día de referencia del seed. Por defecto, hoy. */
  hoy?: FechaISO;
  semilla?: number;
}

export function crearRepositorioLocal(
  opciones: OpcionesRepositorioLocal = {},
): RepositorioPatoteca {
  const almacen = opciones.almacen ?? crearAlmacenLocal();
  let datos: DatosPatoteca | null = null;

  const cargar = (): DatosPatoteca => {
    if (datos) return datos;

    const guardado = almacen.leer<DatosPatoteca>(CLAVE_ALMACEN);
    if (guardado) {
      datos = normalizarDatos(guardado);
      // Se vuelve a escribir para que la migración quede hecha de verdad. Si
      // solo viviera en memoria, cada carga la repetiría y un respaldo
      // descargado saldría con la forma vieja.
      almacen.escribir(CLAVE_ALMACEN, datos);
      return datos;
    }

    // Primera visita: se genera el seed y se guarda. A partir de ahí los
    // datos son del usuario, y solo se pierden si pide reiniciar.
    datos = generarSeed(opciones.hoy ?? hoyISO(), opciones.semilla);
    almacen.escribir(CLAVE_ALMACEN, datos);
    return datos;
  };

  const ctx: Contexto = {
    datos: cargar,
    persistir: () => almacen.escribir(CLAVE_ALMACEN, cargar()),
  };

  const sistema: SistemaRepo = {
    async anclaje() {
      return cargar().hoy;
    },
    async reiniciar(hoy?: FechaISO) {
      datos = generarSeed(hoy ?? opciones.hoy ?? hoyISO(), opciones.semilla);
      almacen.escribir(CLAVE_ALMACEN, datos);
    },
    async exportar() {
      return JSON.stringify(cargar(), null, 2);
    },
    async importar(json: string) {
      const entrante = JSON.parse(json) as DatosPatoteca;
      if (!entrante || !Array.isArray(entrante.clientes)) {
        throw new ErrorRepositorio("El archivo no tiene datos de La Patoteca.");
      }
      datos = normalizarDatos(entrante);
      almacen.escribir(CLAVE_ALMACEN, datos);
    },
  };

  const configuracion: ConfiguracionRepo = {
    async obtener() {
      return clonar(cargar().configuracion);
    },
    async guardar(cambios) {
      const datos = cargar();
      datos.configuracion = {
        ...datos.configuracion,
        ...cambios,
        actualizadoEn: new Date().toISOString(),
      };
      ctx.persistir();
      return clonar(datos.configuracion);
    },
    async restaurar() {
      const datos = cargar();
      datos.configuracion = configuracionPorDefecto();
      ctx.persistir();
      return clonar(datos.configuracion);
    },
  };

  return {
    clientes: new ClientesLocal(ctx, "cli", (d) => d.clientes),
    perros: new PerrosLocal(ctx, "perro", (d) => d.perros),
    reservasHotel: new ReservasHotelLocal(ctx, "res", (d) => d.reservasHotel),
    estadiasJardin: new EstadiasJardinLocal(ctx, "est", (d) => d.estadiasJardin),
    planes: new PlanesLocal(ctx, "plan", (d) => d.planes),
    suscripciones: new SuscripcionesLocal(ctx, "susc", (d) => d.suscripciones),
    servicios: new ServiciosLocal(ctx, "serv", (d) => d.servicios),
    pagos: new PagosLocal(ctx, "pago", (d) => d.pagos),
    cuentasMensuales: new CuentasMensualesLocal(
      ctx,
      "cuenta",
      (d) => d.cuentasMensuales,
    ),
    productos: new ProductosLocal(ctx, "prod", (d) => d.productos),
    ordenes: new OrdenesLocal(ctx, "orden", (d) => d.ordenes),
    reportes: new ReportesLocal(ctx, "rep", (d) => d.reportes),
    incidentes: new IncidentesLocal(ctx, "inc", (d) => d.incidentes),
    mensajes: new MensajesLocal(ctx, "msg", (d) => d.mensajes),
    notificaciones: new NotificacionesLocal(ctx, "avi", (d) => d.notificaciones),
    configuracion,
    sistema,
  };
}
