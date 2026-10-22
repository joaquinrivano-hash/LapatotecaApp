/**
 * Cuando el dueño corrige la ficha de su perro.
 *
 * Puede hacerlo sin pedir permiso —son sus datos y nadie los conoce mejor—,
 * pero Administración tiene que enterarse: un peso que sube de 8 a 21 kg
 * cambia si el perro puede quedarse.
 *
 * Dos campos quedan fuera: el sexo y la castración. Son los que deciden si un
 * macho entra, y desmarcarlos después de reservar le da la vuelta a la
 * admisión. Si cambiaron de verdad, los corrige Administración.
 *
 * Por eso el aviso guarda el ANTES y el DESPUÉS de cada campo. "Cambió la
 * ficha" no le sirve a nadie.
 */

import { describirAlimentacion, describirDuracion } from "@/lib/rules/perro";
import { nombreVacuna } from "@/lib/rules/admision";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
// Con año: `formatearFecha` da "1 de enero" y una vacuna renovada al año
// siguiente se vería idéntica, así que el cambio no generaría aviso.
import { formatearFechaCorta } from "@/lib/utils/fecha";
import type {
  CambioDeCampo,
  Cliente,
  ID,
  InstanteISO,
  Notificacion,
  Perro,
} from "@/lib/types";

/**
 * La ficha en palabras, campo por campo.
 *
 * Se compara así y no propiedad por propiedad porque lo que le importa a quien
 * lee el aviso es lo que cambió a la vista: que una foto se reemplace importa,
 * cuál era el data URL no.
 */
function enPalabras(perro: Perro): Record<string, string | undefined> {
  const vacunas = Object.fromEntries(
    perro.vacunas.map((v) => [
      `Vacuna ${nombreVacuna(v.tipo)}`,
      `vence el ${formatearFechaCorta(v.fechaVencimiento)}`,
    ]),
  );

  return {
    Nombre: perro.nombre,
    Raza: perro.raza,
    Peso: `${perro.pesoKg} kg`,
    Sexo: perro.sexo,
    Castrado: perro.esterilizado ? "sí" : "no",
    "Fecha de nacimiento": perro.fechaNacimiento
      ? formatearFechaCorta(perro.fechaNacimiento)
      : undefined,
    Foto: perro.fotoUrl ? "puesta" : undefined,
    "Carnet de vacunación": perro.carnetVacunasUrls?.length
      ? `${perro.carnetVacunasUrls.length} ${perro.carnetVacunasUrls.length === 1 ? "hoja" : "hojas"}`
      : undefined,
    ...vacunas,
    Antiparasitario: perro.antiparasitario
      ? [
          perro.antiparasitario.marca,
          formatearFechaCorta(perro.antiparasitario.ultimaAplicacion),
          describirDuracion(perro.antiparasitario.mesesDeDuracion),
        ]
          .filter(Boolean)
          .join(", ")
      : undefined,
    Comida: describirAlimentacion(perro.alimentacion) ?? undefined,
    Medicamentos: perro.medicamentos?.length
      ? perro.medicamentos
          .map((m) => [m.nombre, m.dosis, m.frecuencia].filter(Boolean).join(" "))
          .join(" · ")
      : undefined,
    Alergias:
      perro.alergias === undefined
        ? undefined
        : perro.alergias.tiene
          ? `sí${perro.alergias.detalle ? `: ${perro.alergias.detalle}` : ""}`
          : "no",
    "Cuidados especiales": perro.indicaciones,
    Notas: perro.notas,
  };
}

/** Qué cambió entre dos versiones de la misma ficha. */
export function compararFichas(antes: Perro, despues: Perro): CambioDeCampo[] {
  const a = enPalabras(antes);
  const b = enPalabras(despues);
  const campos = new Set([...Object.keys(a), ...Object.keys(b)]);

  const cambios: CambioDeCampo[] = [];
  for (const campo of campos) {
    if (a[campo] === b[campo]) continue;
    cambios.push({ campo, antes: a[campo], despues: b[campo] });
  }

  // Foto es el caso raro: cambiar una foto por otra no cambia el texto
  // ("puesta" sigue siendo "puesta"), así que se compara aparte.
  if (antes.fotoUrl !== despues.fotoUrl && antes.fotoUrl && despues.fotoUrl) {
    cambios.push({ campo: "Foto", antes: "otra foto", despues: "una nueva" });
  }
  // Mismo número de hojas pero fotos distintas: el texto no cambia solo.
  const hojasAntes = (antes.carnetVacunasUrls ?? []).join("|");
  const hojasDespues = (despues.carnetVacunasUrls ?? []).join("|");
  if (
    hojasAntes !== hojasDespues &&
    antes.carnetVacunasUrls?.length === despues.carnetVacunasUrls?.length
  ) {
    cambios.push({
      campo: "Carnet de vacunación",
      antes: "otras fotos",
      despues: "fotos nuevas",
    });
  }

  return cambios;
}

export interface FichaActualizada {
  perro: Perro;
  cambios: CambioDeCampo[];
  notificacion: Notificacion | null;
}

/**
 * Guarda los cambios y deja el aviso.
 *
 * Si no cambió nada no se avisa: una bandeja con avisos vacíos se deja de
 * leer, y entonces el que importa también pasa de largo.
 */
export async function actualizarPerroComoDueno(
  repo: RepositorioPatoteca,
  perroId: ID,
  cambios: Partial<Perro>,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<FichaActualizada> {
  const antes = await repo.perros.obtener(perroId);
  if (!antes) throw new Error(`No existe el perro ${perroId}`);

  // El sexo y la castración deciden si el perro puede quedarse, así que los
  // cambia Administración y no el dueño. Se descartan acá y no solo en la
  // pantalla: esta función es por donde pasa todo el que edita como dueño.
  const permitidos = { ...cambios };
  delete permitidos.sexo;
  delete permitidos.esterilizado;
  // El día de prueba lo agenda la app y lo cierra la casa: desde la ficha,
  // el dueño se lo podría dar por aprobado. En la nube lo cuida además el
  // disparador `proteger_el_dia_de_prueba`.
  delete permitidos.diaDePrueba;

  const perro = await repo.perros.actualizar(perroId, permitidos);
  const diferencias = compararFichas(antes, perro);

  if (diferencias.length === 0) {
    return { perro, cambios: [], notificacion: null };
  }

  const cliente = await repo.clientes.obtener(perro.clienteId);

  const notificacion = await repo.notificaciones.crear({
    clienteId: perro.clienteId,
    perroId: perro.id,
    titulo: `${nombreDe(cliente)} cambió la ficha de ${perro.nombre}`,
    cambios: diferencias,
    leida: false,
    creadaEn: ahora,
  });

  return { perro, cambios: diferencias, notificacion };
}

function nombreDe(cliente: Cliente | null): string {
  return cliente ? `${cliente.nombre} ${cliente.apellido}` : "El dueño";
}

/**
 * Administración recibe al perro aunque pase del peso.
 *
 * Queda habilitado hasta el peso que tiene hoy: si la ficha sube después, ya
 * no es el perro que alguien miró y hay que volver a hacerlo.
 */
export async function habilitarPeso(
  repo: RepositorioPatoteca,
  perroId: ID,
  ahora: InstanteISO = new Date().toISOString(),
): Promise<Perro> {
  const perro = await repo.perros.obtener(perroId);
  if (!perro) throw new Error(`No existe el perro ${perroId}`);

  return repo.perros.actualizar(perroId, {
    excepcionPeso: { hastaKg: perro.pesoKg, habilitadaEn: ahora },
  });
}

/** Deshace la excepción: el perro vuelve a quedar bloqueado por el peso. */
export async function quitarHabilitacionDePeso(
  repo: RepositorioPatoteca,
  perroId: ID,
): Promise<Perro> {
  return repo.perros.actualizar(perroId, { excepcionPeso: undefined });
}
