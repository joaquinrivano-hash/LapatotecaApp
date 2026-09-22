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
import { esDataUrl, leerDataUrl } from "@/lib/integraciones/mensajeria/media";
import type { ResultadoEnvio } from "@/lib/integraciones/tipos";
import type { MensajeSaliente } from "@/lib/types";

type Credenciales = ReturnType<typeof credencialesWhatsApp>;

interface ParametroWhatsApp {
  type: "text" | "image";
  text?: string;
  /** El link sirve para una URL pública; el id, para una foto ya subida. */
  image?: { link?: string; id?: string };
}

interface ComponenteWhatsApp {
  type: "header" | "body";
  parameters: ParametroWhatsApp[];
}

function grafo({ base, version }: Credenciales, recurso: string): string {
  return `${base}/${version}/${recurso}`;
}

function construirPayload(mensaje: MensajeSaliente, idMedia?: string) {
  const componentes: ComponenteWhatsApp[] = [];

  if (mensaje.adjuntoUrl) {
    componentes.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: idMedia ? { id: idMedia } : { link: mensaje.adjuntoUrl },
        },
      ],
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

/**
 * Sube la foto a Meta y devuelve su id.
 *
 * Va aparte del envío porque son dos llamadas distintas y el error de cada una
 * se lee distinto: acá el problema es la foto, allá el mensaje.
 */
async function subirFoto(
  dataUrl: string,
  credenciales: Credenciales,
): Promise<string> {
  const { tipo, bytes, nombreArchivo } = leerDataUrl(dataUrl);

  const formulario = new FormData();
  formulario.append("messaging_product", "whatsapp");
  formulario.append("type", tipo);
  formulario.append("file", new Blob([bytes], { type: tipo }), nombreArchivo);

  const respuesta = await fetch(
    grafo(credenciales, `${credenciales.phoneNumberId}/media`),
    {
      method: "POST",
      // Sin Content-Type a mano: fetch le pone el boundary del multipart.
      headers: { Authorization: `Bearer ${credenciales.accessToken}` },
      body: formulario,
    },
  );

  const cuerpo = (await respuesta.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!respuesta.ok || !cuerpo.id) {
    throw new Error(
      cuerpo.error?.message ??
        `No pudimos subir la foto: WhatsApp respondió ${respuesta.status}.`,
    );
  }

  return cuerpo.id;
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

  const credenciales = credencialesWhatsApp();

  try {
    // La foto del reporte viaja como data URL: Meta no puede descargarla, así
    // que primero se la subimos y después la nombramos por id.
    const idMedia =
      mensaje.adjuntoUrl && esDataUrl(mensaje.adjuntoUrl)
        ? await subirFoto(mensaje.adjuntoUrl, credenciales)
        : undefined;

    const respuesta = await fetch(
      grafo(credenciales, `${credenciales.phoneNumberId}/messages`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credenciales.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(construirPayload(mensaje, idMedia)),
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
            cuerpo.error?.message ?? `WhatsApp respondió ${respuesta.status}.`,
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
