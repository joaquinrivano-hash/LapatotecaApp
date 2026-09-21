/**
 * Despacho de mensajes: junta el repositorio con el canal.
 *
 * Todo mensaje queda guardado ANTES de intentar enviarlo. Si el envío falla,
 * queda en la bandeja como fallido con su motivo y se puede reintentar; nunca
 * se pierde un reporte porque se cayó la red.
 */

import type { ArmadoMensajes, DestinatarioOmitido } from "@/lib/integraciones/mensajeria/armado";
import type { CanalMensajeria } from "@/lib/integraciones/tipos";
import type { RepositorioPatoteca, SinId } from "@/lib/repo/tipos";
import type { ID, InstanteISO, MensajeSaliente } from "@/lib/types";

export interface ResultadoDespacho {
  mensajes: MensajeSaliente[];
  omitidos: DestinatarioOmitido[];
  enviados: number;
  fallidos: number;
}

async function enviarUno(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  mensaje: MensajeSaliente,
  ahora: InstanteISO,
): Promise<MensajeSaliente> {
  const enCamino = await repo.mensajes.actualizar(mensaje.id, {
    estado: "enviando",
    intentos: mensaje.intentos + 1,
    actualizadoEn: ahora,
    error: undefined,
  });

  const resultado = await canal.enviar(enCamino);

  return repo.mensajes.actualizar(mensaje.id, {
    estado: resultado.ok ? "enviado" : "fallido",
    idProveedor: resultado.idProveedor,
    error: resultado.error,
    actualizadoEn: new Date().toISOString(),
  });
}

export async function despacharArmado(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  armado: ArmadoMensajes,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoDespacho> {
  const guardados: MensajeSaliente[] = [];
  for (const borrador of armado.mensajes) {
    guardados.push(await repo.mensajes.crear(borrador as SinId<MensajeSaliente>));
  }

  const mensajes: MensajeSaliente[] = [];
  for (const mensaje of guardados) {
    // Uno a uno y sin cortar: que un teléfono malo no deje sin reporte al
    // resto de los dueños.
    mensajes.push(await enviarUno(repo, canal, mensaje, ahora));
  }

  return {
    mensajes,
    omitidos: armado.omitidos,
    enviados: mensajes.filter((m) => m.estado !== "fallido").length,
    fallidos: mensajes.filter((m) => m.estado === "fallido").length,
  };
}

export async function reintentarMensaje(
  repo: RepositorioPatoteca,
  canal: CanalMensajeria,
  id: ID,
): Promise<MensajeSaliente> {
  const mensaje = await repo.mensajes.obtener(id);
  if (!mensaje) throw new Error(`No existe el mensaje ${id}`);
  return enviarUno(repo, canal, mensaje, new Date().toISOString());
}
