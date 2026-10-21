/**
 * Quién llama, visto desde el servidor.
 *
 * El selector de rol del prototipo vive en el navegador y cualquiera lo
 * cambia desde las herramientas de desarrollo, así que una ruta que gasta
 * plata (un WhatsApp sale a costo de la cuenta de Meta) no puede creerle.
 * Acá la sesión se valida contra Supabase Auth y el rol se lee de `perfiles`,
 * que es la misma fuente que usan las políticas de la base.
 *
 * Sin Supabase configurado, o sin sesión, no hay rol: la ruta queda cerrada.
 * Es el lado correcto para equivocarse mientras el login real no exista.
 */

import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { Rol } from "@/lib/types";

export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** El rol de quien hizo la petición, o `null` si no hay sesión válida. */
export async function rolDeLaSesion(request: Request): Promise<Rol | null> {
  if (!supabaseConfigurado()) return null;

  const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
  if (cookies.length === 0) return null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () =>
          cookies.map(({ name, value }) => ({ name, value: value ?? "" })),
        // Una ruta de API no refresca la sesión: si el token venció, que
        // vuelva a entrar por la app, que sí sabe escribir las cookies.
        setAll: () => {},
      },
    },
  );

  try {
    // `getUser` y no `getSession`: getSession le cree a la cookie sin
    // preguntarle al servidor de Auth, y la cookie la escribe el navegador.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", data.user.id)
      .maybeSingle<{ rol: Rol }>();

    return perfil?.rol ?? null;
  } catch {
    return null;
  }
}

/** Staff y admin: los que mandan reportes. Igual que `es_equipo()` en la base. */
export function esEquipo(rol: Rol | null): boolean {
  return rol === "staff" || rol === "admin";
}
