/**
 * Contrato del buscador de direcciones.
 *
 * Mismo criterio que la mensajería: la pantalla habla con esta interfaz y no
 * sabe que detrás está Google. Si mañana conviene otro proveedor, se escribe
 * otro adaptador y el formulario no se entera.
 */

/** Un componente de la dirección, en la forma que lo entrega Places. */
export interface ComponenteDireccion {
  longText: string | null;
  shortText: string | null;
  types: string[];
}

/** Lo que se muestra en la lista mientras la persona escribe. */
export interface SugerenciaDireccion {
  id: string;
  /** "Av. Providencia 1234" */
  principal: string;
  /** "Providencia, Región Metropolitana, Chile" */
  secundario: string;
}

/** La dirección ya elegida, con lo que se guarda en la ficha del cliente. */
export interface DireccionElegida {
  /** Calle y número: "Av. Providencia 1234". */
  direccion: string;
  /** Sale de Google, no se le pregunta al dueño. */
  comuna: string;
  /** false si eligió una calle sin número: no sirve para ir a buscar a nadie. */
  tieneNumero: boolean;
}

export interface BuscadorDirecciones {
  sugerir(texto: string): Promise<SugerenciaDireccion[]>;
  elegir(id: string): Promise<DireccionElegida>;
}
