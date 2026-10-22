/**
 * Lo que el repositorio rechaza.
 *
 * Vive aparte para que las piezas del repositorio local (la agenda, por
 * ejemplo) lo puedan lanzar sin importar `local.ts`, que a su vez las importa
 * a ellas.
 */
export class ErrorRepositorio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorRepositorio";
  }
}
