/**
 * La planilla de la semana, con lo que se planificó y lo que se observa.
 *
 * Junta tres cosas que viven en lugares distintos: los turnos, la
 * ocupación de cada día —para saber si un hueco de cobertura importaba— y
 * los rastros que dejó cada persona.
 *
 * Sobre los rastros: son las **marcas de asistencia** —cada llegada y cada
 * salida que esa persona apretó— más los **reportes e incidentes**. Las
 * primeras son el grueso: marcar llegadas es lo que más se hace en un turno.
 *
 * Se juntan por dos llaves distintas, y no es por gusto. Las marcas llevan
 * el id de la cuenta (`marcado_por`, firmado por la base), así que calzan
 * exacto. Los reportes y los incidentes solo llevan `autorStaff`, que es el
 * NOMBRE con el que se firmó: eso es frágil —dos personas que se llamen
 * igual se mezclan— y es lo que hay hasta que esos registros guarden el id.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  calcularOcupacionDia,
  ocupantesDeEstadias,
  ocupantesDeReservas,
  type OcupanteRango,
} from "@/lib/rules/capacidad";
import {
  coberturaDelDia,
  compararTurno,
  huecosDeCobertura,
  type ComparacionDeTurno,
  type FranjaDeCobertura,
  type HuecoDeCobertura,
  type Rastro,
} from "@/lib/rules/turnos";
import type { RepositorioPatoteca, MiembroDelEquipo } from "@/lib/repo/tipos";
import {
  fechaISO,
  minutosDesdeHHMM,
  minutosDelDia,
  rangoFechas,
} from "@/lib/utils/fecha";
import type {
  FechaISO,
  ID,
  OcupacionDia,
  Turno,
  UbicacionDeFichaje,
} from "@/lib/types";

export interface TurnoConPersona {
  turno: Turno;
  /** Null si la cuenta ya no existe: el turno viejo igual se muestra. */
  persona: MiembroDelEquipo | null;
  comparacion: ComparacionDeTurno;
  rastros: Rastro[];
}

export interface DiaDeTurnos {
  fecha: FechaISO;
  turnos: TurnoConPersona[];
  franjas: FranjaDeCobertura[];
  huecos: HuecoDeCobertura[];
  ocupacion: OcupacionDia;
}

/**
 * Los rastros de cada persona, por día.
 *
 * Se indexan por NOMBRE porque reportes e incidentes guardan `autorStaff`,
 * que es el nombre con el que firmó, no su id. Es frágil —dos personas con
 * el mismo nombre se mezclan— y es lo que hay hasta que esos registros
 * guarden el id.
 */
function indexarRastros(
  reportes: { fecha: FechaISO; creadoEn: string; autorStaff: string }[],
  incidentes: { fecha: FechaISO; creadoEn: string; autorStaff: string }[],
): Map<string, Rastro[]> {
  const mapa = new Map<string, Rastro[]>();

  const anotar = (
    fecha: FechaISO,
    autor: string,
    instante: string,
    que: string,
  ) => {
    const clave = `${fecha}|${autor.trim().toLowerCase()}`;
    const lista = mapa.get(clave) ?? [];
    lista.push({ instante, que });
    mapa.set(clave, lista);
  };

  for (const r of reportes)
    anotar(r.fecha, r.autorStaff, r.creadoEn, "un reporte");
  for (const i of incidentes) {
    anotar(i.fecha, i.autorStaff, i.creadoEn, "un incidente");
  }
  return mapa;
}

/** Una marca de asistencia: quién la apretó y cuándo. */
interface Marcada {
  inicioMarcadoEn?: string;
  inicioMarcadoPor?: ID;
  finMarcadoEn?: string;
  finMarcadoPor?: ID;
}

/**
 * Las marcas de asistencia, indexadas por CUENTA.
 *
 * El día del rastro es el de `marcadoEn` y no el de la estadía: si alguien
 * cierra a las 00:20 la jornada del día anterior, ese trabajo lo hizo
 * durante su turno de la noche, no durante el día que cerró.
 */
function indexarMarcas(filas: Marcada[]): Map<string, Rastro[]> {
  const mapa = new Map<string, Rastro[]>();

  const anotar = (cuando: string | undefined, quien: ID | undefined, que: string) => {
    if (!cuando || !quien) return;
    const clave = `${fechaISO(cuando)}|${quien}`;
    mapa.set(clave, [...(mapa.get(clave) ?? []), { instante: cuando, que }]);
  };

  for (const f of filas) {
    anotar(f.inicioMarcadoEn, f.inicioMarcadoPor, "una llegada");
    anotar(f.finMarcadoEn, f.finMarcadoPor, "una salida");
  }
  return mapa;
}

export async function semanaDeTurnos(
  repo: RepositorioPatoteca,
  desde: FechaISO,
  hasta: FechaISO,
): Promise<DiaDeTurnos[]> {
  const [turnos, equipo, reservas, estadias, reportes, incidentes] =
    await Promise.all([
      repo.turnos.enRango(desde, hasta),
      repo.equipo.miembros(),
      repo.reservasHotel.enRango(desde, hasta),
      repo.estadiasJardin.enRango(desde, hasta),
      repo.reportes.listar(),
      repo.incidentes.enRango(desde, hasta),
    ]);

  const gente = new Map(equipo.map((m) => [m.id, m]));
  const ocupantes: OcupanteRango[] = [
    ...ocupantesDeReservas(reservas),
    ...ocupantesDeEstadias(estadias),
  ];
  const porNombre = indexarRastros(
    reportes.filter((r) => r.fecha >= desde && r.fecha <= hasta),
    incidentes,
  );
  const porCuenta = indexarMarcas([...reservas, ...estadias]);

  return rangoFechas(desde, hasta).map((fecha) => {
    const ocupacion = calcularOcupacionDia(fecha, ocupantes);

    // Cuántos perros había en cada franja, para saber si un hueco de
    // cobertura dejó la casa sola o solo dejó la casa vacía.
    const perrosEn = (minuto: number) =>
      ocupacion.slots.find((s) => s.minutoDelDia === minuto)?.total ?? 0;

    const delDia = turnos.filter((t) => t.fecha === fecha);
    // Solo las horas de atención: la noche con perros de hotel durmiendo
    // no es una pregunta de planilla, y marcarla haría sonar el aviso los
    // siete días hasta que se deje de mirar.
    const franjas = coberturaDelDia(
      delDia,
      perrosEn,
      minutosDesdeHHMM(NEGOCIO.turnos.horasQueSeCubren.desde),
      minutosDesdeHHMM(NEGOCIO.turnos.horasQueSeCubren.hasta),
    );

    return {
      fecha,
      ocupacion,
      franjas,
      huecos: huecosDeCobertura(franjas),
      turnos: delDia
        .map((turno) => {
          const persona = gente.get(turno.perfilId) ?? null;
          // Las marcas calzan por cuenta; los reportes e incidentes, solo
          // por el nombre con el que se firmaron.
          const suyos = [
            ...(porCuenta.get(`${fecha}|${turno.perfilId}`) ?? []),
            ...(persona
              ? (porNombre.get(
                  `${fecha}|${persona.nombre.trim().toLowerCase()}`,
                ) ?? [])
              : []),
          ];
          return {
            turno,
            persona,
            rastros: suyos,
            comparacion: compararTurno(turno, suyos),
          };
        })
        .sort((a, b) => a.turno.desde.localeCompare(b.turno.desde)),
    };
  });
}

/** El turno de hoy de esa persona, si tiene uno. Para el botón de fichar. */
export async function miTurnoDeHoy(
  repo: RepositorioPatoteca,
  perfilId: ID,
  hoy: FechaISO,
): Promise<Turno | null> {
  const suyos = await repo.turnos.enRango(hoy, hoy);
  return suyos.find((t) => t.perfilId === perfilId) ?? null;
}

export type LadoDelFichaje = "entrada" | "salida";

/**
 * Fichar.
 *
 * No se puede deshacer ni corregir desde acá a propósito: el fichaje es la
 * declaración de quien lo hizo, y dejar que se reescriba lo convertiría en
 * una casilla que se llena al final del día con la hora que convenga. Si
 * quedó mal, lo corrige Administración.
 *
 * La ubicación va con la hora y corre la misma suerte: se anota la primera
 * vez y no se vuelve a tocar. Es lo que dijo el celular en ese momento, no
 * una prueba —un GPS se puede falsear—, pero sí una pista que la hora sola
 * no da.
 */
export async function ficharTurno(
  repo: RepositorioPatoteca,
  turnoId: ID,
  lado: LadoDelFichaje,
  ahora: string = new Date().toISOString(),
  ubicacion?: UbicacionDeFichaje,
): Promise<Turno> {
  const turno = await repo.turnos.obtener(turnoId);
  if (!turno) throw new Error("Ese turno ya no existe.");

  const yaEsta = lado === "entrada" ? turno.entradaReal : turno.salidaReal;
  if (yaEsta) return turno;

  return repo.turnos.actualizar(
    turnoId,
    lado === "entrada"
      ? { entradaReal: ahora, ...(ubicacion && { entradaUbicacion: ubicacion }) }
      : { salidaReal: ahora, ...(ubicacion && { salidaUbicacion: ubicacion }) },
  );
}

/** Cuánto se corrió el fichaje respecto de lo planificado, en minutos. */
export function desfaseDelFichaje(
  turno: Turno,
  lado: LadoDelFichaje,
): number | null {
  const fichaje = lado === "entrada" ? turno.entradaReal : turno.salidaReal;
  if (!fichaje) return null;
  if (fechaISO(fichaje) !== turno.fecha) return null;

  const planificado = lado === "entrada" ? turno.desde : turno.hasta;
  const [h, m] = planificado.split(":").map(Number);
  return minutosDelDia(fichaje) - (h * 60 + m);
}
