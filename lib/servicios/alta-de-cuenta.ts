/**
 * El alta de un dueño cuando las cuentas son de verdad.
 *
 * En el prototipo crear la cuenta era crear dos filas. Con Supabase Auth de
 * por medio hay un paso que no depende de nosotros: **Supabase puede exigir
 * confirmar el correo antes de dar sesión**, y sin sesión no se puede
 * escribir nada —cualquier insert sería con `auth.uid()` nulo y las
 * políticas lo rechazarían—.
 *
 * Así que el alta tiene dos finales posibles y los dos están contemplados:
 *
 * - **Sin confirmación por correo**: la sesión queda abierta al registrarse
 *   y la ficha se crea al tiro. Es el flujo de una sola pantalla de siempre.
 * - **Con confirmación**: la cuenta existe pero no hay sesión. La ficha se
 *   guarda en este dispositivo y se termina sola cuando la persona confirme
 *   y entre.
 *
 * ### Por qué el dispositivo y no la cuenta
 *
 * Lo natural sería dejar la ficha en los metadatos del usuario, que viajan
 * con la cuenta y funcionarían aunque confirme el correo en otro teléfono.
 * No sirve: la foto del perro y las hojas del carnet se guardan como data
 * URL y pesan cientos de kilobytes. Los metadatos de una cuenta no son el
 * lugar para eso.
 *
 * El costo es que si confirma en otro aparato, la ficha no viaja. Eso no
 * pierde nada —la cuenta existe y los datos se vuelven a pedir— y es
 * preferible a un alta que falla por tamaño sin explicar por qué.
 */

import type { Autenticacion } from "@/lib/auth/tipos";
import { crearAlmacenLocal, type Almacen } from "@/lib/repo/almacen";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import {
  crearCuenta,
  validarAlta,
  type CuentaCreada,
  type DatosDeCuenta,
  type DatosDePerro,
} from "@/lib/servicios/registro";
import type { InstanteISO } from "@/lib/types";

export const CLAVE_ALTA_PENDIENTE = "patoteca:alta-pendiente:v1";

export interface AltaDeCuenta {
  cuenta: DatosDeCuenta;
  perro: DatosDePerro;
}

export type ResultadoDelAlta =
  | { estado: "lista"; cuenta: CuentaCreada }
  | { estado: "falta_confirmar"; email: string };

/** Para los tests: por omisión, el localStorage del navegador. */
let almacen: Almacen | null = null;
function guardarEn(): Almacen {
  if (!almacen) almacen = crearAlmacenLocal();
  return almacen;
}

export function reemplazarAlmacenDeAltas(nuevo: Almacen | null): void {
  almacen = nuevo;
}

export function altaPendiente(): AltaDeCuenta | null {
  return guardarEn().leer<AltaDeCuenta>(CLAVE_ALTA_PENDIENTE);
}

export function olvidarAltaPendiente(): void {
  guardarEn().borrar(CLAVE_ALTA_PENDIENTE);
}

/**
 * Crea la cuenta de acceso y, si ya hay sesión, la ficha.
 *
 * La ficha se valida ANTES de crear la cuenta de acceso. Si se hiciera al
 * revés, un perro de 30 kg dejaría una cuenta huérfana en Supabase Auth que
 * nadie puede borrar desde la app, y esa persona no podría volver a
 * registrarse con su propio correo.
 */
export async function registrarDueno(
  repo: RepositorioPatoteca,
  auth: Autenticacion,
  datos: AltaDeCuenta & { password: string },
  ahora: InstanteISO = new Date().toISOString(),
): Promise<ResultadoDelAlta> {
  const alta: AltaDeCuenta = { cuenta: datos.cuenta, perro: datos.perro };

  // Revisa peso, castración, vacunas y campos obligatorios. Lanza
  // RegistroRechazado con los motivos, igual que el alta del prototipo.
  await validarAlta(repo, alta, ahora);

  const email = datos.cuenta.email.trim().toLowerCase();
  const { faltaConfirmar } = await auth.registrar({
    email,
    password: datos.password,
    nombre: `${datos.cuenta.nombre} ${datos.cuenta.apellido}`.trim(),
  });

  if (faltaConfirmar) {
    guardarEn().escribir(CLAVE_ALTA_PENDIENTE, alta);
    return { estado: "falta_confirmar", email };
  }

  const cuenta = await crearCuenta(repo, alta, ahora);
  olvidarAltaPendiente();
  return { estado: "lista", cuenta };
}

/**
 * Termina un alta que quedó esperando la confirmación del correo.
 *
 * Se llama cuando hay sesión abierta y la persona todavía no tiene ficha de
 * cliente. Devuelve null si no hay nada guardado, que es el caso de quien
 * confirmó en otro aparato: ahí la ficha se le vuelve a pedir.
 */
export async function completarAltaPendiente(
  repo: RepositorioPatoteca,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<CuentaCreada | null> {
  const alta = altaPendiente();
  if (!alta) return null;

  const cuenta = await crearCuenta(repo, alta, ahora);
  // Se olvida recién cuando la ficha quedó escrita: si se borrara antes y
  // la escritura fallara, los datos se perderían sin que nadie lo note.
  olvidarAltaPendiente();
  return cuenta;
}
