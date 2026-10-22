/**
 * Buscador de direcciones sobre Google Places (API nueva).
 *
 * Se usa la API de datos (`AutocompleteSuggestion`) y no el widget de
 * Google: el widget dibuja su propia caja dentro de un shadow DOM que no
 * toma los estilos de la marca, y el campo tiene que verse como todos los
 * demás del formulario.
 *
 * Las sugerencias y el detalle van atados a un mismo token de sesión. Así
 * Google cobra una búsqueda completa como una sola sesión y no cada letra
 * por separado.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { leerDireccion } from "@/lib/integraciones/direcciones/componentes";
import type {
  BuscadorDirecciones,
  SugerenciaDireccion,
} from "@/lib/integraciones/direcciones/tipos";

let cargando: Promise<google.maps.PlacesLibrary> | null = null;

/** Carga el script de Maps una sola vez, aunque haya dos campos en pantalla. */
function cargarPlaces(llave: string): Promise<google.maps.PlacesLibrary> {
  if (cargando) return cargando;

  cargando = new Promise<void>((resolver, rechazar) => {
    const listo = "__patotecaMapasListo";
    (window as unknown as Record<string, () => void>)[listo] = () => resolver();

    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(llave)}` +
      `&v=weekly&loading=async&language=es&region=CL&callback=${listo}`;
    script.async = true;
    script.onerror = () => {
      cargando = null;
      rechazar(new Error("No pudimos cargar el buscador de direcciones."));
    };
    document.head.appendChild(script);
  }).then(
    () => google.maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>,
  );

  return cargando;
}

export function crearBuscadorGoogle(llave: string): BuscadorDirecciones {
  let sesion: google.maps.places.AutocompleteSessionToken | null = null;

  return {
    async sugerir(texto) {
      const places = await cargarPlaces(llave);
      sesion ??= new places.AutocompleteSessionToken();

      const { suggestions } =
        await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: texto,
          sessionToken: sesion,
          includedRegionCodes: ["cl"],
          language: "es",
          locationBias: {
            center: { lat: NEGOCIO.ubicacion.lat, lng: NEGOCIO.ubicacion.lng },
            radius: NEGOCIO.ubicacion.radioSugerenciasM,
          },
        });

      return suggestions.flatMap((s): SugerenciaDireccion[] => {
        const p = s.placePrediction;
        if (!p) return [];
        return [
          {
            id: p.placeId,
            principal: p.mainText?.text ?? p.text.text,
            secundario: p.secondaryText?.text ?? "",
          },
        ];
      });
    },

    async elegir(id) {
      const places = await cargarPlaces(llave);
      const lugar = new places.Place({ id });
      await lugar.fetchFields({
        fields: ["addressComponents", "formattedAddress"],
      });
      // El detalle cierra la sesión: la próxima búsqueda empieza otra.
      sesion = null;

      return leerDireccion(
        (lugar.addressComponents ?? []).map((c) => ({
          longText: c.longText,
          shortText: c.shortText,
          types: c.types,
        })),
        lugar.formattedAddress ?? "",
      );
    },
  };
}
