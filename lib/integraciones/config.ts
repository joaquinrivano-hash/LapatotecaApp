/**
 * Configuración de integraciones.
 *
 * Las credenciales viven SOLO en el servidor: el token de WhatsApp nunca se
 * expone al navegador. Lo único público es qué canal usar, porque el cliente
 * necesita saber si está mandando mensajes de verdad o simulados.
 *
 * Ver `.env.example` para la lista completa.
 */

export type ModoCanal = "simulado" | "whatsapp";

/**
 * Next reemplaza `process.env.NEXT_PUBLIC_*` en tiempo de build, así que hay
 * que escribirlo literal: no sirve leerlo con una variable.
 */
export function modoCanalMensajeria(): ModoCanal {
  return process.env.NEXT_PUBLIC_CANAL_MENSAJERIA === "whatsapp"
    ? "whatsapp"
    : "simulado";
}

/** Solo en el servidor. En el navegador devuelve todo vacío. */
export function credencialesWhatsApp() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "",
    version: process.env.WHATSAPP_API_VERSION ?? "v21.0",
    // Configurable para poder apuntar a un Meta de mentira y probar el envío
    // completo —el multipart de la foto incluido— sin cuenta ni red.
    base: process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com",
  };
}

export function whatsAppConfigurado(): boolean {
  const { phoneNumberId, accessToken } = credencialesWhatsApp();
  return phoneNumberId.length > 0 && accessToken.length > 0;
}
