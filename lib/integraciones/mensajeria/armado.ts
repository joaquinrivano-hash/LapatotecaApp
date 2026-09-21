/**
 * Armado de mensajes salientes. Funciones puras: no tocan repositorio ni red,
 * así que se pueden testear de verdad.
 *
 * Regla clave: un reporte puede cubrir varios perros de distintos dueños, y
 * cada dueño recibe UN solo mensaje con sus perros nombrados. Nadie recibe
 * tres WhatsApps seguidos porque su vecino también estaba en la foto.
 */

import {
  listarNombres,
  PLANTILLAS,
  renderizarPlantilla,
} from "@/lib/integraciones/mensajeria/plantillas";
import { aE164 } from "@/lib/utils/telefono";
import type { SinId } from "@/lib/repo/tipos";
import type {
  Cliente,
  ID,
  Incidente,
  InstanteISO,
  MensajeSaliente,
  Perro,
  Reporte,
} from "@/lib/types";

export interface DestinatarioOmitido {
  clienteId: ID;
  nombre: string;
  motivo: string;
}

export interface ArmadoMensajes {
  mensajes: SinId<MensajeSaliente>[];
  /** A quién no se le pudo mandar y por qué. La pantalla lo muestra. */
  omitidos: DestinatarioOmitido[];
}

function base(
  cliente: Cliente,
  destino: string,
  ahora: InstanteISO,
): Pick<
  MensajeSaliente,
  "canal" | "clienteId" | "destino" | "estado" | "intentos" | "creadoEn" | "actualizadoEn"
> {
  return {
    canal: "whatsapp",
    clienteId: cliente.id,
    destino,
    estado: "pendiente",
    intentos: 0,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

export function armarMensajesDeReporte({
  reporte,
  perros,
  clientes,
  ahora,
}: {
  reporte: Reporte;
  perros: Perro[];
  clientes: Cliente[];
  ahora: InstanteISO;
}): ArmadoMensajes {
  const plantilla = PLANTILLAS.reporte_diario;
  const porCliente = new Map<ID, Perro[]>();

  for (const perroId of reporte.perroIds) {
    const perro = perros.find((p) => p.id === perroId);
    if (!perro) continue;
    porCliente.set(perro.clienteId, [
      ...(porCliente.get(perro.clienteId) ?? []),
      perro,
    ]);
  }

  const mensajes: SinId<MensajeSaliente>[] = [];
  const omitidos: DestinatarioOmitido[] = [];

  for (const [clienteId, susPerros] of porCliente) {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) {
      omitidos.push({
        clienteId,
        nombre: "Dueño desconocido",
        motivo: "No encontramos la ficha del dueño.",
      });
      continue;
    }

    const destino = aE164(cliente.telefono);
    if (!destino) {
      omitidos.push({
        clienteId,
        nombre: `${cliente.nombre} ${cliente.apellido}`,
        motivo: "El teléfono no sirve para WhatsApp.",
      });
      continue;
    }

    const parametros = [
      cliente.nombre,
      listarNombres(susPerros.map((p) => p.nombre)),
      reporte.nota,
    ];

    mensajes.push({
      ...base(cliente, destino, ahora),
      plantilla: plantilla.nombre,
      idioma: plantilla.idioma,
      parametros,
      vistaPrevia: renderizarPlantilla(plantilla, parametros),
      adjuntoUrl: reporte.fotoUrl,
      referencia: { tipo: "reporte", id: reporte.id },
    });
  }

  return { mensajes, omitidos };
}

export function armarMensajeDeIncidente({
  incidente,
  perro,
  cliente,
  ahora,
}: {
  incidente: Incidente;
  perro: Perro;
  cliente: Cliente;
  ahora: InstanteISO;
}): ArmadoMensajes {
  const plantilla = PLANTILLAS.aviso_incidente;
  const destino = aE164(cliente.telefono);

  if (!destino) {
    return {
      mensajes: [],
      omitidos: [
        {
          clienteId: cliente.id,
          nombre: `${cliente.nombre} ${cliente.apellido}`,
          motivo: "El teléfono no sirve para WhatsApp.",
        },
      ],
    };
  }

  const parametros = [cliente.nombre, perro.nombre, incidente.descripcion];

  return {
    omitidos: [],
    mensajes: [
      {
        ...base(cliente, destino, ahora),
        plantilla: plantilla.nombre,
        idioma: plantilla.idioma,
        parametros,
        vistaPrevia: renderizarPlantilla(plantilla, parametros),
        referencia: { tipo: "incidente", id: incidente.id },
      },
    ],
  };
}
