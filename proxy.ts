/**
 * Quién puede entrar a cada cara, decidido en el servidor.
 *
 * En Next 16 esto se llama `proxy.ts`: el nombre `middleware.ts` quedó
 * deprecado y la función exportada cambió de nombre con él.
 *
 * Ojo con qué es y qué no es esto. **No es lo que protege los datos** —eso
 * son las políticas de RLS, que viven pegadas a la base y no hay pantalla
 * que saltarse—. Esto evita que alguien sin sesión llegue a `/admin` y vea
 * un backoffice dibujado y vacío, y que un dueño que escribe la URL a mano
 * se quede mirando una pantalla que no le va a cargar nada. Si esto fallara
 * entero, nadie vería un dato que no le toca: vería botones.
 *
 * El archivo se escribe autocontenido a propósito. Next puede desplegar el
 * proxy al borde, separado del código que renderiza, así que no se apoya en
 * módulos compartidos ni en nada global.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { decidir, puertaDe } from "@/lib/auth/puertas";

export async function proxy(peticion: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // En modo prototipo no hay sesiones que revisar: el rol se elige en un
  // selector y vive en el navegador. Cerrar estas rutas ahí dejaría la demo
  // inservible.
  if (process.env.NEXT_PUBLIC_ORIGEN_DATOS !== "supabase" || !url || !llave) {
    return NextResponse.next();
  }

  const ruta = peticion.nextUrl.pathname;
  // Se pregunta antes de armar el cliente: sin puerta no hace falta mirar
  // cookies ni ir a la base.
  const puerta = puertaDe(ruta);
  if (!puerta) return NextResponse.next();

  let respuesta = NextResponse.next({ request: peticion });

  const sb = createServerClient(url, llave, {
    cookies: {
      getAll: () => peticion.cookies.getAll(),
      setAll: (galletas, cabeceras) => {
        // La respuesta se rehace para que las cookies refrescadas viajen
        // tanto a la petición que se va a renderizar como al navegador.
        respuesta = NextResponse.next({ request: peticion });
        for (const { name, value, options } of galletas) {
          peticion.cookies.set(name, value);
          respuesta.cookies.set(name, value, options);
        }
        // Y estas cabeceras no son opcionales: una respuesta que escribe
        // cookies de sesión no se puede cachear, o un CDN le entrega el
        // token de una persona a la siguiente que pase.
        for (const [clave, valor] of Object.entries(cabeceras)) {
          respuesta.headers.set(clave, valor);
        }
      },
    },
  });

  // getUser y no getSession: getSession lee la cookie sin verificarla, así
  // que un token vencido o escrito a mano pasaría la puerta.
  const { data, error } = await sb.auth.getUser();
  const usuario = error ? null : data.user;

  if (!usuario) {
    const alLogin = new URL("/ingresar", peticion.url);
    // Para volver a donde iba después de entrar. Solo la ruta, nunca una
    // URL completa: con un destino absoluto esto sería un redirector
    // abierto hacia cualquier dominio.
    alLogin.searchParams.set("volver", ruta);
    return NextResponse.redirect(alLogin);
  }

  // Basta con tener sesión: no hace falta ir a buscar el rol.
  if (puerta.roles.length === 0) return respuesta;

  /**
   * El rol sale de la tabla, no del token.
   *
   * Es una consulta por navegación a una ruta protegida. Con los volúmenes
   * de la casa eso no se nota, y a cambio el rol siempre es el de ahora: si
   * Administración asciende a alguien, no hay que esperar a que se le
   * refresque el token. Si algún día pesara, el camino es meter el rol en el
   * token con un custom access token hook.
   */
  const { data: perfil } = await sb
    .from("perfiles")
    .select("rol")
    .eq("id", usuario.id)
    .maybeSingle();

  const rol = (perfil as { rol?: string } | null)?.rol ?? "cliente";
  const veredicto = decidir(ruta, rol);

  // `al_login` no puede salir acá —ya hay usuario— y se nombra igual en vez
  // de taparlo con un valor por defecto: si algún día la regla cambia, esto
  // tiene que dejar de compilar y no elegir un destino solo.
  if (veredicto.tipo === "a_su_casa") {
    return NextResponse.redirect(new URL(veredicto.destino, peticion.url));
  }
  return respuesta;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/staff",
    "/staff/:path*",
    "/mi-cuenta",
    "/mi-cuenta/:path*",
  ],
};
