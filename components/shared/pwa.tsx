"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMontado } from "@/lib/hooks/use-montado";
import { LogoPatoteca } from "@/components/shared/logo";

const CLAVE_DESCARTADO = "patoteca:instalacion-descartada:v1";

/**
 * Registra el service worker.
 *
 * Solo en producción: en desarrollo se pelea con el recargado en caliente de
 * Next y termina sirviendo pantallas viejas, que es peor que no tener caché.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin service worker la app funciona igual, solo que sin offline.
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}

interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function yaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS usa su propia bandera.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function fueDescartado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_DESCARTADO) === "1";
  } catch {
    return false;
  }
}

/**
 * Invitación a instalar la app en el teléfono.
 *
 * Chrome y Android avisan con `beforeinstallprompt`. iOS no tiene ese evento:
 * ahí solo se puede explicar dónde está el botón de "Agregar a inicio".
 */
export function AvisoDeInstalacion() {
  const montado = useMontado();
  const [evento, setEvento] = useState<EventoDeInstalacion | null>(null);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    // En iOS no existe este evento: ahí el aviso se decide en el render.
    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoDeInstalacion);
    };

    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    return () =>
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
  }, []);

  const descartar = useCallback(() => {
    setDescartado(true);
    try {
      window.localStorage.setItem(CLAVE_DESCARTADO, "1");
    } catch {
      // Sin almacenamiento simplemente vuelve a aparecer. No es grave.
    }
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setDescartado(true);
  }, [evento]);

  // Se decide en el render, no en un efecto: así no hay un estado que
  // sincronizar ni renders encadenados.
  const disponible =
    montado && !descartado && !yaInstalada() && !fueDescartado();
  const instruccionesIOS = disponible && esIOS();
  const visible = disponible && (instruccionesIOS || evento !== null);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))]">
      <div className="bg-card pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border p-3 shadow-lg">
        <LogoPatoteca tamano={44} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold">
            Ten La Patoteca a mano
          </p>
          <p className="text-muted-foreground text-xs text-pretty">
            {instruccionesIOS ? (
              <>
                Toca <Share className="inline size-3" /> y después &ldquo;Agregar
                a inicio&rdquo;.
              </>
            ) : (
              "Se instala en tu teléfono y funciona sin señal."
            )}
          </p>
        </div>

        {!instruccionesIOS && (
          <Button size="sm" onClick={instalar}>
            <Download />
            Instalar
          </Button>
        )}

        <button
          type="button"
          onClick={descartar}
          aria-label="Cerrar aviso"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-full p-1.5 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
