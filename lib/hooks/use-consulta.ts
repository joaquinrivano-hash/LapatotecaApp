"use client";

import { useCallback, useEffect, useState } from "react";
import { repositorio } from "@/lib/repo";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { refrescarDatos, useVersionDatos } from "@/lib/store/datos";

export interface Consulta<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  /** Vuelve a correr ESTA consulta y todas las demás montadas. */
  recargar: () => void;
}

interface Resuelto<T> {
  clave: string;
  datos: T | null;
  error: string | null;
}

/**
 * Lee del repositorio desde un componente cliente.
 *
 * El repositorio vive en el navegador (localStorage), así que toda pantalla
 * que muestre datos es un componente cliente y pasa por acá. Cuando algo muta,
 * `refrescarDatos()` hace que todas las consultas montadas se repitan.
 *
 * `cargando` NO es un estado propio: se deduce comparando la clave de lo que
 * hay guardado con la clave de lo que se está pidiendo. Así el hook no llama a
 * setState dentro del efecto y no encadena renders de más.
 *
 * Por eso `deps` tiene que ser serializable (ids, fechas, números). No le
 * pases objetos ni funciones.
 */
export function useConsulta<T>(
  consulta: (repo: RepositorioPatoteca) => Promise<T>,
  deps: readonly unknown[] = [],
): Consulta<T> {
  const version = useVersionDatos((estado) => estado.version);
  const clave = JSON.stringify([version, ...deps]);

  const [resuelto, setResuelto] = useState<Resuelto<T>>({
    clave: "",
    datos: null,
    error: null,
  });

  useEffect(() => {
    let vigente = true;

    // `consulta` se toma de este mismo render, que es el que corresponde a
    // esta clave: capturarla acá es justamente lo correcto.
    consulta(repositorio())
      .then((datos) => {
        if (vigente) setResuelto({ clave, datos, error: null });
      })
      .catch((problema: unknown) => {
        if (!vigente) return;
        setResuelto({
          clave,
          datos: null,
          error:
            problema instanceof Error
              ? problema.message
              : "No pudimos cargar los datos.",
        });
      });

    return () => {
      vigente = false;
    };
    // La consulta cambia de identidad en cada render pero no de intención: la
    // clave es la que manda cuándo hay que volver a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return {
    datos: resuelto.datos,
    error: resuelto.error,
    cargando: resuelto.clave !== clave,
    recargar: useCallback(() => refrescarDatos(), []),
  };
}

/**
 * Ejecuta una mutación y refresca las consultas cuando termina.
 * Devuelve `ocupado` para bloquear el botón mientras corre.
 */
export function useAccion(): {
  ocupado: boolean;
  ejecutar: <T>(accion: (repo: RepositorioPatoteca) => Promise<T>) => Promise<T>;
} {
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = useCallback(
    async <T,>(accion: (repo: RepositorioPatoteca) => Promise<T>): Promise<T> => {
      setOcupado(true);
      try {
        const resultado = await accion(repositorio());
        refrescarDatos();
        return resultado;
      } finally {
        setOcupado(false);
      }
    },
    [],
  );

  return { ocupado, ejecutar };
}
