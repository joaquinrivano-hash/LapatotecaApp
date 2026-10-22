/**
 * La planilla de la semana, con lo que se planificó y lo que se observa.
 *
 * Junta tres cosas que viven en lugares distintos: los turnos, la
 * ocupación de cada día —para saber si un hueco de cobertura importaba— y
 * los rastros que dejó cada persona.
 *
 * Sobre los rastros: hoy son los **reportes y los incidentes**, que son
 * los únicos registros que llevan el nombre de quien los hizo. Marcar una
 * llegada no guarda quién apretó el botón, así que el trabajo más
 * frecuente del turno no deja rastro atribuible. Eso se arregla agregando
 * una columna `marcado_por`, y hasta entonces conviene no olvidarlo: un
 * turno sin rastros puede ser un turno tranquilo, no un turno ausente.
 */

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
import { fechaISO, minutosDelDia, rangoFechas } from "@/lib/utils/fecha";
import type { FechaISO, ID, OcupacionDia, Turno } from "@/lib/types";

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

  for (const r of reportes) anotar(r.fecha, r.autorStaff, r.creadoEn, "un reporte");
  for (const i of incidentes) {
    anotar(i.fecha, i.autorStaff, i.creadoEn, "un incidente");
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
  const rastros = indexarRastros(
    reportes.filter((r) => r.fecha >= desde && r.fecha <= hasta),
    incidentes,
  );

  return rangoFechas(desde, hasta).map((fecha) => {
    const ocupacion = calcularOcupacionDia(fecha, ocupantes);

    // Cuántos perros había en cada franja, para saber si un hueco de
    // cobertura dejó la casa sola o solo dejó la casa vacía.
    const perrosEn = (minuto: number) =>
      ocupacion.slots.find((s) => s.minutoDelDia === minuto)?.total ?? 0;

    const delDia = turnos.filter((t) => t.fecha === fecha);
    const franjas = coberturaDelDia(delDia, perrosEn);

    return {
      fecha,
      ocupacion,
      franjas,
      huecos: huecosDeCobertura(franjas),
      turnos: delDia
        .map((turno) => {
          const persona = gente.get(turno.perfilId) ?? null;
          const suyos = persona
            ? (rastros.get(`${fecha}|${persona.nombre.trim().toLowerCase()}`) ?? [])
            : [];
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
 */
export async function ficharTurno(
  repo: RepositorioPatoteca,
  turnoId: ID,
  lado: LadoDelFichaje,
  ahora: string = new Date().toISOString(),
): Promise<Turno> {
  const turno = await repo.turnos.obtener(turnoId);
  if (!turno) throw new Error("Ese turno ya no existe.");

  const yaEsta = lado === "entrada" ? turno.entradaReal : turno.salidaReal;
  if (yaEsta) return turno;

  return repo.turnos.actualizar(turnoId,
    lado === "entrada" ? { entradaReal: ahora } : { salidaReal: ahora },
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
