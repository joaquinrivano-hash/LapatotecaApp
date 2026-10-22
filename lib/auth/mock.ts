/**
 * La identidad del prototipo: la que se elige en el selector de rol.
 *
 * No hay contraseñas ni cuentas. El rol vive en el navegador, así que
 * cualquiera abre las herramientas de desarrollo y se pone `admin`. Eso está
 * bien para una demo y es exactamente el motivo por el que el selector no
 * puede existir en producción.
 *
 * Las operaciones que piden contraseña fallan con un mensaje que lo explica,
 * en vez de devolver algo inventado: si alguna pantalla las llama en modo
 * prototipo, es un error de la pantalla y conviene que se vea.
 */

import {
  ErrorAutenticacion,
  type Autenticacion,
  type Identidad,
} from "@/lib/auth/tipos";
import { useSesion } from "@/lib/store/sesion";

const SIN_CONTRASENAS =
  "En el prototipo no hay contraseñas: la identidad se elige en el selector " +
  "de rol.";

function leer(): Identidad | null {
  const { rol, clienteId, staff } = useSesion.getState();
  return rol ? { rol, clienteId, staff } : null;
}

export function crearAutenticacionMock(): Autenticacion {
  return {
    async actual() {
      return leer();
    },

    async entrar() {
      throw new ErrorAutenticacion(SIN_CONTRASENAS);
    },

    async registrar() {
      throw new ErrorAutenticacion(SIN_CONTRASENAS);
    },

    async recuperar() {
      throw new ErrorAutenticacion(SIN_CONTRASENAS);
    },

    async cambiarClave() {
      throw new ErrorAutenticacion(SIN_CONTRASENAS);
    },

    async abrirDesdeEnlace() {
      throw new ErrorAutenticacion(SIN_CONTRASENAS);
    },

    // En el prototipo no hay enlaces de correo: nunca hay sesión que venga
    // de uno.
    async sesionDelEnlaceDeClave() {
      return null;
    },

    async salir() {
      useSesion.getState().salir();
    },

    /**
     * El store de zustand ya es la fuente de la verdad acá, así que escuchar
     * es suscribirse a él: así `alCambiar` significa lo mismo en los dos
     * mundos y quien escucha no tiene que saber cuál está corriendo.
     */
    alCambiar(escucha) {
      return useSesion.subscribe(() => escucha(leer()));
    },
  };
}
