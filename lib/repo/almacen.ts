/**
 * Persistencia del prototipo.
 *
 * localStorage no existe en el servidor y puede fallar en modo incógnito o
 * por cuota, así que todo acceso va envuelto: si falla, el prototipo sigue
 * funcionando en memoria en vez de caerse.
 */

export interface Almacen {
  leer<T>(clave: string): T | null;
  escribir<T>(clave: string, valor: T): void;
  borrar(clave: string): void;
  /** true si lo escrito sobrevive a un refresh. */
  readonly persistente: boolean;
}

export function crearAlmacenMemoria(): Almacen {
  const mapa = new Map<string, string>();
  return {
    persistente: false,
    leer<T>(clave: string): T | null {
      const crudo = mapa.get(clave);
      return crudo ? (JSON.parse(crudo) as T) : null;
    },
    escribir<T>(clave: string, valor: T) {
      mapa.set(clave, JSON.stringify(valor));
    },
    borrar(clave: string) {
      mapa.delete(clave);
    },
  };
}

function hayLocalStorage(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const prueba = "__patoteca__";
    window.localStorage.setItem(prueba, "1");
    window.localStorage.removeItem(prueba);
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorage cuando está disponible, memoria cuando no (servidor, incógnito,
 * cuota llena). El resto del código no necesita saber cuál le tocó.
 */
export function crearAlmacenLocal(): Almacen {
  if (!hayLocalStorage()) return crearAlmacenMemoria();

  const respaldo = crearAlmacenMemoria();

  return {
    persistente: true,
    leer<T>(clave: string): T | null {
      try {
        const crudo = window.localStorage.getItem(clave);
        return crudo ? (JSON.parse(crudo) as T) : null;
      } catch {
        return respaldo.leer<T>(clave);
      }
    },
    escribir<T>(clave: string, valor: T) {
      try {
        window.localStorage.setItem(clave, JSON.stringify(valor));
      } catch {
        // Cuota llena o almacenamiento bloqueado: seguimos en memoria para
        // que la sesión no se rompa a mitad de una demo.
        respaldo.escribir(clave, valor);
      }
    },
    borrar(clave: string) {
      try {
        window.localStorage.removeItem(clave);
      } catch {
        respaldo.borrar(clave);
      }
    },
  };
}
