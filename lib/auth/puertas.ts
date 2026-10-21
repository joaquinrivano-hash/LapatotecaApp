/**
 * Qué rol puede entrar a cada rama de la app.
 *
 * Es la decisión del proxy, separada de la mecánica de cookies para poder
 * probarla: con las dos cosas juntas, verificar que un dueño no entra a
 * `/admin` exigiría levantar un servidor.
 *
 * No es lo que protege los datos —eso son las políticas de RLS— sino lo que
 * evita que alguien llegue a una pantalla que no le va a cargar nada.
 */

/** Qué roles pueden entrar. Lista vacía = basta con tener sesión. */
export interface Puerta {
  prefijo: string;
  roles: string[];
}

export const PUERTAS: Puerta[] = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/staff", roles: ["staff", "admin"] },
  { prefijo: "/mi-cuenta", roles: [] },
];

/** A dónde mandar a quien llegó a una puerta que no es la suya. */
const SU_CASA: Record<string, string> = {
  cliente: "/mi-cuenta",
  staff: "/staff",
  admin: "/admin",
};

export type Decision =
  | { tipo: "pasa" }
  | { tipo: "al_login" }
  | { tipo: "a_su_casa"; destino: string };

/**
 * La puerta que custodia esa ruta, si alguna.
 *
 * La comparación es por segmento y no `startsWith` pelado: con el prefijo a
 * secas, una ruta futura como `/administracion-de-fincas` quedaría dentro de
 * la puerta de `/admin` sin que nadie lo pidiera, y quien la escriba no va a
 * entender por qué lo echa el proxy.
 */
export function puertaDe(ruta: string): Puerta | null {
  return (
    PUERTAS.find((p) => ruta === p.prefijo || ruta.startsWith(`${p.prefijo}/`)) ??
    null
  );
}

/** `rol` en null significa que no hay sesión. */
export function decidir(ruta: string, rol: string | null): Decision {
  const puerta = puertaDe(ruta);
  if (!puerta) return { tipo: "pasa" };
  if (rol === null) return { tipo: "al_login" };
  if (puerta.roles.length === 0) return { tipo: "pasa" };
  if (puerta.roles.includes(rol)) return { tipo: "pasa" };

  // Tiene sesión, solo no es su puerta: se lo manda a la suya en vez de al
  // login, que lo dejaría dando vueltas en un formulario ya contestado.
  return { tipo: "a_su_casa", destino: SU_CASA[rol] ?? "/" };
}
