/**
 * El correo de invitación al equipo, del lado del servidor.
 *
 * Mandarlo exige la llave `service_role` de Supabase (`auth.admin.
 * inviteUserByEmail`), que se salta RLS entera. Por eso vive detrás de una
 * ruta y esa ruta revisa primero **quién pide**: con la llave, cualquiera que
 * llegue a la URL podría crear cuentas. Solo pasa una sesión de
 * Administración.
 *
 * La lógica no conoce a Supabase: recibe un puerto. Así se prueba sin red, y
 * lo que se prueba es lo que importa —quién puede, qué se manda y qué se le
 * dice a quien invitó cuando el correo no sale—.
 *
 * Una cosa que no es obvia: invitar **crea la cuenta en ese momento**. El
 * disparador `crear_perfil_al_registrarse` corre ahí mismo, lee la invitación
 * y le pone el rol. Por eso el correo se anota ANTES de mandar, y por eso
 * después la invitación aparece usada aunque la persona todavía no haya
 * abierto el correo: lo que dice si ya entró es si confirmó, no la invitación.
 */

export interface PuertoInvitaciones {
  /** Quién es el dueño del token y qué rol tiene. null si el token no sirve. */
  quienPide(token: string): Promise<{ id: string; rol: string } | null>;
  invitacion(email: string): Promise<{ rol: string; usadaEn: string | null } | null>;
  /** Crea la cuenta y manda el correo. Reenviar a quien no confirmó, también. */
  invitar(
    email: string,
    opciones: { nombre?: string; redirigirA: string },
  ): Promise<{ error: string | null }>;
  /** Los correos con invitación ya usada. */
  invitacionesUsadas(): Promise<string[]>;
  /** De esos correos, cuáles tienen cuenta pero no han abierto el enlace. */
  sinConfirmar(emails: string[]): Promise<string[]>;
}

export type Respuesta<T> =
  | { ok: true; datos: T }
  | { ok: false; estado: number; motivo: string };

/** Lo que se ve si la llave no está: es la primera vez que pasa, siempre. */
export const FALTA_LLAVE =
  "Los correos todavía no están activados: falta cargar SUPABASE_SERVICE_ROLE_KEY " +
  "en las variables de entorno de Vercel.";

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function soloAdministracion(
  puerto: PuertoInvitaciones,
  token: string | null,
): Promise<Respuesta<null>> {
  if (!token) {
    return { ok: false, estado: 401, motivo: "Tu sesión se cerró. Vuelve a entrar." };
  }
  const quien = await puerto.quienPide(token);
  if (!quien) {
    return { ok: false, estado: 401, motivo: "Tu sesión se cerró. Vuelve a entrar." };
  }
  // Invitar es repartir permisos: un cuidador no puede, aunque llegue a la URL.
  if (quien.rol !== "admin") {
    return { ok: false, estado: 403, motivo: "Solo Administración puede invitar." };
  }
  return { ok: true, datos: null };
}

/**
 * Los mensajes de Supabase en lo que Administración puede hacer.
 *
 * El más común al empezar es el del remitente incluido: solo manda a los
 * miembros del equipo del proyecto en Supabase y muy pocos por hora. Dicho
 * así, se entiende que el problema no es el correo de la persona invitada.
 */
export function explicarErrorDeInvitacion(mensaje: string): {
  estado: number;
  motivo: string;
} {
  const m = mensaje.toLowerCase();

  if (m.includes("already been registered") || m.includes("already registered") || m.includes("email_exists")) {
    return {
      estado: 409,
      motivo:
        "Ese correo ya tiene una cuenta activa, así que no hay invitación que mandarle. " +
        "Si ya trabaja acá, puede entrar con su contraseña desde Ingresar.",
    };
  }
  if (m.includes("not authorized")) {
    return {
      estado: 502,
      motivo:
        "Supabase no deja mandar correos a esa dirección: el remitente que trae incluido " +
        "solo escribe a los miembros de tu equipo en Supabase. Configura un SMTP propio " +
        "en Supabase → Authentication → Emails.",
    };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return {
      estado: 429,
      motivo:
        "Supabase llegó a su tope de correos por hora. Espera un rato, o configura un " +
        "SMTP propio en Supabase → Authentication → Emails para no tener ese límite.",
    };
  }
  if (m.includes("error sending") || m.includes("smtp")) {
    return {
      estado: 502,
      motivo:
        "Supabase no pudo mandar el correo. Revisa el SMTP en Supabase → " +
        "Authentication → Emails.",
    };
  }
  return { estado: 502, motivo: `Supabase no pudo mandar el correo: ${mensaje}` };
}

export async function mandarInvitacion(
  puerto: PuertoInvitaciones,
  entrada: { token: string | null; email: unknown; nombre?: unknown; origen: string },
): Promise<Respuesta<{ email: string }>> {
  const permiso = await soloAdministracion(puerto, entrada.token);
  if (!permiso.ok) return permiso;

  const email = typeof entrada.email === "string" ? entrada.email.trim().toLowerCase() : "";
  if (!CORREO.test(email)) {
    return { ok: false, estado: 400, motivo: "Ese correo no parece válido." };
  }

  // Sin invitación anotada la cuenta nacería como dueño: el rol lo pone el
  // disparador leyendo esa fila, no esta ruta.
  if (!(await puerto.invitacion(email))) {
    return {
      ok: false,
      estado: 404,
      motivo: "Primero anota la invitación: sin ella la cuenta nacería como dueño.",
    };
  }

  const nombre =
    typeof entrada.nombre === "string" && entrada.nombre.trim()
      ? entrada.nombre.trim()
      : undefined;

  const { error } = await puerto.invitar(email, {
    nombre,
    redirigirA: `${entrada.origen}/crear-cuenta/equipo/bienvenida`,
  });
  if (error) return { ok: false, ...explicarErrorDeInvitacion(error) };

  return { ok: true, datos: { email } };
}

/** Las invitaciones con correo mandado cuya persona todavía no entra. */
export async function invitacionesEsperando(
  puerto: PuertoInvitaciones,
  token: string | null,
): Promise<Respuesta<{ esperando: string[] }>> {
  const permiso = await soloAdministracion(puerto, token);
  if (!permiso.ok) return permiso;

  const usadas = await puerto.invitacionesUsadas();
  const esperando = usadas.length > 0 ? await puerto.sinConfirmar(usadas) : [];
  return { ok: true, datos: { esperando } };
}
