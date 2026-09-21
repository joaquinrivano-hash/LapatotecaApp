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
import type {
  ClienteRepo,
  ColeccionRepo,
  CuentaMensualRepo,
  EstadiaJardinRepo,
  IncidenteRepo,
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
      datos = guardado;
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
      datos = entrante;
      almacen.escribir(CLAVE_ALMACEN, datos);
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
    sistema,
  };
}
