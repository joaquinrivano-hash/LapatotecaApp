/**
 * Webhook de WhatsApp Business.
 *
 * Meta pega acá con dos cosas:
 *   GET  — la verificación inicial cuando suscribes el webhook en el panel.
 *   POST — los cambios de estado (enviado → entregado → leído → fallido) y los
 *          mensajes que responde el cliente.
 *
 * OJO con el alcance del prototipo: los estados de la bandeja viven en el
 * localStorage del navegador, que el servidor no puede tocar. Así que acá los
 * estados se reciben y se validan, pero no se persisten. Cuando entre la base
 * de datos real, el punto de enganche está marcado abajo.
 */

import { NextResponse } from "next/server";
import { credencialesWhatsApp } from "@/lib/integraciones/config";
import { extraerCambiosDeEstado } from "@/lib/integraciones/mensajeria/webhook";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modo = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const desafio = searchParams.get("hub.challenge");

  const { verifyToken } = credencialesWhatsApp();

  if (!verifyToken) {
    return new NextResponse("Webhook sin WHATSAPP_WEBHOOK_VERIFY_TOKEN.", {
      status: 503,
    });
  }

  if (modo === "subscribe" && token === verifyToken && desafio) {
    return new NextResponse(desafio, { status: 200 });
  }

  return new NextResponse("Verificación rechazada.", { status: 403 });
}

export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const cambios = extraerCambiosDeEstado(cuerpo);

  // ── Punto de enganche ───────────────────────────────────────────────
  // Con base de datos real, acá va:
  //   for (const cambio of cambios) {
  //     await repo.mensajes.actualizarPorIdProveedor(cambio.idProveedor, {...});
  //   }
  // Mientras la bandeja viva en localStorage, el servidor no la alcanza.

  // Meta reintenta si no respondes 200 rápido, así que siempre 200.
  return NextResponse.json({ ok: true, recibidos: cambios.length });
}
