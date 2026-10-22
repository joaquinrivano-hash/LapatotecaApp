/**
 * El correo de invitación, del lado del navegador.
 *
 * La pantalla no habla con Supabase ni conoce la ruta: pide esto. Lo único
 * que se manda es el token de la sesión de quien invita, para que el
 * servidor confirme que es Administración antes de usar la llave de
 * servicio.
 */

import { clienteSupabase } from "@/lib/repo/supabase/cliente";

const RUTA = "/api/equipo/invitaciones";

export type ResultadoCorreo = { ok: true } | { ok: false; motivo: string };

export interface EstadoDeCorreos {
  /** false cuando falta la llave en el servidor: los correos no salen. */
  activos: boolean;
  /** Se le mandó el correo y todavía no lo abre. */
  esperando: string[];
  motivo?: string;
}

async function cabeceras(): Promise<HeadersInit> {
  const { data } = await clienteSupabase().auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function mandarCorreoDeInvitacion(
  email: string,
  nombre?: string,
): Promise<ResultadoCorreo> {
  try {
    const respuesta = await fetch(RUTA, {
      method: "POST",
      headers: await cabeceras(),
      body: JSON.stringify({ email, nombre }),
    });
    const cuerpo = (await respuesta.json()) as { ok: boolean; motivo?: string };
    return cuerpo.ok
      ? { ok: true }
      : { ok: false, motivo: cuerpo.motivo ?? "No pudimos mandar el correo." };
  } catch {
    return { ok: false, motivo: "No pudimos conectarnos. Revisa tu conexión." };
  }
}

export async function estadoDeCorreos(): Promise<EstadoDeCorreos> {
  try {
    const respuesta = await fetch(RUTA, { headers: await cabeceras() });
    const cuerpo = (await respuesta.json()) as {
      ok: boolean;
      esperando?: string[];
      motivo?: string;
    };
    if (respuesta.status === 503) {
      return { activos: false, esperando: [], motivo: cuerpo.motivo };
    }
    return { activos: true, esperando: cuerpo.esperando ?? [], motivo: cuerpo.motivo };
  } catch {
    // Sin red no se sabe; se asume activo para no mostrar un aviso falso.
    return { activos: true, esperando: [] };
  }
}
