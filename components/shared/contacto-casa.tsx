"use client";

/**
 * El WhatsApp de la casa, para lo que no se resuelve en la app.
 *
 * "Escríbenos" sin un número es una puerta pintada en la pared: el dueño
 * queda con la instrucción y sin la manera de cumplirla. El número lo pone
 * Administración en /admin/configuracion; mientras no lo haga, se promete lo
 * único que sí se puede cumplir: que le escribimos nosotros.
 */

import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { aE164, formatearTelefono } from "@/lib/utils/telefono";

/** El WhatsApp de la casa en E.164, o null si nadie lo configuró. */
export function useWhatsappDeLaCasa(): { cargando: boolean; numero: string | null } {
  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);
  return {
    cargando: !configuracion.datos,
    numero: aE164(configuracion.datos?.whatsappDeContacto ?? ""),
  };
}

/** El enlace que abre la conversación, con el mensaje ya escrito. */
export function enlaceWhatsapp(numero: string, mensaje?: string): string {
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${numero.slice(1)}${texto}`;
}

export function ContactoCasa({ mensaje }: { mensaje?: string }) {
  const { cargando, numero } = useWhatsappDeLaCasa();

  if (cargando) return null;

  if (!numero) {
    return (
      <p className="text-muted-foreground text-xs text-pretty">
        Te escribimos nosotros a tu WhatsApp para conversarlo.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a
          href={enlaceWhatsapp(numero, mensaje)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle />
          Escríbenos al {formatearTelefono(numero)}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`tel:${numero}`}>
          <Phone />
          Llamar
        </a>
      </Button>
    </div>
  );
}
