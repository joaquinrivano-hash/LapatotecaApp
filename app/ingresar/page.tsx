"use client";

import { Suspense } from "react";

import { FormularioDeIngreso } from "@/components/ingresar/formulario-de-ingreso";
import { SelectorDeRol } from "@/components/ingresar/selector-de-rol";
import { Skeleton } from "@/components/ui/skeleton";
import { hayAuthReal } from "@/lib/auth";

/**
 * La puerta de entrada, que es distinta según el mundo.
 *
 * Con datos en la nube: correo y contraseña, y el rol lo dice la tabla
 * `perfiles`. En el prototipo: el selector de rol, que es el interruptor de
 * la demo y no puede existir en producción —el rol vive en el navegador y
 * cualquiera se pondría `admin` desde la consola—.
 *
 * El interruptor es el mismo que elige el origen de los datos, así que no
 * hay forma de quedar con un login real sobre datos de demostración ni al
 * revés.
 */
export default function Ingresar() {
  if (!hayAuthReal()) return <SelectorDeRol />;

  // `useSearchParams` obliga a un límite de suspensión: la página se
  // prerenderiza y los parámetros recién existen en el navegador.
  return (
    <Suspense fallback={<Cargando />}>
      <FormularioDeIngreso />
    </Suspense>
  );
}

function Cargando() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <Skeleton className="mx-auto size-24 rounded-full" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </main>
  );
}
