/**
 * Contrato del cálculo de distancias.
 *
 * Mismo criterio que el buscador de direcciones y que la mensajería: la
 * pantalla habla con esta interfaz y no sabe que detrás está Google.
 */

export interface CalculadoraDeDistancia {
  /**
   * Cuántos kilómetros hay de la casa a esa dirección, manejando.
   *
   * Devuelve `null` cuando no se pudo averiguar —dirección que no existe,
   * servicio caído, llave sin permiso—. Nunca lanza: el traslado se puede
   * cotizar igual con los km escritos a mano, así que una distancia que no
   * llega no es motivo para trancar la pantalla.
   */
  kmHasta(direccion: string): Promise<number | null>;
}
