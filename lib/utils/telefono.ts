/**
 * Teléfonos chilenos a E.164, que es como los quiere WhatsApp: +56912345678,
 * sin espacios ni guiones.
 *
 * En la ficha del cliente el teléfono se guarda como lo escribió una persona
 * ("+569 1234 5678", "9 1234 5678"), así que hay que normalizarlo antes de
 * mandar nada.
 */

const CODIGO_PAIS = "56";

export function aE164(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 0) return null;

  // Ya viene con código de país: +56 9 XXXX XXXX
  if (digitos.startsWith(CODIGO_PAIS) && digitos.length === 11) {
    return `+${digitos}`;
  }

  // Celular sin código de país: 9 XXXX XXXX
  if (digitos.length === 9 && digitos.startsWith("9")) {
    return `+${CODIGO_PAIS}${digitos}`;
  }

  // Formato antiguo de 8 dígitos: se asume celular.
  if (digitos.length === 8) {
    return `+${CODIGO_PAIS}9${digitos}`;
  }

  // Fijo de Santiago con código de área: 2 XXXX XXXX
  if (digitos.startsWith(CODIGO_PAIS) && digitos.length === 11 + 1) {
    return `+${digitos}`;
  }

  return null;
}

export function esTelefonoValido(telefono: string): boolean {
  return aE164(telefono) !== null;
}

/** Para mostrar en pantalla: +569 1234 5678 */
export function formatearTelefono(telefono: string): string {
  const e164 = aE164(telefono);
  if (!e164) return telefono;
  const d = e164.slice(1);
  return `+${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
}
