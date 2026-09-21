/**
 * Envío por WhatsApp Business (Cloud API).
 *
 * Esta ruta existe para que el token NUNCA llegue al navegador. El cliente
 * manda el mensaje acá y el servidor habla con Meta.
 *
 * Para activarla: completa las credenciales en `.env.local` y pon
 * `NEXT_PUBLIC_CANAL_MENSAJERIA=whatsapp`. Sin credenciales responde 503 con
 * el motivo, y el mensaje queda como fallido en la bandeja con ese texto.
 */

import { NextResponse } from "next/server";
import {
  credencialesWhatsApp,
  whatsAppConfigurado,
} from "@/lib/integraciones/config";
import type { ResultadoEnvio } from "@/lib/integraciones/tipos";
import type { MensajeSaliente } from "@/lib/types";

interface ParametroWhatsApp {
  type: "text" | "image";
  text?: string;
  image?: { link: string };
}

interface ComponenteWhatsApp {
  type: "header" | "body";
  parameters: ParametroWhatsApp[];
}

function construirPayload(mensaje: MensajeSaliente) {
  const componentes: ComponenteWhatsApp[] = [];

  if (mensaje.adjuntoUrl) {
    componentes.push({
      type: "header",
      parameters: [{ type: "image", image: { link: mensaje.adjuntoUrl } }],
    });
  }

  componentes.push({
    type: "body",
    parameters: mensaje.parametros.map((texto) => ({
      type: "text" as const,
      text: texto,
    })),
  });

  return {
    messaging_product: "whatsapp",
    // Meta quiere el número sin el "+".
    to: mensaje.destino.replace(/^\+/, ""),
    type: "template",
    template: {
      name: mensaje.plantilla,
      language: { code: mensaje.idioma },
      components: componentes,
    },
  };
}

export async function POST(request: Request) {
  if (!whatsAppConfigurado()) {
    return NextResponse.json<ResultadoEnvio>(
      {
        ok: false,
        simulado: false,
        error:
          "Faltan las credenciales de WhatsApp Business. Revisa WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN en .env.local.",
      },
      { status: 503 },
    );
  }

  let mensaje: MensajeSaliente;
  try {
    mensaje = (await request.json()) as MensajeSaliente;
  } catch {
    return NextResponse.json<ResultadoEnvio>(
      { ok: false, simulado: false, error: "El cuerpo no es JSON válido." },
      { status: 400 },
    );
  }

  if (!mensaje?.destino || !mensaje?.plantilla) {
    return NextResponse.json<ResultadoEnvio>(
      {
        ok: false,
        simulado: false,
        error: "El mensaje necesita destino y plantilla.",
      },
      { status: 400 },
    );
  }

  const { phoneNumberId, accessToken, version } = credencialesWhatsApp();

  try {
    const respuesta = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(construirPayload(mensaje)),
      },
    );

    const cuerpo = (await respuesta.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };

    if (!respuesta.ok) {
      return NextResponse.json<ResultadoEnvio>(
        {
          ok: false,
          simulado: false,
          error:
            cuerpo.error?.message ??
            `WhatsApp respondió ${respuesta.status}.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json<ResultadoEnvio>({
      ok: true,
      simulado: false,
      idProveedor: cuerpo.messages?.[0]?.id,
    });
  } catch (error) {
    return NextResponse.json<ResultadoEnvio>(
      {
        ok: false,
        simulado: false,
        error:
          error instanceof Error
            ? error.message
            : "No pudimos contactar a WhatsApp.",
      },
      { status: 502 },
    );
  }
}
