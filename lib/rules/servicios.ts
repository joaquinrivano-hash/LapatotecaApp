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
  NivelSpa,
} from "@/lib/types";

export type TamanoSpa = "chico" | "grande";

/** Pequeño bajo 10 kg; desde 10 kg y hasta 25, mediano. */
export function tamanoSpa(pesoKg: number): TamanoSpa {
  return pesoKg < NEGOCIO.spa.pesoChicoBajoKg ? "chico" : "grande";
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

  // El 20% a clientes aplica SOLO al baño premium: el express ya está al
  // precio de entrada y no lleva descuento.
  const aplicaDescuento =
    (entrada.esClienteActivo ?? false) &&
    (!NEGOCIO.spa.descuentoSoloEnPremium || entrada.nivel === "premium");

  return construirCotizacion(
    [
      {
        concepto: entrada.nivel === "express" ? "Baño express" : "Baño premium",
        detalle: `Perro ${tamano === "chico" ? "pequeño" : "mediano"} (${entrada.pesoKg} kg)`,
        monto,
      },
    ],
    soloAplicables([
      descuentoSegundoPerro(entrada.indicePerro),
      descuentoClienteActivo(aplicaDescuento),
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
 * Traslado: matriz de tramo de distancia por horario, tal como el folleto.
 * No hay precio por kilómetro; hay tramos con precio fijo.
 */
export function cotizarTraslado(entrada: EntradaTraslado): Cotizacion {
  const enPunta = esHorarioPunta(entrada.fechaHora);
  const tramos = PRECIOS.traslado.tramos;
  const tramo = tramos.find((t) => entrada.km <= t.hastaKm) ?? tramos.at(-1)!;
  const monto = enPunta ? tramo.punta : tramo.normal;

  const indice = tramos.indexOf(tramo);
  const desdeKm = indice === 0 ? 0 : tramos[indice - 1].hastaKm;

  return construirCotizacion([
    {
      concepto: "Traslado",
      detalle: `${desdeKm} a ${tramo.hastaKm} km · ${enPunta ? "horario punta" : "horario normal"}`,
      monto,
    },
  ]);
}

/** Hasta dónde llega la tarifa con tramo definido. */
export function kmMaximoConTarifa(): number {
  return PRECIOS.traslado.tramos.at(-1)!.hastaKm;
}
