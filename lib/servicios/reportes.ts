/**
 * Reportes e incidentes, con su aviso por WhatsApp.
 *
 * Guarda primero, avisa después: si el envío falla, el reporte igual quedó
 * registrado y el mensaje queda en la bandeja para reintentar.
 */

import {
  armarMensajeDeIncidente,
  armarMensajesDeReporte,
} from "@/lib/integraciones/mensajeria/armado";
import { despacharArmado, type ResultadoDespacho } from "@/lib/integraciones/mensajeria/servicio";
import type { CanalMensajeria } from "@/lib/integraciones/tipos";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { fechaISO } from "@/lib/utils/fecha";
import type {
  GravedadIncidente,
  ID,
  Incidente,
  InstanteISO,
  Reporte,
  TipoIncidente,
} from "@/lib/types";

export interface ResultadoReporte {
  reporte: Reporte;
  despacho: ResultadoDespacho;
}

export async function crearYEnviarReporte(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  datos: {
    perroIds: ID[];
    nota: string;
    fotoUrl?: string;
    autorStaff: string;
  },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoReporte> {
  const reporte = await repo.reportes.crear({
    perroIds: datos.perroIds,
    fecha: fechaISO(ahora),
    nota: datos.nota.trim(),
    fotoUrl: datos.fotoUrl,
    autorStaff: datos.autorStaff,
    creadoEn: ahora,
  });

  const [perros, clientes] = await Promise.all([
    repo.perros.listar(),
    repo.clientes.listar(),
  ]);

  const armado = armarMensajesDeReporte({ reporte, perros, clientes, ahora });
  const despacho = await despacharArmado(repo, canal, armado, ahora);

  return { reporte, despacho };
}

export interface ResultadoIncidente {
  incidente: Incidente;
  despacho: ResultadoDespacho | null;
}

export async function crearIncidente(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  datos: {
    perroId: ID;
    tipo: TipoIncidente;
    gravedad: GravedadIncidente;
    descripcion: string;
    autorStaff: string;
    /** Si además hay que avisarle al dueño por WhatsApp. */
    avisarAlDueno: boolean;
  },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoIncidente> {
  const incidente = await repo.incidentes.crear({
    perroId: datos.perroId,
    fecha: fechaISO(ahora),
    tipo: datos.tipo,
    gravedad: datos.gravedad,
    descripcion: datos.descripcion.trim(),
    autorStaff: datos.autorStaff,
    creadoEn: ahora,
  });

  if (!datos.avisarAlDueno) return { incidente, despacho: null };

  const perro = await repo.perros.obtener(datos.perroId);
  const cliente = perro ? await repo.clientes.obtener(perro.clienteId) : null;

  if (!perro || !cliente) {
    return {
      incidente,
      despacho: {
        mensajes: [],
        enviados: 0,
        fallidos: 0,
        omitidos: [
          {
            clienteId: perro?.clienteId ?? "",
            nombre: "Dueño desconocido",
            motivo: "No encontramos la ficha del dueño.",
          },
        ],
      },
    };
  }

  const armado = armarMensajeDeIncidente({ incidente, perro, cliente, ahora });
  return {
    incidente,
    despacho: await despacharArmado(repo, canal, armado, ahora),
  };
}
