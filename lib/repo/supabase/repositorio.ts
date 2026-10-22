/**
 * Implementación del repositorio sobre Supabase.
 *
 * Cumple las mismas interfaces que `RepositorioLocal`, así que la app no se
 * entera de cuál de los dos está usando. Lo que cambia acá abajo es lo que
 * NO puede ser igual, y cada caso está comentado en su lugar:
 *
 * - **Los ids los pone la base.** `crear` no manda id: la columna tiene
 *   `default gen_random_uuid()`. El local inventaba `cli-001` porque no
 *   tenía quién se los diera.
 * - **Las consultas vuelven por página.** PostgREST corta en 1.000 filas y
 *   no avisa; un `listar()` ingenuo haría que el tablero perdiera registros
 *   en silencio el día que el negocio pase ese número.
 * - **Los permisos los decide la base.** Un `select` que RLS no permite no
 *   falla: devuelve cero filas. Un `insert` que no permite sí falla, y el
 *   mensaje de Postgres no se entiende, así que se traduce.
 * - **Reiniciar y importar no existen en la nube.** En el prototipo borraban
 *   datos mock; acá borrarían los de un cliente de verdad.
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { ErrorRepositorio } from "@/lib/repo/error";
import {
  enRangoDeDias,
  filtroEnColumnas,
  limitesDelRango,
  seTraslapan,
  terminosDeBusqueda,
} from "@/lib/repo/supabase/consultas";
import { aEntidad, aFila, type Fila } from "@/lib/repo/supabase/mapeo";
import type {
  AgendaRepo,
  ClienteRepo,
  ColeccionRepo,
  ConfiguracionRepo,
  CuentaMensualRepo,
  EquipoRepo,
  EstadiaJardinRepo,
  Invitacion,
  MiembroDelEquipo,
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
  TurnoRepo,
} from "@/lib/repo/tipos";
import { configuracionPorDefecto } from "@/lib/rules/alta-perro";
import { devolucionJardinConAviso } from "@/lib/rules/precio-jardin";
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
} from "@/lib/types";
import { fechaISO, hoyISO } from "@/lib/utils/fecha";

/** Cuántas filas pide por vuelta. El tope de PostgREST por defecto es 1.000. */
const PAGINA = 1000;

/**
 * El mensaje de Postgres, traducido a algo que se pueda mostrar.
 *
 * `new row violates row-level security policy for table "pagos"` es correcto
 * y no le dice nada a nadie. Lo que la persona necesita saber es que no tiene
 * permiso, no en qué tabla se enteró la base.
 */
function explicar(error: PostgrestError): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "No tienes permiso para hacer eso.";
  }
  if (error.code === "23505") return "Ya existe un registro con esos datos.";
  if (error.code === "23503") {
    return "El registro apunta a algo que ya no existe.";
  }
  return error.message;
}

function reventar(contexto: string, error: PostgrestError): never {
  throw new ErrorRepositorio(`${contexto}: ${explicar(error)}`);
}

/** Un id que no tiene forma de uuid: la base lo rechaza, acá es "no existe". */
function idInvalido(error: PostgrestError): boolean {
  return error.code === "22P02";
}

/** Lo mínimo que este repositorio le pide al cliente de Supabase. */
export type Cliente0 = Pick<SupabaseClient, "from" | "rpc">;

type Consulta = ReturnType<Cliente0["from"]>;
// Lo que devuelve `.select()`: se acumulan filtros encima y se espera al
// final. El tipo exacto de supabase-js es genérico y recursivo, y amarrarlo
// acá no agrega seguridad: lo que importa es que la fila se valida al
// convertirse en entidad.
type Filtros = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

class ColeccionSupabase<T extends { id: ID }> implements ColeccionRepo<T> {
  constructor(
    protected cliente: Cliente0,
    protected tabla: string,
    /** Columna por la que sale ordenado, para que el orden sea estable. */
    protected orden: string,
  ) {}

  protected tablaDe(): Consulta {
    return this.cliente.from(this.tabla);
  }

  /**
   * Trae todas las filas que calcen, paginando.
   *
   * PostgREST responde como máximo 1.000 filas y no indica que cortó. Pedir
   * de a páginas hasta que venga una incompleta es la única manera de que
   * `listar()` signifique de verdad "todas".
   */
  protected async traer(
    afinar?: (consulta: Filtros) => Filtros,
  ): Promise<T[]> {
    const todas: T[] = [];

    for (let desde = 0; ; desde += PAGINA) {
      let consulta: Filtros = this.tablaDe().select("*");
      if (afinar) consulta = afinar(consulta);
      consulta = consulta
        .order(this.orden, { ascending: true })
        .order("id", { ascending: true })
        .range(desde, desde + PAGINA - 1);

      const { data, error } = (await consulta) as {
        data: Fila[] | null;
        error: PostgrestError | null;
      };
      if (error) reventar(`No se pudo leer ${this.tabla}`, error);

      const pagina = data ?? [];
      for (const fila of pagina) todas.push(aEntidad<T>(fila));
      if (pagina.length < PAGINA) return todas;
    }
  }

  /** Igual que `traer`, pero además filtra en memoria. */
  protected async traerY(
    afinar: ((consulta: Filtros) => Filtros) | undefined,
    predicado: (entidad: T) => boolean,
  ): Promise<T[]> {
    return (await this.traer(afinar)).filter(predicado);
  }

  protected porColumna(columna: string, valor: unknown): Promise<T[]> {
    return this.traer((c) => c.eq(columna, valor));
  }

  async listar(): Promise<T[]> {
    return this.traer();
  }

  async obtener(id: ID): Promise<T | null> {
    const { data, error } = await this.tablaDe()
      .select("*")
      .eq("id", id)
      .maybeSingle();

    // Un id con forma vieja (`cli-001`, guardado en el navegador antes de la
    // nube) no es un uuid y Postgres lo rechaza. Para la app eso es
    // exactamente "no existe", que es lo que respondía el repositorio local.
    if (error) {
      if (idInvalido(error)) return null;
      reventar(`No se pudo leer ${this.tabla}`, error);
    }
    return data ? aEntidad<T>(data as Fila) : null;
  }

  async crear(datos: SinId<T>): Promise<T> {
    // Sin id: lo pone la base con `gen_random_uuid()`. Mandar uno desde el
    // navegador sería dejar que el cliente elija la llave primaria.
    const { data, error } = await this.tablaDe()
      .insert(aFila(datos as Record<string, unknown>))
      .select()
      .single();

    if (error) reventar(`No se pudo crear en ${this.tabla}`, error);
    return aEntidad<T>(data as Fila);
  }

  async actualizar(id: ID, cambios: Partial<SinId<T>>): Promise<T> {
    const { data, error } = await this.tablaDe()
      .update(aFila(cambios as Record<string, unknown>))
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) reventar(`No se pudo actualizar ${this.tabla}`, error);
    // Sin fila puede ser que no exista o que RLS no deje verla; desde la app
    // las dos cosas son lo mismo y el repositorio local también fallaba.
    if (!data) {
      throw new ErrorRepositorio(`No existe ${this.tabla} con id ${id}`);
    }
    return aEntidad<T>(data as Fila);
  }

  async guardarVarios(entidades: T[]): Promise<T[]> {
    if (entidades.length === 0) return [];

    const { data, error } = await this.tablaDe()
      .upsert(entidades.map((e) => aFila(e as Record<string, unknown>)))
      .select();

    if (error) reventar(`No se pudo guardar en ${this.tabla}`, error);
    return ((data as Fila[] | null) ?? []).map((f) => aEntidad<T>(f));
  }

  async eliminar(id: ID): Promise<void> {
    const { error } = await this.tablaDe().delete().eq("id", id);
    if (error) {
      // Borrar algo que no existe no es un error, igual que en el local.
      if (idInvalido(error)) return;
      reventar(`No se pudo eliminar de ${this.tabla}`, error);
    }
  }

  /**
   * Un `or` por cada palabra, encadenados.
   *
   * Encadenar `.or()` los junta con AND, que es justo lo que hace falta:
   * "javiera soto" tiene que calzar con las DOS palabras, cada una en
   * cualquiera de las columnas. El repositorio local lograba lo mismo
   * pegando los campos en un solo texto antes de buscar.
   */
  protected buscarEn(columnas: string[], texto: string) {
    const terminos = terminosDeBusqueda(texto);
    return (consulta: Filtros) => {
      for (const termino of terminos) {
        consulta = consulta.or(filtroEnColumnas(columnas, termino));
      }
      return consulta;
    };
  }
}

const COLUMNAS_CLIENTE = [
  "nombre",
  "apellido",
  "email",
  "telefono",
  "comuna",
];

class ClientesSupabase
  extends ColeccionSupabase<Cliente>
  implements ClienteRepo
{
  async buscar(texto: string): Promise<Cliente[]> {
    if (terminosDeBusqueda(texto).length === 0) return this.listar();
    return this.traer(this.buscarEn(COLUMNAS_CLIENTE, texto));
  }
}

class PerrosSupabase extends ColeccionSupabase<Perro> implements PerroRepo {
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  /**
   * Busca por el perro y también por su dueño.
   *
   * En la práctica el staff dice "el perro de la Javiera" tanto como
   * "Pelusa". Son dos consultas y no un join: PostgREST no sabe mezclar un
   * `or` sobre la tabla con un `or` sobre la tabla relacionada, y pedir los
   * dueños aparte es más corto que pelear con la sintaxis.
   */
  async buscar(texto: string): Promise<Perro[]> {
    const terminos = terminosDeBusqueda(texto);
    if (terminos.length === 0) return this.listar();

    const duenos = await this.duenosQueCalzan(terminos);
    const columnas = ["nombre", "raza"];

    return this.traer((consulta) => {
      for (const termino of terminos) {
        const condiciones = [filtroEnColumnas(columnas, termino)];
        // `cliente_id.in.()` con la lista vacía es sintaxis inválida, así que
        // la condición solo entra cuando hay a quién nombrar.
        if (duenos.length > 0) {
          condiciones.push(`cliente_id.in.(${duenos.join(",")})`);
        }
        consulta = consulta.or(condiciones.join(","));
      }
      return consulta;
    });
  }

  private async duenosQueCalzan(terminos: string[]): Promise<ID[]> {
    let consulta: Filtros = this.cliente.from("clientes").select("id");
    for (const termino of terminos) {
      consulta = consulta.or(filtroEnColumnas(["nombre", "apellido"], termino));
    }

    const { data, error } = (await consulta) as {
      data: { id: ID }[] | null;
      error: PostgrestError | null;
    };
    if (error) reventar("No se pudo buscar el dueño", error);
    return (data ?? []).map((f) => f.id);
  }
}

class ReservasHotelSupabase
  extends ColeccionSupabase<ReservaHotel>
  implements ReservaHotelRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }

  /**
   * Las reservas que tocan el rango, aunque hayan empezado antes.
   *
   * El día de una estadía sale de `coalesce(real, programado)`, y eso un
   * filtro de PostgREST no lo sabe expresar. Así que la base devuelve de más
   * —acotado por los límites del rango— y el traslape exacto se calcula
   * acá, con la misma función que usa el repositorio local.
   */
  enRango(desde: FechaISO, hasta: FechaISO) {
    const limites = limitesDelRango(desde, hasta);
    return this.traerY(
      (c) =>
        c
          .or(
            `inicio_programado.lte.${limites.hasta},inicio_real.lte.${limites.hasta}`,
          )
          .or(
            `fin_programado.gte.${limites.desde},fin_real.gte.${limites.desde}`,
          ),
      (r) =>
        seTraslapan(
          fechaISO(r.inicioReal ?? r.inicioProgramado),
          fechaISO(r.finReal ?? r.finProgramado),
          desde,
          hasta,
        ),
    );
  }
}

class EstadiasJardinSupabase
  extends ColeccionSupabase<EstadiaJardin>
  implements EstadiaJardinRepo
{
  porFecha(fecha: FechaISO) {
    return this.porColumna("fecha", fecha);
  }

  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }

  /** `fecha` es una columna `date`: el día ya está guardado como día. */
  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.traer((c) => c.gte("fecha", desde).lte("fecha", hasta));
  }
}

class PlanesSupabase
  extends ColeccionSupabase<PlanComprado>
  implements PlanRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }
}

class SuscripcionesSupabase
  extends ColeccionSupabase<Suscripcion>
  implements SuscripcionRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  activas() {
    return this.porColumna("estado", "activa");
  }
}

class ServiciosSupabase
  extends ColeccionSupabase<ServicioAgendado>
  implements ServicioRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    const limites = limitesDelRango(desde, hasta);
    return this.traerY(
      (c) =>
        c.gte("fecha_hora", limites.desde).lte("fecha_hora", limites.hasta),
      (s) => enRangoDeDias(fechaISO(s.fechaHora), desde, hasta),
    );
  }
}

class PagosSupabase extends ColeccionSupabase<Pago> implements PagoRepo {
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porCobrar() {
    return this.traer((c) => c.in("estado", ["pendiente", "vencido"]));
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    const limites = limitesDelRango(desde, hasta);
    return this.traerY(
      (c) => c.gte("emitido_en", limites.desde).lte("emitido_en", limites.hasta),
      (p) => enRangoDeDias(fechaISO(p.emitidoEn), desde, hasta),
    );
  }
}

class CuentasMensualesSupabase
  extends ColeccionSupabase<CuentaMensual>
  implements CuentaMensualRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  porPeriodo(periodo: string) {
    return this.porColumna("periodo", periodo);
  }
}

class ProductosSupabase
  extends ColeccionSupabase<Producto>
  implements ProductoRepo
{
  activos() {
    return this.porColumna("activo", true);
  }

  /**
   * Suma o resta stock.
   *
   * Restar pasa por `descontar_stock()`, que es lo único que un dueño puede
   * hacerle a un producto: darle `update` sobre la tabla para que la compra
   * baje el stock le daría también la capacidad de cambiarle el PRECIO, y
   * ese precio lo lee toda la vitrina. Sumar es reposición, y eso lo hace
   * Administración, que sí tiene `update`.
   */
  async ajustarStock(id: ID, delta: number): Promise<Producto> {
    if (delta < 0) {
      const { data, error } = await this.cliente.rpc("descontar_stock", {
        producto: id,
        cantidad: -delta,
      });
      if (error) reventar("No se pudo descontar stock", error);
      return aEntidad<Producto>(data as Fila);
    }

    const producto = await this.obtener(id);
    if (!producto) {
      throw new ErrorRepositorio(`No existe producto con id ${id}`);
    }
    return this.actualizar(id, { stock: producto.stock + delta });
  }
}

class OrdenesSupabase
  extends ColeccionSupabase<OrdenTienda>
  implements OrdenRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }
}

class ReportesSupabase
  extends ColeccionSupabase<Reporte>
  implements ReporteRepo
{
  /** `perro_ids` es un `uuid[]`: se pregunta si contiene a ese perro. */
  porPerro(perroId: ID) {
    return this.traer((c) => c.contains("perro_ids", [perroId]));
  }

  porFecha(fecha: FechaISO) {
    return this.porColumna("fecha", fecha);
  }
}

class IncidentesSupabase
  extends ColeccionSupabase<Incidente>
  implements IncidenteRepo
{
  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.traer((c) => c.gte("fecha", desde).lte("fecha", hasta));
  }
}

class MensajesSupabase
  extends ColeccionSupabase<MensajeSaliente>
  implements MensajeRepo
{
  porCliente(clienteId: ID) {
    return this.porColumna("cliente_id", clienteId);
  }

  /** `referencia` es un jsonb `{ tipo, id }`. */
  porReferencia(tipo: string, id: ID) {
    return this.traer((c) =>
      c.eq("referencia->>tipo", tipo).eq("referencia->>id", id),
    );
  }

  fallidos() {
    return this.porColumna("estado", "fallido");
  }

  enRango(desde: FechaISO, hasta: FechaISO) {
    const limites = limitesDelRango(desde, hasta);
    return this.traerY(
      (c) => c.gte("creado_en", limites.desde).lte("creado_en", limites.hasta),
      (m) => enRangoDeDias(fechaISO(m.creadoEn), desde, hasta),
    );
  }
}

class TurnosSupabase extends ColeccionSupabase<Turno> implements TurnoRepo {
  /** `fecha` es una columna `date`: el filtro es exacto, sin recorte. */
  enRango(desde: FechaISO, hasta: FechaISO) {
    return this.traer((c) => c.gte("fecha", desde).lte("fecha", hasta));
  }

  porPersona(perfilId: ID) {
    return this.porColumna("perfil_id", perfilId);
  }
}

class NotificacionesSupabase
  extends ColeccionSupabase<Notificacion>
  implements NotificacionRepo
{
  /**
   * Deja el aviso sin pedirlo de vuelta.
   *
   * El dueño escribe avisos y no los lee: la bandeja es de Administración.
   * Pedir la fila de vuelta —`.select()`, que en Postgres es `insert …
   * returning`— obliga a pasar también la política de LECTURA, así que el
   * insert permitido fallaba igual con "violates row-level security": el
   * dueño corregía la ficha de su perro, se guardaba, y le salía un error.
   *
   * Por eso acá, y solo acá, el id lo pone el navegador. La regla de que los
   * ids los pone la base es para no dejar elegir la llave de algo que después
   * se lee; elegir la de una fila que uno mismo no puede ver no sirve de nada.
   */
  async crear(datos: SinId<Notificacion>): Promise<Notificacion> {
    const notificacion: Notificacion = { ...datos, id: crypto.randomUUID() };
    const { error } = await this.tablaDe().insert(
      aFila(notificacion as unknown as Record<string, unknown>),
    );
    if (error) reventar("No se pudo dejar el aviso", error);
    return notificacion;
  }

  sinLeer() {
    return this.porColumna("leida", false);
  }

  porPerro(perroId: ID) {
    return this.porColumna("perro_id", perroId);
  }

  async marcarLeidas(ids: ID[]) {
    if (ids.length === 0) return;
    const { error } = await this.tablaDe()
      .update({ leida: true })
      .in("id", ids);
    if (error) reventar("No se pudieron marcar las notificaciones", error);
  }
}

/**
 * La fila de configuración sin su columna `id`.
 *
 * Ese `id` siempre vale `true` y existe solo para que la tabla no pueda
 * tener una segunda fila; no es un campo del tipo `Configuracion` y dejarlo
 * pasar le agregaría una propiedad que nadie declaró.
 */
function sinColumnaId(fila: Fila): Fila {
  const copia = { ...fila };
  delete copia.id;
  return copia;
}

/**
 * La configuración es una fila sola.
 *
 * La tabla tiene `id boolean primary key default true check (id)`, que es la
 * manera de que no pueda haber una segunda. Si nadie la tocó todavía no hay
 * fila, y `obtener()` responde la de fábrica igual que el repositorio local.
 */
function configuracionDe(cliente: Cliente0): ConfiguracionRepo {
  const tabla = () => cliente.from("configuracion");

  const leer = async (): Promise<Configuracion | null> => {
    const { data, error } = await tabla().select("*").eq("id", true).maybeSingle();
    if (error) reventar("No se pudo leer la configuración", error);
    if (!data) return null;
    return aEntidad<Configuracion>(sinColumnaId(data as Fila));
  };

  const escribir = async (valor: Configuracion): Promise<Configuracion> => {
    const { data, error } = await tabla()
      .upsert({ id: true, ...aFila(valor as unknown as Record<string, unknown>) })
      .select()
      .single();
    if (error) reventar("No se pudo guardar la configuración", error);
    return aEntidad<Configuracion>(sinColumnaId(data as Fila));
  };

  return {
    async obtener() {
      return (await leer()) ?? configuracionPorDefecto();
    },
    async guardar(cambios) {
      // Se lee y se vuelve a escribir completa porque `upsert` reemplaza la
      // fila: mandar solo los cambios dejaría las demás columnas en null y
      // la base las tiene como `not null`.
      const actual = (await leer()) ?? configuracionPorDefecto();
      return escribir({
        ...actual,
        ...cambios,
        actualizadoEn: new Date().toISOString(),
      });
    },
    async restaurar() {
      return escribir(configuracionPorDefecto());
    },
  };
}

/**
 * Quién tiene cuenta, y a quién se invitó.
 *
 * Las dos tablas son de Administración de punta a punta: las políticas dejan
 * que solo un admin las lea y las escriba. Si esto lo pide otra persona, la
 * base devuelve cero filas y el insert falla; no hace falta esconder la
 * pantalla para que el dato esté protegido.
 */
function equipoDe(cliente: Cliente0): EquipoRepo {
  return {
    async miembros() {
      const { data, error } = await cliente
        .from("perfiles")
        .select("*")
        .order("creado_en", { ascending: true });
      if (error) reventar("No se pudo leer el equipo", error);
      return ((data as Fila[] | null) ?? []).map((f) =>
        aEntidad<MiembroDelEquipo>(f),
      );
    },

    async invitaciones() {
      const { data, error } = await cliente
        .from("invitaciones")
        .select("*")
        .order("creada_en", { ascending: false });
      if (error) reventar("No se pudieron leer las invitaciones", error);
      return ((data as Fila[] | null) ?? []).map((f) => aEntidad<Invitacion>(f));
    },

    async invitar(email, rol) {
      // En minúscula desde acá y también en el disparador de la base:
      // "Maria@" y "maria@" son la misma persona para todo el mundo menos
      // para una comparación de texto.
      const { data, error } = await cliente
        .from("invitaciones")
        .upsert({ email: email.trim().toLowerCase(), rol, usada_en: null })
        .select()
        .single();
      if (error) reventar("No se pudo invitar", error);
      return aEntidad<Invitacion>(data as Fila);
    },

    async cancelarInvitacion(email) {
      const { error } = await cliente
        .from("invitaciones")
        .delete()
        .eq("email", email.trim().toLowerCase());
      if (error) reventar("No se pudo cancelar la invitación", error);
    },

    async cambiarRol(id, rol) {
      const { data, error } = await cliente
        .from("perfiles")
        .update({ rol })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) reventar("No se pudo cambiar el rol", error);
      if (!data) {
        throw new ErrorRepositorio(`No existe la cuenta ${id}`);
      }
      return aEntidad<MiembroDelEquipo>(data as Fila);
    },
  };
}

/**
 * Cancelar y mover lo agendado: cada cambio es una función de la base.
 *
 * El dueño no puede tocar un cobro, y está bien que no pueda: con `update`
 * sobre `pagos` se dejaría cualquiera en $0 desde la consola. Así que cada
 * cambio corre entero en la base (`20261022150000_cambios_de_agenda.sql`),
 * en una transacción y con el reloj de la base. La hora que manda la app se
 * ignora a propósito: si contara, atrasar el teléfono sería cancelar gratis.
 *
 * Las funciones devuelven el día, el plan y el cargo como filas dentro de un
 * json; cada una se traduce con el mismo `aEntidad` que el resto.
 */
function agendaDe(cliente: Cliente0): AgendaRepo {
  async function llamar(
    funcion: string,
    parametros: Record<string, unknown>,
    contexto: string,
  ): Promise<Fila> {
    const { data, error } = await cliente.rpc(funcion, parametros);
    if (error) reventar(contexto, error);
    return data as Fila;
  }

  const entidad = <T>(fila: unknown): T | null =>
    fila ? aEntidad<T>(fila as Fila) : null;

  return {
    async agendarDiaDePrueba(perroId, horario, cotizacion) {
      const r = await llamar(
        "agendar_dia_de_prueba",
        {
          perro: perroId,
          nueva_fecha: horario.fecha,
          nuevo_inicio: horario.inicio,
          nuevo_fin: horario.fin,
          la_cotizacion: cotizacion,
        },
        "No se pudo agendar el día de prueba",
      );
      return {
        estadia: entidad<EstadiaJardin>(r.estadia)!,
        pago: entidad<Pago>(r.pago)!,
        perro: entidad<Perro>(r.perro)!,
      };
    },

    async agendarDiaConPlan(planId, horario, cotizacion) {
      const r = await llamar(
        "agendar_dia_con_plan",
        {
          plan: planId,
          nueva_fecha: horario.fecha,
          nuevo_inicio: horario.inicio,
          nuevo_fin: horario.fin,
          la_cotizacion: cotizacion,
        },
        "No se pudo agendar el día con el plan",
      );
      return {
        estadia: entidad<EstadiaJardin>(r.estadia)!,
        plan: entidad<PlanComprado>(r.plan)!,
      };
    },

    async comprarPlan(perroId, compra) {
      // Días, precio y vencimiento los calcula la base con las mismas
      // reglas: si los mandara la app, un plan de 99 días por $0 sería una
      // línea de consola.
      const r = await llamar(
        "comprar_plan_de_jardin",
        { perro: perroId, tipo_de_plan: compra.tipo, dias: compra.dias ?? null },
        "No se pudo comprar el plan",
      );
      return {
        plan: entidad<PlanComprado>(r.plan)!,
        pago: entidad<Pago>(r.pago)!,
      };
    },

    async cancelarDiaDePrueba(estadiaId) {
      const r = await llamar(
        "cancelar_dia_de_prueba",
        { estadia: estadiaId },
        "No se pudo cancelar el día de prueba",
      );
      return {
        estadia: entidad<EstadiaJardin>(r.estadia)!,
        politica: {
          horasDeAviso: Number(r.horas_de_aviso),
          sinCosto: r.sin_costo === true,
          costo: Number(r.costo),
        },
      };
    },

    async reprogramarDiaDePrueba(estadiaId, nuevo) {
      const r = await llamar(
        "reprogramar_dia_de_prueba",
        {
          estadia: estadiaId,
          nueva_fecha: nuevo.fecha,
          nuevo_inicio: nuevo.inicio,
          nuevo_fin: nuevo.fin,
        },
        "No se pudo cambiar el día de prueba",
      );
      return {
        estadia: entidad<EstadiaJardin>(r.estadia)!,
        politica: {
          horasDeAviso: Number(r.horas_de_aviso),
          sinCosto: r.sin_costo === true,
          costo: Number(r.costo),
        },
        cargo: entidad<Pago>(r.cargo),
      };
    },

    async cancelarDiaDeJardin(estadiaId) {
      const r = await llamar(
        "cancelar_dia_de_jardin",
        { estadia: estadiaId },
        "No se pudo cancelar el día",
      );
      return {
        estadia: entidad<EstadiaJardin>(r.estadia)!,
        // El texto sale de la regla con las horas que midió la base; si
        // devuelve o no, de lo que la base hizo de verdad.
        devolucion: {
          ...devolucionJardinConAviso(Number(r.horas_de_aviso)),
          devuelve: r.devuelve === true,
        },
        aDevolver: Number(r.a_devolver),
        planDevuelto: entidad<PlanComprado>(r.plan),
      };
    },
  };
}

/** Las tablas del dominio, en el orden en que se exportan. */
const TABLAS_DEL_DOMINIO = [
  ["clientes", "clientes"],
  ["perros", "perros"],
  ["reservasHotel", "reservas_hotel"],
  ["estadiasJardin", "estadias_jardin"],
  ["planes", "planes"],
  ["suscripciones", "suscripciones"],
  ["servicios", "servicios"],
  ["pagos", "pagos"],
  ["cuentasMensuales", "cuentas_mensuales"],
  ["productos", "productos"],
  ["ordenes", "ordenes"],
  ["reportes", "reportes"],
  ["incidentes", "incidentes"],
  ["mensajes", "mensajes"],
  ["notificaciones", "notificaciones"],
  ["turnos", "turnos"],
] as const;

function sistemaDe(
  cliente: Cliente0,
  configuracion: ConfiguracionRepo,
): SistemaRepo {
  return {
    /**
     * En el prototipo era el día al que estaba anclado el seed. En la nube no
     * hay seed: los datos son los que la gente fue cargando, y el "hoy" del
     * tablero es hoy.
     */
    async anclaje() {
      return hoyISO();
    },

    /**
     * No existe en la nube, y falla a propósito.
     *
     * En el prototipo regeneraba datos mock. Acá borraría los clientes, las
     * reservas y los cobros de verdad, y los dejaría sin vuelta: no hay
     * papelera. Que la pantalla de datos muestre este error es mejor que un
     * botón que haga eso.
     */
    async reiniciar() {
      throw new ErrorRepositorio(
        "Reiniciar los datos es solo del prototipo: en la nube borraría " +
          "información real y no se puede deshacer.",
      );
    },

    async exportar() {
      const set: Record<string, unknown> = { hoy: hoyISO() };
      for (const [clave, tabla] of TABLAS_DEL_DOMINIO) {
        const { data, error } = await cliente.from(tabla).select("*");
        if (error) reventar(`No se pudo exportar ${tabla}`, error);
        set[clave] = (data as Fila[] | null ?? []).map((f) => aEntidad(f));
      }
      set.configuracion = await configuracion.obtener();
      return JSON.stringify(set, null, 2);
    },

    /**
     * Tampoco existe, y por un motivo distinto del de `reiniciar`.
     *
     * Un respaldo del prototipo trae ids como `cli-001`, que no son uuid: la
     * base los rechazaría de a uno y el set quedaría a medio cargar, que es
     * peor que no empezar. Restaurar de verdad es trabajo del respaldo de
     * Supabase, que opera sobre la base entera.
     */
    async importar() {
      throw new ErrorRepositorio(
        "Restaurar un respaldo del prototipo en la nube dejaría los datos a " +
          "medio cargar. Los respaldos de la base se manejan desde Supabase.",
      );
    },
  };
}

export function crearRepositorioSupabase(
  cliente: Cliente0,
): RepositorioPatoteca {
  const configuracion = configuracionDe(cliente);

  return {
    clientes: new ClientesSupabase(cliente, "clientes", "creado_en"),
    perros: new PerrosSupabase(cliente, "perros", "creado_en"),
    reservasHotel: new ReservasHotelSupabase(
      cliente,
      "reservas_hotel",
      "creada_en",
    ),
    estadiasJardin: new EstadiasJardinSupabase(
      cliente,
      "estadias_jardin",
      "fecha",
    ),
    planes: new PlanesSupabase(cliente, "planes", "comprado_en"),
    suscripciones: new SuscripcionesSupabase(
      cliente,
      "suscripciones",
      "creada_en",
    ),
    servicios: new ServiciosSupabase(cliente, "servicios", "fecha_hora"),
    pagos: new PagosSupabase(cliente, "pagos", "emitido_en"),
    cuentasMensuales: new CuentasMensualesSupabase(
      cliente,
      "cuentas_mensuales",
      "emitida_en",
    ),
    productos: new ProductosSupabase(cliente, "productos", "nombre"),
    ordenes: new OrdenesSupabase(cliente, "ordenes", "creada_en"),
    reportes: new ReportesSupabase(cliente, "reportes", "fecha"),
    incidentes: new IncidentesSupabase(cliente, "incidentes", "fecha"),
    mensajes: new MensajesSupabase(cliente, "mensajes", "creado_en"),
    turnos: new TurnosSupabase(cliente, "turnos", "fecha"),
    notificaciones: new NotificacionesSupabase(
      cliente,
      "notificaciones",
      "creada_en",
    ),
    agenda: agendaDe(cliente),
    configuracion,
    equipo: equipoDe(cliente),
    sistema: sistemaDe(cliente, configuracion),
  };
}
