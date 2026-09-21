import type { DiaDeStaff } from "@/lib/servicios/asistencia";
import type { EstadiaJardin, ReservaHotel } from "@/lib/types";
import type { EstadoAsistencia, ItemAsistencia } from "./fila-asistencia";

const ESTADO_JARDIN: Record<EstadiaJardin["estado"], EstadoAsistencia | null> = {
  esperada: "esperado",
  presente: "presente",
  finalizada: "cerrado",
  no_show: "no_llego",
  cancelada: null,
};

const ESTADO_HOTEL: Record<ReservaHotel["estado"], EstadoAsistencia | null> = {
  pendiente: "esperado",
  confirmada: "esperado",
  en_curso: "presente",
  finalizada: "cerrado",
  no_show: "no_llego",
  cancelada: null,
};

/**
 * Aplana el día en una sola lista ordenada por hora, mezclando jardín y hotel.
 * El staff no piensa en "líneas de negocio": piensa en qué perro entra ahora.
 */
export function itemsDelDia(dia: DiaDeStaff): ItemAsistencia[] {
  const perro = (id: string) => dia.perros.find((p) => p.id === id);
  const cliente = (id: string) => dia.clientes.find((c) => c.id === id);

  const items: ItemAsistencia[] = [];

  for (const estadia of dia.estadias) {
    const estado = ESTADO_JARDIN[estadia.estado];
    const suPerro = perro(estadia.perroId);
    if (!estado || !suPerro) continue;

    items.push({
      id: estadia.id,
      linea: "jardin",
      perro: suPerro,
      cliente: cliente(estadia.clienteId),
      estado,
      inicioProgramado: estadia.inicioProgramado,
      finProgramado: estadia.finProgramado,
      inicioReal: estadia.inicioReal,
      finReal: estadia.finReal,
      origen: estadia.origen,
    });
  }

  for (const reserva of dia.reservas) {
    const estado = ESTADO_HOTEL[reserva.estado];
    const suPerro = perro(reserva.perroId);
    if (!estado || !suPerro) continue;

    items.push({
      id: reserva.id,
      linea: "hotel",
      perro: suPerro,
      cliente: cliente(reserva.clienteId),
      estado,
      inicioProgramado: reserva.inicioProgramado,
      finProgramado: reserva.finProgramado,
      inicioReal: reserva.inicioReal,
      finReal: reserva.finReal,
    });
  }

  return items.sort((a, b) =>
    (a.inicioReal ?? a.inicioProgramado).localeCompare(
      b.inicioReal ?? b.inicioProgramado,
    ),
  );
}
