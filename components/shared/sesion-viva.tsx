"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { autenticacion, hayAuthReal } from "@/lib/auth";
import type { Identidad } from "@/lib/auth/tipos";
import { repositorio } from "@/lib/repo";
import {
  altaPendiente,
  completarAltaPendiente,
} from "@/lib/servicios/alta-de-cuenta";
import { useSesion } from "@/lib/store/sesion";

/**
 * Mantiene el store de sesión al día con la sesión de verdad, y termina el
 * alta que haya quedado a medias.
 *
 * Va en el layout raíz y no en cada cara por dos motivos: una sesión que se
 * vence mientras alguien mira el calendario tiene que notarse ahí también, y
 * quien confirma su correo vuelve a la portada, no a la pantalla de alta.
 *
 * En modo prototipo no hace nada: ahí el store YA es la fuente de la verdad
 * y escucharlo para volver a escribirlo sería dar vueltas en círculo.
 */
export function SesionViva() {
  const router = useRouter();
  // El alta se termina una sola vez por carga: sin esto, el evento de
  // sesión que dispara la propia escritura volvería a entrar acá.
  const terminando = useRef(false);

  useEffect(() => {
    if (!hayAuthReal()) return;

    const auth = autenticacion();
    const { sincronizar } = useSesion.getState();
    let vigente = true;

    /**
     * Quien se registró con confirmación de correo tiene cuenta pero no
     * ficha: la ficha quedó esperando en este dispositivo. Este es el
     * momento en que ya hay sesión y recién se puede escribir.
     */
    async function terminarAlta(identidad: Identidad) {
      if (terminando.current || identidad.clienteId || !altaPendiente()) return;
      terminando.current = true;

      try {
        const creada = await completarAltaPendiente(repositorio());
        if (!creada || !vigente) return;

        sincronizar({ ...identidad, clienteId: creada.cliente.id });
        toast.success(`Tu cuenta está lista, ${creada.cliente.nombre}`, {
          description: `Ahora agenda el día de prueba de ${creada.perro.nombre}.`,
        });
        router.push("/dia-de-prueba");
      } catch {
        // No se pierde nada: la ficha sigue guardada y se vuelve a intentar
        // en la próxima carga. Avisar acá sería interrumpir a alguien que
        // ni siquiera sabe que hay algo pendiente.
        terminando.current = false;
      }
    }

    function recibir(identidad: Identidad | null) {
      if (!vigente) return;
      sincronizar(identidad);
      if (identidad) void terminarAlta(identidad);
    }

    // Lo primero es olvidar lo que haya quedado guardado. El store se
    // persiste, así que un rol de una demo anterior —o de antes de que
    // existiera el login— estaría ahí al cargar, y durante el viaje al
    // servidor se dibujaría un backoffice que esa persona puede no tener.
    useSesion.setState({ resuelta: false });

    auth.actual().then(recibir, () => recibir(null));
    const dejarDeEscuchar = auth.alCambiar(recibir);

    return () => {
      vigente = false;
      dejarDeEscuchar();
    };
  }, [router]);

  return null;
}
