/**
 * Servicios spot: spa, paseos sueltos y traslados.
 *
 * Spa y paseos tienen -20% para clientes activos. Los traslados no: su precio
 * depende de la distancia y del horario, no de la relación con el cliente.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import {
  construirCotizacion,
  descuentoClienteActivo,
  descuentoSegundoPerro,
  soloAplicables,
} from "@/lib/rules/descuentos";
import {
  formatearDuracion,
  minutosDelDia,
  minutosDesdeHHMM,
} from "@/lib/utils/fecha";
import type {
  Cotizacion,
  DuracionPaseo,
  InstanteISO,
  LineaCotizacion,
  NivelSpa,
} from "@/lib/types";

export type TamanoSpa = "chico" | "grande";

export function tamanoSpa(pesoKg: number): TamanoSpa {
  return pesoKg <= NEGOCIO.spa.pesoMaximoChicoKg ? "chico" : "grande";
}

export interface EntradaSpa {
  pesoKg: number;
  nivel: NivelSpa;
  esClienteActivo?: boolean;
  indicePerro?: number;
}

export function cotizarSpa(entrada: EntradaSpa): Cotizacion {
  const tamano = tamanoSpa(entrada.pesoKg);
  const monto = PRECIOS.spa[entrada.nivel][tamano];

  return construirCotizacion(
    [
      {
        concepto: entrada.nivel === "express" ? "Spa express" : "Spa premium",
        detalle: `Perro ${tamano} (${entrada.pesoKg} kg)`,
        monto,
      },
    ],
    soloAplicables([
      descuentoSegundoPerro(entrada.indicePerro),
      descuentoClienteActivo(entrada.esClienteActivo ?? false),
    ]),
  );
}

export interface EntradaPaseo {
  duracionMin: DuracionPaseo;
  esClienteActivo?: boolean;
  indicePerro?: number;
}

export function cotizarPaseo(entrada: EntradaPaseo): Cotizacion {
  return construirCotizacion(
    [
      {
        concepto: "Paseo",
        detalle: formatearDuracion(entrada.duracionMin),
        monto: PRECIOS.paseo[entrada.duracionMin],
      },
    ],
    soloAplicables([
      descuentoSegundoPerro(entrada.indicePerro),
      descuentoClienteActivo(entrada.esClienteActivo ?? false),
    ]),
  );
}

/** Horario punta según los tramos configurados, en hora de Santiago. */
export function esHorarioPunta(instante: InstanteISO): boolean {
  const minutos = minutosDelDia(instante);
  return NEGOCIO.traslado.horariosPunta.some(
    ({ desde, hasta }) =>
      minutos >= minutosDesdeHHMM(desde) && minutos < minutosDesdeHHMM(hasta),
  );
}

export interface EntradaTraslado {
  km: number;
  fechaHora: InstanteISO;
}

/**
 * Traslado: base que cubre los primeros 5 km, más $700 por km adicional y
 * $2.000 si cae en horario punta. Nunca pasa del tope de $15.000, así que el
 * cliente siempre sabe cuánto es lo máximo que puede costar.
 */
export function cotizarTraslado(entrada: EntradaTraslado): Cotizacion {
  const kmAdicionales = Math.max(
    0,
    Math.ceil(entrada.km - NEGOCIO.traslado.kmIncluidos),
  );
  const enPunta = esHorarioPunta(entrada.fechaHora);

  const bruto =
    PRECIOS.traslado.base +
    kmAdicionales * PRECIOS.traslado.porKmAdicional +
    (enPunta ? PRECIOS.traslado.recargoHorarioPunta : 0);

  // El tope se reparte recortando primero el recargo y después los km, para
  // que el desglose siga cuadrando con el total.
  const excedente = Math.max(0, bruto - PRECIOS.traslado.tope);

  const lineas: LineaCotizacion[] = [
    {
      concepto: "Traslado",
      detalle: `Base hasta ${NEGOCIO.traslado.kmIncluidos} km`,
      monto: PRECIOS.traslado.base,
    },
  ];

  if (kmAdicionales > 0) {
    lineas.push({
      concepto: "Kilómetros adicionales",
      detalle: `${kmAdicionales} km sobre los ${NEGOCIO.traslado.kmIncluidos} incluidos`,
      monto: kmAdicionales * PRECIOS.traslado.porKmAdicional,
    });
  }

  if (enPunta) {
    lineas.push({
      concepto: "Horario punta",
      detalle: "Recargo por congestión",
      monto: PRECIOS.traslado.recargoHorarioPunta,
    });
  }

  if (excedente > 0) {
    lineas.push({
      concepto: "Tope de traslado",
      detalle: `El traslado nunca supera los ${PRECIOS.traslado.tope.toLocaleString("es-CL")} pesos`,
      monto: -excedente,
    });
  }

  return construirCotizacion(lineas);
}
