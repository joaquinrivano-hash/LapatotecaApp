/**
 * Lo que trae el enlace de un correo de Supabase al abrirse.
 *
 * Existe porque el cliente de la app usa el flujo PKCE (`createBrowserClient`
 * de `@supabase/ssr`), y en ese modo la librería **no procesa** un enlace que
 * trae la sesión en el fragmento (`#access_token=…`): lo descarta con "Not a
 * valid PKCE flow url". Y ese es justo el formato del correo de invitación,
 * que lo genera el servidor con la llave de servicio y no tiene un verificador
 * PKCE guardado en este navegador. Sin leerlo a mano, la persona invitada
 * abriría el enlace y la pantalla diría que no sirve.
 *
 * Se aceptan las tres formas en que Supabase puede devolver a la persona:
 * - `#access_token=…&refresh_token=…` — la invitación tal como sale hoy.
 * - `?token_hash=…&type=invite` — si algún día se cambia la plantilla del
 *   correo por la recomendada para apps con servidor.
 * - `#error=…` / `?error=…` — enlace vencido o ya usado.
 */

export type TipoDeEnlace = "invite" | "signup" | "magiclink" | "recovery" | "email";

export type EnlaceDeCorreo =
  | { tipo: "sesion"; accessToken: string; refreshToken: string }
  | { tipo: "verificar"; tokenHash: string; type: TipoDeEnlace }
  | { tipo: "error"; mensaje: string }
  | { tipo: "nada" };

const TIPOS: TipoDeEnlace[] = ["invite", "signup", "magiclink", "recovery", "email"];

export function leerEnlaceDeCorreo(href: string): EnlaceDeCorreo {
  const url = new URL(href);
  const fragmento = new URLSearchParams(url.hash.replace(/^#/, ""));
  const consulta = url.searchParams;
  const leer = (clave: string) => fragmento.get(clave) ?? consulta.get(clave);

  const error = leer("error_code") ?? leer("error");
  if (error) {
    // "otp_expired" es el caso de todos los días: el enlace dura un rato y
    // se gasta al abrirlo. Lo que la persona necesita saber es qué pedir.
    const vencido =
      error === "otp_expired" || /expired|invalid/i.test(leer("error_description") ?? "");
    return {
      tipo: "error",
      mensaje: vencido
        ? "El enlace venció o ya se usó."
        : (leer("error_description") ?? "El enlace no sirve."),
    };
  }

  const accessToken = leer("access_token");
  const refreshToken = leer("refresh_token");
  if (accessToken && refreshToken) {
    return { tipo: "sesion", accessToken, refreshToken };
  }

  const tokenHash = consulta.get("token_hash");
  const type = consulta.get("type") as TipoDeEnlace | null;
  if (tokenHash && type && TIPOS.includes(type)) {
    return { tipo: "verificar", tokenHash, type };
  }

  return { tipo: "nada" };
}
