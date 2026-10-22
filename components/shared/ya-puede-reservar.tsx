"use client";

import Link from "next/link";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConsulta } from "@/lib/hooks/use-consulta";
import { reciénAprobados } from "@/lib/servicios/evaluacion";

/**
 * "Tu perrito pasó el día de prueba, ya pueden reservar."
 *
 * Existe porque al aprobar un día de prueba, lo único que cambiaba en la
 * pantalla del dueño era que DESAPARECÍA un aviso — y la ausencia de una
 * advertencia no se nota. El dueño pagó, vino, y se quedaba sin saber que
 * ya podía seguir.
 *
 * No hay bandeja ni estado de "leído": la condición es el estado. El aviso
 * se apaga solo cuando reserva, que es justo cuando deja de hacer falta.
 */
export function YaPuedeReservar({ clienteId }: { clienteId: string | undefined }) {
  const consulta = useConsulta(
    (repo) => (clienteId ? reciénAprobados(repo, clienteId) : Promise.resolve([])),
    [clienteId ?? ""],
  );

  const listos = consulta.datos ?? [];
  if (listos.length === 0) return null;

  // Con varios hermanos recién aprobados se nombran todos: "Suri y Chispa
  // pasaron" es una frase, y dos tarjetas iguales son ruido.
  const nombres = listos.map((p) => p.nombre);
  const quienes =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  const varios = nombres.length > 1;
  // Al que la casa aprobó sin venir no se le felicita por pasar una prueba
  // que no hizo: se le da la bienvenida a la app. Cada frase se dice solo
  // si es cierta para todos los nombrados: con hermanos mezclados, ni "pasó
  // el día de prueba" ni "no necesita día de prueba" lo son.
  const algunoSinPrueba = listos.some((p) => p.diaDePrueba.yaEraCliente);
  const todosSinPrueba = listos.every((p) => p.diaDePrueba.yaEraCliente);

  return (
    <Card className="border-success/40 bg-success/5">
      <CardContent className="space-y-3 p-5 text-center">
        <PartyPopper className="text-success mx-auto size-10" />
        <p className="font-display text-xl font-bold text-balance">
          {algunoSinPrueba
            ? `¡Todo listo para ${quienes}!`
            : `¡${quienes} ${varios ? "pasaron" : "pasó"} el día de prueba!`}
        </p>
        <p className="text-muted-foreground text-pretty">
          {todosSinPrueba
            ? `Como ya nos conocemos, no ${varios ? "necesitan" : "necesita"} día de prueba. Reserva su próximo día de jardín o su próxima noche de hotel cuando quieras.`
            : `Ya ${varios ? "pueden" : "puede"} quedarse con nosotros. Reserva su primer día de jardín o su primera noche de hotel cuando quieras.`}
        </p>
        <Button asChild size="xl" className="w-full">
          <Link href="/reservar">Reservar</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
