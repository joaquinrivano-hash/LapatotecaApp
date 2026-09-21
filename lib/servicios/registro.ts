/**
 * Alta de un cliente nuevo y su primer día de prueba.
 *
 * Es la puerta de entrada del portal: alguien que nunca ha venido no tiene
 * nada que reservar todavía, porque la casa exige el día de prueba antes de
 * la primera estadía. Por eso "agendar" para un visitante nuevo significa
 * crear la cuenta y tomar ese día, no elegir hotel o jardín.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { evaluarAdmision } from "@/lib/rules/admision";
import { verificarCapacidad } from "@/lib/rules/capacidad";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { hhmmDesdeMinutos, instanteEn } from "@/lib/utils/fecha";
import { aE164 } from "@/lib/utils/telefono";
import { ocupantesEnRango } from "@/lib/servicios/reservas";
import type { ResultadoAdmision } from "@/lib/rules/admision";
import type { ResultadoCapacidad } from "@/lib/rules/capacidad";
import type {
  Cliente,
  Cotizacion,
  EstadiaJardin,
  FechaISO,
  ID,
  InstanteISO,
  Perro,
  Sexo,
  TipoVacuna,
} from "@/lib/types";

export class RegistroRechazado extends Error {
  constructor(
    mensaje: string,
    readonly motivos: string[],
  ) {
    super(mensaje);
    this.name = "RegistroRechazado";
  }
}

export interface DatosDeCuenta {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  comuna: string;
  direccion?: string;
}

export interface DatosDePerro {
  nombre: string;
  raza: string;
  pesoKg: number;
  sexo: Sexo;
  esterilizado: boolean;
  /**
   * Cuándo vence cada vacuna obligatoria, tal como sale del carnet.
   *
   * Se piden al crear la cuenta porque el día de prueba ya es una jornada en
   * la casa con otros perros: sin vacunas al día no se puede agendar.
   */
  vacunas?: { tipo: TipoVacuna; fechaVencimiento: FechaISO }[];
  desparasitadoHasta?: FechaISO;
  alimentacion?: string;
  indicaciones?: string;
  notas?: string;
}

/**
 * Lo que impide de entrada que un perro sea cliente.
 *
 * Solo las reglas que no se pueden subsanar: el peso y la esterilización de
 * los machos. Las vacunas y la desparasitación se revisan para el día de
 * prueba, no para crear la cuenta — se ponen al día antes de venir.
 */
export function reparosParaEntrar(perro: DatosDePerro): string[] {
  const reparos: string[] = [];

  if (perro.pesoKg > NEGOCIO.admision.pesoMaximoKg) {
    reparos.push(
      `Recibimos perritos de hasta ${NEGOCIO.admision.pesoMaximoKg} kg.`,
    );
  }
  if (
    NEGOCIO.admision.esterilizacionObligatoriaEnMachos &&
    perro.sexo === "macho" &&
    !perro.esterilizado
  ) {
    reparos.push("Los machos tienen que estar esterilizados.");
  }

  return reparos;
}

export interface CuentaCreada {
  cliente: Cliente;
  perro: Perro;
}

/** Crea el cliente y su primer perro, con el día de prueba pendiente. */
export async function crearCuenta(
  repo: RepositorioPatoteca,
  datos: { cuenta: DatosDeCuenta; perro: DatosDePerro },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<CuentaCreada> {
  const reparos = reparosParaEntrar(datos.perro);
  if (reparos.length > 0) {
    throw new RegistroRechazado("Todavía no podemos recibirlo.", reparos);
  }

  const cliente = await repo.clientes.crear({
    nombre: datos.cuenta.nombre.trim(),
    apellido: datos.cuenta.apellido.trim(),
    email: datos.cuenta.email.trim(),
    // Se guarda en E.164 desde el principio: es lo que exige WhatsApp y así
    // no hay que normalizar en cada envío.
    telefono: aE164(datos.cuenta.telefono) ?? datos.cuenta.telefono.trim(),
    comuna: datos.cuenta.comuna.trim(),
    direccion: datos.cuenta.direccion?.trim() || undefined,
    creadoEn: ahora,
  });

  const perro = await repo.perros.crear({
    clienteId: cliente.id,
    nombre: datos.perro.nombre.trim(),
    raza: datos.perro.raza.trim(),
    pesoKg: datos.perro.pesoKg,
    sexo: datos.perro.sexo,
    esterilizado: datos.perro.esterilizado,
    // La fecha de aplicación no se pide: el dueño mira el carnet y copia el
    // vencimiento, que es lo único que la regla de admisión usa.
    vacunas: (datos.perro.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaVencimiento,
      fechaVencimiento: v.fechaVencimiento,
    })),
    desparasitadoHasta: datos.perro.desparasitadoHasta,
    diaDePrueba: { estado: "pendiente" },
    alimentacion: datos.perro.alimentacion?.trim() || undefined,
    indicaciones: datos.perro.indicaciones?.trim() || undefined,
    notas: datos.perro.notas?.trim() || undefined,
    creadoEn: ahora,
  });

  return { cliente, perro };
}

/* ── Día de prueba ─────────────────────────────────────────────────── */

export interface CotizacionDiaDePrueba {
  cotizacion: Cotizacion;
  inicio: InstanteISO;
  fin: InstanteISO;
  admision: ResultadoAdmision;
  capacidad: ResultadoCapacidad;
  /** Ya lo tiene agendado o aprobado: no hay nada que tomar. */
  yaLoTiene: boolean;
  sePuede: boolean;
}

function cotizacionDelDiaDePrueba(): Cotizacion {
  return {
    lineas: [
      {
        concepto: "Día de prueba",
        detalle: "Una jornada completa de jardín para conocernos",
        monto: PRECIOS.diaDePrueba,
      },
    ],
    subtotal: PRECIOS.diaDePrueba,
    descuentos: [],
    total: PRECIOS.diaDePrueba,
  };
}

export async function cotizarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
): Promise<CotizacionDiaDePrueba> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error(`No existe el perro ${perroId}`);

  const inicio = instanteEn(fecha, NEGOCIO.jardin.horaApertura * 60);
  const fin = instanteEn(fecha, NEGOCIO.jardin.horaCierre * 60);

  const existentes = await ocupantesEnRango(repo, fecha, fecha);

  const capacidad = verificarCapacidad(
    [{ perroId, linea: "jardin", inicio, fin }],
    existentes,
  );

  // El día de prueba es la excepción a "necesita día de prueba": se evalúa
  // con esa bandera para que no se pida a sí mismo.
  const admision = evaluarAdmision(perro, { fecha, esDiaDePrueba: true });

  const yaLoTiene =
    perro.diaDePrueba.estado === "agendado" ||
    perro.diaDePrueba.estado === "aprobado";

  return {
    cotizacion: cotizacionDelDiaDePrueba(),
    inicio,
    fin,
    admision,
    capacidad,
    yaLoTiene,
    sePuede: admision.admitido && capacidad.hayCupo && !yaLoTiene,
  };
}

/**
 * Un solo motivo, con la franja que chocó.
 *
 * La jornada completa son 24 slots de media hora: listarlos uno por uno sería
 * ilegible. Se dice desde cuándo hasta cuándo está lleno, que es lo que el
 * dueño necesita para elegir otro día.
 */
function motivoDeCupo(capacidad: ResultadoCapacidad): string {
  const minutos = capacidad.conflictos.map((c) => c.minutoDelDia);
  const desde = hhmmDesdeMinutos(Math.min(...minutos));
  const hasta = hhmmDesdeMinutos(Math.max(...minutos));
  return desde === hasta
    ? `Ese día a las ${desde} ya no quedan cupos.`
    : `Ese día ya está lleno entre las ${desde} y las ${hasta}.`;
}

export interface DiaDePruebaAgendado {
  estadia: EstadiaJardin;
  perro: Perro;
}

/**
 * Agenda el día de prueba: deja la estadía de jardín esperando y marca al
 * perro como "agendado".
 *
 * No emite cobro. Igual que el día suelto, el día de prueba se cobra cuando
 * se cierra la jornada con la hora real.
 */
export async function agendarDiaDePrueba(
  repo: RepositorioPatoteca,
  perroId: ID,
  fecha: FechaISO,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<DiaDePruebaAgendado> {
  const previa = await cotizarDiaDePrueba(repo, perroId, fecha);

  if (!previa.sePuede) {
    const motivos = previa.yaLoTiene
      ? ["Este perrito ya tiene su día de prueba tomado."]
      : [
          ...previa.admision.bloqueos.map((p) => p.mensaje),
          ...(previa.capacidad.hayCupo ? [] : [motivoDeCupo(previa.capacidad)]),
        ];
    throw new RegistroRechazado("No pudimos tomar ese día.", motivos);
  }

  const perroActual = (await repo.perros.obtener(perroId))!;

  const estadia = await repo.estadiasJardin.crear({
    clienteId: perroActual.clienteId,
    perroId,
    fecha,
    inicioProgramado: previa.inicio,
    finProgramado: previa.fin,
    origen: "dia_de_prueba",
    estado: "esperada",
    cotizacion: previa.cotizacion,
    creadaEn: ahora,
  });

  const perro = await repo.perros.actualizar(perroId, {
    diaDePrueba: { estado: "agendado", fecha },
  });

  return { estadia, perro };
}
