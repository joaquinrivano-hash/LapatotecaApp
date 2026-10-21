"use client";

import Link from "next/link";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hayAuthReal } from "@/lib/auth";

/**
 * El pie de la portada que ofrece entrar con cualquiera de las tres caras.
 *
 * No es del negocio: es el interruptor de la demo, y por eso va al final y
 * con letra chica. **Con cuentas reales desaparece**, y no por prolijidad:
 * ese enlace lleva a un selector donde cualquiera se declara administración
 * y ve la cobranza completa. Dejarlo en producción sería publicar la puerta
 * de servicio con un cartel.
 */
export function InterruptorDelPrototipo() {
  if (hayAuthReal()) return null;

  return (
    <section className="border-t border-border/60 bg-secondary/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-muted-foreground text-sm text-pretty">
          Esto es un prototipo con datos de prueba. Puedes entrar como cliente,
          como cuidador o como administración.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/ingresar">
              <Users />
              Elegir con qué cara entrar
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/crear-cuenta">Crear una cuenta nueva</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
