/**
 * Quién está usando la app.
 *
 * Mismo criterio que el repositorio: la app habla con una interfaz y hay dos
 * implementaciones. En el prototipo la identidad sale de un clic en el
 * selector de rol; en la nube sale de una sesión de Supabase y el rol lo
 * dice la tabla `perfiles`, que solo Administración puede escribir.
 *
 * Lo que la app lee sigue siendo el store de `lib/store/sesion`. En modo
 * nube ese store se llena desde la sesión real en vez de desde el clic, así
 * que las pantallas no tienen que saber en cuál de los dos mundos están.
 */

import type { EnlaceDeCorreo } from "@/lib/auth/enlace";
import type { ID, Rol } from "@/lib/types";

export interface Identidad {
  /** `auth.users.id`. En el prototipo no existe. */
  usuarioId?: ID;
  email?: string;
  rol: Rol;
  /** Si es dueño: su ficha de cliente. */
  clienteId?: ID;
  /** Si trabaja acá: con qué nombre firma reportes e incidentes. */
  staff?: string;
}

export interface DatosDeRegistro {
  email: string;
  password: string;
  /** Para saludarlo y para firmar, si después lo asciende Administración. */
  nombre: string;
}

export interface Registro {
  /** Nula cuando todavía no hay sesión porque falta confirmar el correo. */
  identidad: Identidad | null;
  /**
   * Supabase puede exigir confirmar el correo antes de dar sesión. Cuando lo
   * exige, la cuenta YA existe pero no hay con qué escribir en la base: el
   * resto del alta tiene que esperar a que la persona confirme y entre.
   */
  faltaConfirmar: boolean;
}

/** Lo que falló al entrar o al registrarse, ya traducido. */
export class ErrorAutenticacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorAutenticacion";
  }
}

export interface Autenticacion {
  /** Quién está, o null si nadie. */
  actual(): Promise<Identidad | null>;
  entrar(email: string, password: string): Promise<Identidad>;
  registrar(datos: DatosDeRegistro): Promise<Registro>;
  salir(): Promise<void>;
  /** Manda el correo para elegir una contraseña nueva. */
  recuperar(email: string): Promise<void>;
  /**
   * Escribe una contraseña nueva para quien tenga sesión abierta.
   *
   * No pide la anterior a propósito: se llama después del enlace del correo,
   * cuando justamente el problema es que la persona no se la acuerda. Lo que
   * autoriza el cambio es la sesión que creó ese enlace.
   */
  cambiarClave(nueva: string): Promise<void>;
  /**
   * Quién abrió el enlace de "olvidé mi contraseña" en ESTA carga, o null.
   *
   * No alcanza con `actual()`. Si el enlace se abre en otro navegador que el
   * que lo pidió —lo normal: se pide en el computador y se abre desde el
   * correo del teléfono—, Supabase no lo puede usar ahí y, a propósito, deja
   * la sesión que hubiera. Con `actual()` la pantalla tomaba esa sesión ajena
   * por la del enlace y le cambiaba la contraseña a OTRA cuenta: la que
   * estaba abierta en ese navegador.
   *
   * Recibe la dirección tal como llegó, leída antes de que la librería la
   * limpie.
   */
  sesionDelEnlaceDeClave(direccionAlLlegar: string): Promise<Identidad | null>;
  /**
   * Abre la sesión que trae el enlace de un correo (la invitación al equipo).
   *
   * Recibe el enlace ya leído por `leerEnlaceDeCorreo` y no la URL, para que
   * la pantalla decida cuándo leerla y la pueda borrar de la barra antes de
   * que el token quede en el historial.
   */
  abrirDesdeEnlace(enlace: EnlaceDeCorreo): Promise<Identidad>;
  /**
   * Avisa cuando la sesión cambia: entró, salió, se venció el token, o
   * alguien entró en otra pestaña. Devuelve cómo desuscribirse.
   */
  alCambiar(escucha: (identidad: Identidad | null) => void): () => void;
}
