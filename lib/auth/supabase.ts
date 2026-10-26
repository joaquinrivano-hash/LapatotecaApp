/**
 * La identidad de verdad: una sesión de Supabase.
 *
 * Dos cosas que no son obvias y que están acá por un motivo:
 *
 * - **El rol NO sale de la sesión, sale de la tabla `perfiles`.** Podría
 *   viajar en el token y sería una consulta menos, pero entonces habría que
 *   mantener el token al día cada vez que Administración asciende a alguien,
 *   y mientras no se refresque la persona seguiría con el rol viejo. Leer la
 *   tabla es una consulta y siempre dice la verdad de ahora.
 * - **El rol que la app muestra no es el que la protege.** Si alguien
 *   falsea el rol en el navegador va a ver los botones de admin y la base le
 *   va a devolver cero filas en todo lo que pida. Lo que aísla es RLS; esto
 *   decide qué se dibuja.
 */

import type { AuthError, User } from "@supabase/supabase-js";

import { leerEnlaceDeCorreo } from "@/lib/auth/enlace";
import {
  ErrorAutenticacion,
  type Autenticacion,
  type DatosDeRegistro,
  type Identidad,
} from "@/lib/auth/tipos";
import type { ClienteSupabase } from "@/lib/repo/supabase/cliente";
import type { Rol } from "@/lib/types";

/**
 * Los mensajes de Supabase vienen en inglés y algunos son crípticos incluso
 * en inglés. Lo que la persona necesita leer es qué hacer.
 */
export function explicarAuth(error: AuthError | { message: string }): string {
  const m = error.message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "El correo o la contraseña no calzan.";
  }
  if (m.includes("email not confirmed")) {
    return "Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.";
  }
  if (
    m.includes("user already registered") ||
    m.includes("already been registered")
  ) {
    return "Ya hay una cuenta con ese correo. Entra en vez de crear otra.";
  }
  if (m.includes("password should be at least")) {
    return "La contraseña necesita al menos 6 caracteres.";
  }
  if (m.includes("unable to validate email") || m.includes("invalid email")) {
    return "Ese correo no parece válido.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Demasiados intentos seguidos. Espera un momento y vuelve a probar.";
  }
  /*
   * El correo de confirmación no salió.
   *
   * Es el error que más aparece al abrir un proyecto: el remitente incluido
   * de Supabase manda muy pocos por hora y al pasarse devuelve esto.
   *
   * La versión anterior de este mensaje decía que la cuenta quedaba creada
   * y le pedía a la persona que NO reintentara. Era al revés: Supabase
   * deshace el registro cuando el correo falla —comprobado mirando la tabla
   * de usuarios después de varios intentos fallidos, donde no quedó ninguna
   * cuenta huérfana—. Así que reintentar es exactamente lo que corresponde,
   * y decirle que ya tiene cuenta la dejaba esperando un correo que nunca
   * iba a llegar por una cuenta que no existía.
   */
  if (m.includes("sending confirmation") || m.includes("error sending")) {
    return (
      "No pudimos mandarte el correo de confirmación, así que la cuenta no " +
      "alcanzó a crearse. Vuelve a intentarlo en un rato; si sigue igual, " +
      "escríbenos."
    );
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "No pudimos conectarnos. Revisa tu conexión.";
  }
  return error.message;
}

const ROLES: Rol[] = ["cliente", "staff", "admin"];

function rolValido(valor: unknown): Rol {
  // Un rol que no reconocemos se trata como el menor, nunca como el mayor:
  // equivocarse hacia abajo esconde un botón, hacia arriba dibuja un
  // backoffice.
  return ROLES.includes(valor as Rol) ? (valor as Rol) : "cliente";
}

export function crearAutenticacionSupabase(sb: ClienteSupabase): Autenticacion {
  /**
   * El perfil y la ficha de cliente de un usuario.
   *
   * Las dos consultas van juntas porque no dependen una de la otra y son el
   * costo fijo de cada carga de página.
   */
  async function identidadDe(usuario: User): Promise<Identidad> {
    const [perfil, ficha] = await Promise.all([
      sb
        .from("perfiles")
        .select("rol, nombre")
        .eq("id", usuario.id)
        .maybeSingle(),
      sb
        .from("clientes")
        .select("id")
        .eq("perfil_id", usuario.id)
        .maybeSingle(),
    ]);

    const datos = perfil.data as { rol?: string; nombre?: string } | null;
    const rol = rolValido(datos?.rol);

    return {
      usuarioId: usuario.id,
      email: usuario.email,
      rol,
      clienteId: (ficha.data as { id: string } | null)?.id,
      // Con qué nombre firma los reportes. Si el perfil no trae nombre se
      // usa el correo: es feo en un reporte y es mejor que una firma vacía.
      staff:
        rol === "cliente"
          ? undefined
          : datos?.nombre?.trim() || usuario.email || "Equipo",
    };
  }

  return {
    async actual() {
      // `getUser()` y no `getSession()`: getSession lee la cookie sin
      // verificarla contra el servidor, así que un token vencido o
      // manipulado pasaría como válido para decidir qué dibujar.
      const { data, error } = await sb.auth.getUser();
      if (error || !data.user) return null;
      return identidadDe(data.user);
    },

    async entrar(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw new ErrorAutenticacion(explicarAuth(error));
      if (!data.user) {
        throw new ErrorAutenticacion("No pudimos abrir la sesión.");
      }
      return identidadDe(data.user);
    },

    async registrar(datos: DatosDeRegistro) {
      const { data, error } = await sb.auth.signUp({
        email: datos.email.trim().toLowerCase(),
        password: datos.password,
        options: { data: { nombre: datos.nombre.trim() } },
      });
      if (error) throw new ErrorAutenticacion(explicarAuth(error));

      // Sin sesión, la cuenta existe pero no hay con qué escribir en la
      // base: cualquier insert sería `auth.uid()` nulo y las políticas lo
      // rechazarían. El alta se termina cuando la persona confirme y entre.
      if (!data.session || !data.user) {
        return { identidad: null, faltaConfirmar: true };
      }

      return {
        identidad: await identidadDe(data.user),
        faltaConfirmar: false,
      };
    },

    async recuperar(email) {
      const { error } = await sb.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        typeof window === "undefined"
          ? undefined
          : { redirectTo: `${window.location.origin}/ingresar/clave` },
      );
      if (error) throw new ErrorAutenticacion(explicarAuth(error));
    },

    async cambiarClave(nueva) {
      const { error } = await sb.auth.updateUser({ password: nueva });
      if (error) throw new ErrorAutenticacion(explicarAuth(error));
    },

    /**
     * Dos formatos de enlace, y el nuevo es el que de verdad funciona.
     *
     * - `?token_hash=…&type=recovery` — la app canjea el token acá mismo con
     *   `verifyOtp`. **No necesita nada guardado en este navegador**, así que
     *   el enlace sirve donde se abra: en otro aparato, o en el navegador
     *   interno que usan Gmail y Outlook al tocar un link, que es donde más
     *   se abre y donde el otro camino fallaba sin explicación.
     * - `?code=…` — el camino PKCE. Lo sigue entendiendo porque los correos
     *   ya mandados lo usan y porque la plantilla de Supabase se cambia a
     *   mano: mientras no se cambie, este es el único que llega.
     *
     * Que `verifyOtp` responda bien ES la prueba de que la sesión salió del
     * enlace, y es una garantía más fuerte que la del camino viejo, donde
     * había que deducirlo mirando si la librería había limpiado la barra.
     */
    async sesionDelEnlaceDeClave(direccionAlLlegar) {
      const enlace = leerEnlaceDeCorreo(direccionAlLlegar);

      // Supabase devuelve el motivo en la propia dirección cuando el enlace
      // ya no vale; decirlo es mejor que deducirlo.
      if (enlace.tipo === "error") return { estado: "vencido" };

      if (enlace.tipo === "verificar") {
        // Solo `recovery`. Esta pantalla escribe una contraseña, y el token
        // de otro tipo tiene su propia puerta: aceptarlo acá sería ofrecer
        // una acción que ese correo no proponía.
        if (enlace.type !== "recovery") return { estado: "sin_enlace" };

        const { data, error } = await sb.auth.verifyOtp({
          token_hash: enlace.tokenHash,
          type: "recovery",
        });
        if (error || !data.user) return { estado: "vencido" };
        return { estado: "abierta", identidad: await identidadDe(data.user) };
      }

      const codigo = new URL(direccionAlLlegar).searchParams.get("code");
      if (!codigo) return { estado: "sin_enlace" };

      // `getUser` espera a que la librería termine de leer el enlace.
      const { data, error } = await sb.auth.getUser();
      if (error || !data.user) return { estado: "otro_navegador" };

      // Cuando el enlace sirve, la librería borra el `code` de la barra. Si
      // sigue ahí, no se pudo usar en este navegador —le falta la mitad que
      // quedó guardada donde se pidió el correo— y la sesión que hay es OTRA,
      // anterior: justo la que no hay que tocar.
      const ahora = globalThis.location?.href;
      if (!ahora || new URL(ahora).searchParams.get("code") === codigo) {
        return { estado: "otro_navegador" };
      }
      return { estado: "abierta", identidad: await identidadDe(data.user) };
    },

    async abrirDesdeEnlace(enlace) {
      if (enlace.tipo === "error") throw new ErrorAutenticacion(enlace.mensaje);

      if (enlace.tipo === "sesion") {
        // A mano porque el cliente PKCE descarta este formato (ver enlace.ts).
        const { data, error } = await sb.auth.setSession({
          access_token: enlace.accessToken,
          refresh_token: enlace.refreshToken,
        });
        if (error || !data.user) {
          throw new ErrorAutenticacion(
            error ? explicarAuth(error) : "No pudimos abrir la sesión.",
          );
        }
        return identidadDe(data.user);
      }

      if (enlace.tipo === "verificar") {
        const { data, error } = await sb.auth.verifyOtp({
          token_hash: enlace.tokenHash,
          type: enlace.type,
        });
        if (error || !data.user) {
          throw new ErrorAutenticacion(
            error ? explicarAuth(error) : "No pudimos abrir la sesión.",
          );
        }
        return identidadDe(data.user);
      }

      // Sin nada en la URL puede que la sesión ya esté abierta: la persona
      // recargó la pantalla después de abrir el enlace.
      const { data } = await sb.auth.getUser();
      if (!data.user) {
        throw new ErrorAutenticacion("El enlace venció o ya se usó.");
      }
      return identidadDe(data.user);
    },

    async salir() {
      const { error } = await sb.auth.signOut();
      if (error) throw new ErrorAutenticacion(explicarAuth(error));
    },

    alCambiar(escucha) {
      const { data } = sb.auth.onAuthStateChange((_evento, sesion) => {
        // No se usa `await` acá adentro a propósito: Supabase corre este
        // callback con su propio candado tomado, y cualquier llamada a la
        // librería desde dentro se queda esperando para siempre. Se sale
        // del callback y recién entonces se consulta el perfil.
        const usuario = sesion?.user ?? null;
        setTimeout(() => {
          if (!usuario) {
            escucha(null);
            return;
          }
          identidadDe(usuario).then(escucha, () => escucha(null));
        }, 0);
      });

      return () => data.subscription.unsubscribe();
    },
  };
}
