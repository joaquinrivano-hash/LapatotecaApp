/**
 * Lo que falta de los datos del dueño para crear la cuenta.
 *
 * Antes esto vivía suelto en la pantalla como un sí/no, y con un "no" el
 * botón quedaba apagado sin decir por qué: el dueño llenaba todo, tocaba
 * "Crear cuenta" y no pasaba nada. Ahora cada cosa que falta trae su campo
 * y su mensaje, igual que la ficha del perro (`revisarAltaDePerro`), para
 * que la pantalla pueda decir qué falta y dónde.
 */

import type { FaltanteDeAlta } from "@/lib/rules/alta-perro";
import { esTelefonoValido } from "@/lib/utils/telefono";

/** El mínimo que exige Supabase. */
export const LARGO_MINIMO_CLAVE = 6;

export interface DatosDelDuenoEnElAlta {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  /** Lo decide el campo de dirección: elegida de la lista y con número. */
  direccionValida: boolean;
  /** Solo con cuentas de verdad: en el prototipo no hay contraseña. */
  clave?: { clave: string; confirmacion: string };
}

/** Lo justo para atajar un dedo que se saltó la arroba o el punto. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function revisarDatosDelDueno(
  datos: DatosDelDuenoEnElAlta,
): FaltanteDeAlta[] {
  const faltan: FaltanteDeAlta[] = [];

  if (!datos.nombre.trim()) {
    faltan.push({ campo: "nombre", mensaje: "Falta tu nombre." });
  }
  if (!datos.apellido.trim()) {
    faltan.push({ campo: "apellido", mensaje: "Falta tu apellido." });
  }

  const email = datos.email.trim();
  if (!email) {
    faltan.push({ campo: "email", mensaje: "Falta tu email." });
  } else if (!EMAIL.test(email)) {
    faltan.push({
      campo: "email",
      mensaje: "Revisa tu email: tiene que ser como nombre@correo.cl.",
    });
  }

  if (datos.clave) {
    const { clave, confirmacion } = datos.clave;
    if (!clave) {
      faltan.push({ campo: "clave", mensaje: "Falta elegir una contraseña." });
    } else if (clave.length < LARGO_MINIMO_CLAVE) {
      faltan.push({
        campo: "clave",
        mensaje: `La contraseña necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`,
      });
    }
    if (!confirmacion) {
      faltan.push({
        campo: "confirmacion",
        mensaje: "Falta escribir la contraseña por segunda vez.",
      });
    } else if (confirmacion !== clave) {
      faltan.push({
        campo: "confirmacion",
        mensaje: "Las dos contraseñas no son iguales.",
      });
    }
  }

  if (!datos.telefono.trim()) {
    faltan.push({ campo: "telefono", mensaje: "Falta tu WhatsApp." });
  } else if (!esTelefonoValido(datos.telefono)) {
    faltan.push({
      campo: "telefono",
      mensaje: "Revisa tu WhatsApp: tiene que ser un celular chileno.",
    });
  }

  if (!datos.direccionValida) {
    faltan.push({
      campo: "direccion",
      mensaje: "Falta tu dirección, con el número de la casa.",
    });
  }

  return faltan;
}
