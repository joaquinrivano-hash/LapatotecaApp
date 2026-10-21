"use client";

import { useEffect } from "react";

import { autenticacion, hayAuthReal } from "@/lib/auth";
import { useSesion } from "@/lib/store/sesion";

/**
 * Mantiene el store de sesión al día con la sesión de verdad.
 *
 * Va en el layout raíz y no en cada cara: una sesión que se vence mientras
 * alguien mira el calendario tiene que notarse ahí también, no solo al
 * entrar.
 *
 * En modo prototipo no hace nada: ahí el store YA es la fuente de la verdad
 * y escucharlo para volver a escribirlo sería dar vueltas en círculo.
 */
export function SesionViva() {
  useEffect(() => {
    if (!hayAuthReal()) return;

    const auth = autenticacion();
    const { sincronizar } = useSesion.getState();
    let vigente = true;

    // Lo primero es olvidar lo que haya quedado guardado. El store se
    // persiste, así que un rol de una demo anterior —o de antes de que
    // existiera el login— estaría ahí al cargar, y durante el viaje al
    // servidor se dibujaría un backoffice que esa persona puede no tener.
    useSesion.setState({ resuelta: false });

    auth.actual().then(
      (identidad) => {
        if (vigente) sincronizar(identidad);
      },
      () => {
        if (vigente) sincronizar(null);
      },
    );

    const dejarDeEscuchar = auth.alCambiar((identidad) => {
      if (vigente) sincronizar(identidad);
    });

    return () => {
      vigente = false;
      dejarDeEscuchar();
    };
  }, []);

  return null;
}
