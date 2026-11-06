/**
 * El lado del navegador: le pregunta los kilómetros a nuestra propia ruta,
 * nunca a Google. La llave vive en el servidor.
 */

/**
 * Los kilómetros de la casa a esa dirección, o `null`.
 *
 * Nunca lanza, por el mismo motivo que la calculadora: el traslado se cotiza
 * igual con los km a mano, así que una distancia que no llega deja el campo
 * manual y no una pantalla rota.
 */
export async function kmHastaLaDireccion(
  direccion: string,
): Promise<number | null> {
  try {
    const respuesta = await fetch("/api/distancia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direccion }),
    });
    if (!respuesta.ok) return null;
    const { km } = (await respuesta.json()) as { km: number | null };
    return typeof km === "number" ? km : null;
  } catch {
    return null;
  }
}
