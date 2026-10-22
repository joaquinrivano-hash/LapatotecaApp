/**
 * Invitaciones al equipo por correo.
 *
 * POST manda (o reenvía) el correo para crear la cuenta; GET dice a quién se
 * le mandó y todavía no entra. Las dos cosas necesitan la llave
 * `service_role`, que se salta RLS entera, así que esta ruta existe para que
 * esa llave **nunca llegue al navegador**, igual que el token de WhatsApp.
 *
 * La decisión de quién puede vive en `lib/integraciones/equipo/servidor.ts`:
 * acá solo se conecta con Supabase. Sin la llave responde 503 con el motivo,
 * y la pantalla sigue ofreciendo mandar el enlace por WhatsApp.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  FALTA_LLAVE,
  invitacionesEsperando,
  mandarInvitacion,
  type PuertoInvitaciones,
  type Respuesta,
} from "@/lib/integraciones/equipo/servidor";

/** Cuántas cuentas pide por página al buscar quién no ha confirmado. */
const POR_PAGINA = 1000;

function puertoSupabase(): PuertoInvitaciones | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) return null;

  const admin = createClient(url, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async quienPide(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      // El rol de la tabla y no del token: es el que dice la verdad de ahora.
      const { data: perfil } = await admin
        .from("perfiles")
        .select("rol")
        .eq("id", data.user.id)
        .maybeSingle();
      return { id: data.user.id, rol: (perfil as { rol?: string } | null)?.rol ?? "cliente" };
    },

    async invitacion(email) {
      const { data } = await admin
        .from("invitaciones")
        .select("rol, usada_en")
        .eq("email", email)
        .maybeSingle();
      const fila = data as { rol: string; usada_en: string | null } | null;
      return fila ? { rol: fila.rol, usadaEn: fila.usada_en } : null;
    },

    async invitar(email, { nombre, redirigirA }) {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirigirA,
        // El disparador saca de acá el nombre del perfil, que es con el que
        // la persona firma reportes e incidentes.
        data: nombre ? { nombre } : undefined,
      });
      return { error: error?.message ?? null };
    },

    async invitacionesUsadas() {
      const { data } = await admin
        .from("invitaciones")
        .select("email")
        .not("usada_en", "is", null);
      return ((data as { email: string }[] | null) ?? []).map((f) => f.email);
    },

    async sinConfirmar(emails) {
      const buscados = new Set(emails);
      const esperando: string[] = [];
      for (let pagina = 1; ; pagina += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
          page: pagina,
          perPage: POR_PAGINA,
        });
        if (error) break;
        for (const usuario of data.users) {
          const email = usuario.email?.toLowerCase();
          if (email && buscados.has(email) && !usuario.email_confirmed_at) {
            esperando.push(email);
          }
        }
        if (data.users.length < POR_PAGINA) break;
      }
      return esperando;
    },
  };
}

function tokenDe(peticion: Request): string | null {
  const cabecera = peticion.headers.get("authorization") ?? "";
  const [tipo, token] = cabecera.split(" ");
  return tipo?.toLowerCase() === "bearer" && token ? token : null;
}

function responder<T>(r: Respuesta<T>) {
  return r.ok
    ? NextResponse.json({ ok: true, ...r.datos })
    : NextResponse.json({ ok: false, motivo: r.motivo }, { status: r.estado });
}

export async function POST(peticion: Request) {
  const puerto = puertoSupabase();
  if (!puerto) {
    return NextResponse.json({ ok: false, motivo: FALTA_LLAVE }, { status: 503 });
  }

  let cuerpo: { email?: unknown; nombre?: unknown };
  try {
    cuerpo = await peticion.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "La petición no trae datos." }, { status: 400 });
  }

  return responder(
    await mandarInvitacion(puerto, {
      token: tokenDe(peticion),
      email: cuerpo.email,
      nombre: cuerpo.nombre,
      // El correo tiene que volver al mismo sitio desde donde se invitó: la
      // vista previa de `pruebas` a la suya, producción a la suya.
      origen: new URL(peticion.url).origin,
    }),
  );
}

export async function GET(peticion: Request) {
  const puerto = puertoSupabase();
  if (!puerto) {
    return NextResponse.json({ ok: false, motivo: FALTA_LLAVE }, { status: 503 });
  }
  return responder(await invitacionesEsperando(puerto, tokenDe(peticion)));
}
