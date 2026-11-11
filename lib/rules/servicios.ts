/**
 * Servicios spot: spa, paseos sueltos y traslados.
 *
 * Spa y paseos tienen -20% para clientes activos. Los traslados no: su precio
 * depende de la distancia y del horario, no de la relación con el cliente.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PASEOS_POR_PACK, PRECIOS } from "@/lib/config/precios";
import {
  construirCotizacion,
  descuentoSegundoPerro,
  soloAplicables,
} from "@/lib/rules/descuentos";
import {
  formatearDuracion,
  minutosDelDia,
  minutosDesdeHHMM,
} from "@/lib/utils/fecha";
import { formatearCLP } from "@/lib/utils/moneda";
import type {
  Cotizacion,
  DuracionPaseo,
  InstanteISO,
  LineaCotizacion,
  NivelSpa,
} from "@/lib/types";

export type TamanoSpa = "chico" | "grande";

/** Pequeño bajo 10 kg; desde 10 kg y hasta 25, mediano. */
export function tamanoSpa(pesoKg: number): TamanoSpa {
  return pesoKg < NEGOCIO.spa.pesoChicoBajoKg ? "chico" : "grande";
}

export interface EntradaSpa {
  pesoKg: number;
  /** Pelo corto o largo: es lo que decide el precio, con el tamaño. */
  nivel: NivelSpa;
  indicePerro?: number;
}

/**
 * El baño, con los precios del afiche.
 *
 * **No lleva descuento de cliente.** Los cuatro valores del afiche son los
 * finales: antes el 20% existía solo en el premium porque el express era un
 * precio de entrada, y ese par dejó de existir. Sigue el descuento por
 * segundo perro, que es de la casa y no del afiche.
 */
export function cotizarSpa(entrada: EntradaSpa): Cotizacion {
  const tamano = tamanoSpa(entrada.pesoKg);

  return construirCotizacion(
    [
      {
        concepto: `Baño ${NOMBRE_PELO[entrada.nivel]}`,
        detalle: `Perro ${tamano === "chico" ? "pequeño" : "mediano"} (${entrada.pesoKg} kg)`,
        monto: PRECIOS.spa[entrada.nivel][tamano],
      },
    ],
    soloAplicables([descuentoSegundoPerro(entrada.indicePerro)]),
  );
}

export const NOMBRE_PELO: Record<NivelSpa, string> = {
  peloCorto: "pelo corto",
  peloLargo: "pelo largo",
};

export interface EntradaPaseo {
  duracionMin: DuracionPaseo;
  /** Cuántos se compran de una vez. Por omisión, uno. */
  cantidad?: number;
  indicePerro?: number;
}

/**
 * Los paseos se compran por cantidad y el equipo los reparte durante la
 * estadía: el dueño no elige el día y la hora de cada uno, porque el paseo
 * se hace cuando el perro está acá y cuando el día lo permite.
 *
 * **Cada tres sale la promo del flyer**, y por eso el cálculo no es una
 * multiplicación: cinco paseos son un pack de tres más dos sueltos. El
 * ahorro va en su propia línea porque es lo que hace comprar tres en vez
 * de uno, y en un total no se ve.
 *
 * Los precios del flyer son los finales, así que no llevan descuento de
 * cliente. Sigue el de segundo perro, que es de la casa.
 */
export function cotizarPaseo(entrada: EntradaPaseo): Cotizacion {
  const cantidad = Math.max(1, Math.round(entrada.cantidad ?? 1));
  return construirCotizacion(
    lineasDePaseos(cantidad, entrada.duracionMin),
    soloAplicables([descuentoSegundoPerro(entrada.indicePerro)]),
  );
}

/**
 * Las líneas de N paseos de una duración: los packs de tres a precio de
 * promo y el resto sueltos.
 *
 * La usan el paseo suelto y el hotel, porque el folleto no distingue: tres
 * paseos de media hora son $10.000 los pida quien los pida. Antes el hotel
 * multiplicaba, y tres paseos durante la estadía salían $12.000.
 */
export function lineasDePaseos(
  cantidad: number,
  duracionMin: DuracionPaseo,
): LineaCotizacion[] {
  const packs = Math.floor(cantidad / PASEOS_POR_PACK);
  const sueltos = cantidad % PASEOS_POR_PACK;
  const suelto = PRECIOS.paseo[duracionMin];
  const lineas: LineaCotizacion[] = [];

  if (sueltos > 0) {
    lineas.push({
      concepto: sueltos === 1 ? "Paseo" : `${sueltos} paseos`,
      detalle: formatearDuracion(duracionMin),
      monto: sueltos * suelto,
    });
  }
  if (packs > 0) {
    const porPack = PRECIOS.paseoPack3[duracionMin];
    lineas.push({
      concepto:
        packs === 1
          ? `Promo ${PASEOS_POR_PACK} paseos`
          : `${packs} packs de ${PASEOS_POR_PACK} paseos`,
      detalle: `${formatearDuracion(duracionMin)} · ahorras ${formatearCLP(
        packs * (PASEOS_POR_PACK * suelto - porPack),
      )}`,
      monto: packs * porPack,
    });
  }
  return lineas;
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
  /** Ida y vuelta: el mismo tramo dos veces. */
  conRegreso?: boolean;
}

/**
 * Traslado: matriz de tramo de distancia por horario, tal como el folleto.
 * No hay precio por kilómetro; hay tramos con precio fijo.
 *
 * Ida y vuelta son DOS viajes del mismo tramo, así que son dos veces el
 * precio. El horario se mira una sola vez, el de la hora agendada: la vuelta
 * podría caer en otra banda, pero de esa hora no sabemos nada todavía y
 * adivinarla sería cobrar por un supuesto.
 */
export function cotizarTraslado(entrada: EntradaTraslado): Cotizacion {
  const enPunta = esHorarioPunta(entrada.fechaHora);
  const tramos = PRECIOS.traslado.tramos;
  const tramo = tramos.find((t) => entrada.km <= t.hastaKm) ?? tramos.at(-1)!;
  const porViaje = enPunta ? tramo.punta : tramo.normal;
  const viajes = entrada.conRegreso ? 2 : 1;

  const indice = tramos.indexOf(tramo);
  const desdeKm = indice === 0 ? 0 : tramos[indice - 1].hastaKm;
  const horario = enPunta ? "horario punta" : "horario normal";

  return construirCotizacion([
    {
      concepto: entrada.conRegreso ? "Traslado ida y vuelta" : "Traslado",
      detalle: entrada.conRegreso
        ? `${desdeKm} a ${tramo.hastaKm} km · ${horario} · 2 viajes`
        : `${desdeKm} a ${tramo.hastaKm} km · ${horario}`,
      monto: porViaje * viajes,
    },
  ]);
}

/** Hasta dónde llega la tarifa con tramo definido. */
export function kmMaximoConTarifa(): number {
  return PRECIOS.traslado.tramos.at(-1)!.hastaKm;
}
