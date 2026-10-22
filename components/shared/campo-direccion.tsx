"use client";

/**
 * La dirección del dueño, con sugerencias de Google.
 *
 * La persona escribe y elige de la lista; la comuna sale de lo que eligió, no
 * se la preguntamos aparte. Elegir es lo que hace válida la dirección: un
 * texto escrito a mano puede tener la calle mal o no existir, y eso se
 * descubre el día del traslado con el perro arriba del auto.
 *
 * Si no hay llave de Google, o el script no carga, el campo vuelve a ser
 * dirección y comuna escritas: el alta nunca queda trancada por nosotros.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Campo } from "@/components/shared/formulario-perro";
import { useMontado } from "@/lib/hooks/use-montado";
import {
  buscadorDeDirecciones,
  conDepto,
  type DireccionElegida,
  type SugerenciaDireccion,
} from "@/lib/integraciones/direcciones";
import { cn } from "@/lib/utils";

/** Lo que el campo le informa al formulario. */
export interface ValorDireccion {
  /** Calle, número y depto, listo para guardar. */
  direccion: string;
  comuna: string;
  /** true cuando se puede guardar tal cual. */
  valida: boolean;
}

const MINIMO_LETRAS = 3;
const ESPERA_MS = 250;

export function CampoDireccion({
  onCambio,
  error,
}: {
  onCambio: (valor: ValorDireccion) => void;
  /** Se muestra solo si todavía no es válida. */
  error?: string;
}) {
  const montado = useMontado();
  const [fallo, setFallo] = useState(false);
  // Hasta montar no se sabe si hay buscador: en el servidor no lo hay nunca,
  // y decidirlo en el primer render rompería la hidratación.
  const buscador = montado && !fallo ? buscadorDeDirecciones() : null;

  if (!montado) return <CampoManual onCambio={onCambio} error={error} />;
  if (!buscador) {
    return (
      <CampoManual
        onCambio={onCambio}
        error={error}
        aviso={
          fallo
            ? "El buscador de direcciones no cargó. Escríbela y la revisamos nosotros."
            : undefined
        }
      />
    );
  }

  return (
    <CampoConSugerencias
      sugerir={(t) => buscador.sugerir(t)}
      elegir={(id) => buscador.elegir(id)}
      onCambio={onCambio}
      onFallo={() => setFallo(true)}
      error={error}
    />
  );
}

function CampoConSugerencias({
  sugerir,
  elegir,
  onCambio,
  onFallo,
  error,
}: {
  sugerir: (texto: string) => Promise<SugerenciaDireccion[]>;
  elegir: (id: string) => Promise<DireccionElegida>;
  onCambio: (valor: ValorDireccion) => void;
  onFallo: () => void;
  error?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [elegida, setElegida] = useState<DireccionElegida | null>(null);
  const [depto, setDepto] = useState("");
  // Las respuestas pueden llegar desordenadas: solo vale la de la última
  // búsqueda, o "Italia 15" pisaría a "Italia 1500".
  const ultima = useRef(0);

  useEffect(() => {
    if (elegida || texto.trim().length < MINIMO_LETRAS) return;

    const numero = ++ultima.current;
    const espera = setTimeout(() => {
      setBuscando(true);
      sugerir(texto.trim())
        .then((lista) => {
          if (numero !== ultima.current) return;
          setSugerencias(lista);
          setActiva(-1);
          setAbierta(true);
        })
        .catch(onFallo)
        .finally(() => {
          if (numero === ultima.current) setBuscando(false);
        });
    }, ESPERA_MS);

    return () => clearTimeout(espera);
    // `sugerir` y `onFallo` cambian en cada render del padre y no importan:
    // lo que dispara una búsqueda es el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, elegida]);

  function informar(nueva: DireccionElegida | null, nuevoDepto: string) {
    onCambio(
      nueva
        ? {
            direccion: conDepto(nueva.direccion, nuevoDepto),
            comuna: nueva.comuna,
            valida: nueva.tieneNumero && nueva.comuna !== "",
          }
        : { direccion: "", comuna: "", valida: false },
    );
  }

  async function tomar(sugerencia: SugerenciaDireccion) {
    setAbierta(false);
    setBuscando(true);
    ultima.current++;
    try {
      const nueva = await elegir(sugerencia.id);
      setElegida(nueva);
      setTexto(nueva.direccion);
      informar(nueva, depto);
    } catch {
      onFallo();
    } finally {
      setBuscando(false);
    }
  }

  function escribir(valor: string) {
    setTexto(valor);
    if (elegida) {
      // Tocar el texto después de elegir la deja sin confirmar: lo que se
      // guarda tiene que ser lo que Google reconoció, no una edición encima.
      setElegida(null);
      informar(null, depto);
    }
    if (valor.trim().length < MINIMO_LETRAS) {
      setSugerencias([]);
      setAbierta(false);
    }
  }

  function teclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierta || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === "Enter" && activa >= 0) {
      e.preventDefault();
      void tomar(sugerencias[activa]);
    } else if (e.key === "Escape") {
      setAbierta(false);
    }
  }

  const lista = `${id}-lista`;
  const sinNumero = elegida !== null && !elegida.tieneNumero;
  const mensajeError = sinNumero
    ? "Le falta el número de la casa o el edificio. Escríbelo y elige de nuevo."
    : !elegida
      ? error
      : undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Dirección</Label>
        <div className="relative">
          <Input
            id={id}
            role="combobox"
            aria-expanded={abierta}
            aria-controls={lista}
            aria-autocomplete="list"
            aria-activedescendant={
              activa >= 0 ? `${lista}-${activa}` : undefined
            }
            aria-invalid={mensajeError ? true : undefined}
            // El autocompletado del navegador taparía la lista de Google.
            autoComplete="off"
            placeholder="Calle y número"
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            onKeyDown={teclear}
            onFocus={() => sugerencias.length > 0 && !elegida && setAbierta(true)}
            // Con espera, para que el toque en una sugerencia alcance a llegar.
            onBlur={() => setTimeout(() => setAbierta(false), 150)}
            className="pr-11"
          />
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
            {buscando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPin className="size-4" />
            )}
          </span>

          {abierta && (
            <ul
              id={lista}
              role="listbox"
              className="bg-card absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border-2 shadow-lg"
            >
              {sugerencias.length === 0 ? (
                <li className="text-muted-foreground px-4 py-3 text-sm">
                  No encontramos esa dirección. Prueba con la calle y el
                  número.
                </li>
              ) : (
                sugerencias.map((s, i) => (
                  <li
                    key={s.id}
                    id={`${lista}-${i}`}
                    role="option"
                    aria-selected={i === activa}
                    // mousedown y no click: el click llega después del blur.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void tomar(s);
                    }}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-4 py-3",
                      i === activa ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {s.principal}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {s.secundario}
                      </span>
                    </span>
                  </li>
                ))
              )}
              {/* Las condiciones de Places exigen la atribución cuando las
                  sugerencias se muestran fuera de un mapa de Google. */}
              <li
                aria-hidden
                className="text-muted-foreground border-t px-4 py-1.5 text-right text-[11px]"
              >
                Google Maps
              </li>
            </ul>
          )}
        </div>

        {mensajeError ? (
          <p className="text-destructive text-xs">{mensajeError}</p>
        ) : elegida ? (
          <p className="text-muted-foreground text-xs">
            Comuna: <strong className="text-foreground">{elegida.comuna}</strong>
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Escribe y elige tu dirección de la lista.
          </p>
        )}
      </div>

      <Campo
        id={`${id}-depto`}
        etiqueta="Depto, casa u oficina (opcional)"
        valor={depto}
        onCambio={(v) => {
          setDepto(v);
          informar(elegida, v);
        }}
        autoComplete="address-line2"
      />
    </div>
  );
}

/** Sin Google: dirección y comuna escritas, como antes. */
function CampoManual({
  onCambio,
  error,
  aviso,
}: {
  onCambio: (valor: ValorDireccion) => void;
  error?: string;
  aviso?: string;
}) {
  const [direccion, setDireccion] = useState("");
  const [comuna, setComuna] = useState("");

  function cambiar(nuevaDireccion: string, nuevaComuna: string) {
    setDireccion(nuevaDireccion);
    setComuna(nuevaComuna);
    onCambio({
      direccion: nuevaDireccion.trim(),
      comuna: nuevaComuna.trim(),
      valida: nuevaDireccion.trim() !== "" && nuevaComuna.trim() !== "",
    });
  }

  return (
    <div className="space-y-3">
      <Campo
        id="direccion"
        etiqueta="Dirección"
        valor={direccion}
        onCambio={(v) => cambiar(v, comuna)}
        autoComplete="street-address"
        ayuda={aviso ?? "Calle, número y depto si tiene."}
        error={error && !direccion.trim() ? error : undefined}
      />
      <Campo
        id="comuna"
        etiqueta="Comuna"
        valor={comuna}
        onCambio={(v) => cambiar(direccion, v)}
        autoComplete="address-level2"
        error={error && !comuna.trim() ? error : undefined}
      />
    </div>
  );
}
