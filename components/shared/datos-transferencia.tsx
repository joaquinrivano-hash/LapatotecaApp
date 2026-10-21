"use client";

/**
 * La cuenta donde se paga.
 *
 * Los datos los completa Administración en /admin/configuracion. Mientras
 * estén vacíos no se inventa nada: se dice que llegan por WhatsApp, que es
 * lo que de verdad pasa.
 */

import { Landmark } from "lucide-react";
import { useConsulta } from "@/lib/hooks/use-consulta";
import type { DatosDeTransferencia } from "@/lib/types";

/** true si hay lo mínimo para transferir: a quién y a qué cuenta. */
export function hayDatosDeTransferencia(datos: DatosDeTransferencia): boolean {
  return datos.titular.trim() !== "" && datos.numero.trim() !== "";
}

export function DatosTransferencia() {
  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);
  const datos = configuracion.datos?.transferencia;

  if (!datos) return null;

  if (!hayDatosDeTransferencia(datos)) {
    return (
      <p className="text-muted-foreground flex items-start gap-2 text-xs text-pretty">
        <Landmark className="mt-0.5 size-3.5 shrink-0" />
        Te escribimos por WhatsApp con los datos para transferir.
      </p>
    );
  }

  const { titular, rut, banco, tipoDeCuenta, numero, email } = datos;

  return (
    <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
      <dt className="font-semibold">Titular</dt>
      <dd className="break-words">{titular}</dd>
      {rut && (
        <>
          <dt className="font-semibold">RUT</dt>
          <dd>{rut}</dd>
        </>
      )}
      {banco && (
        <>
          <dt className="font-semibold">Banco</dt>
          <dd>
            {banco}
            {tipoDeCuenta && ` · ${tipoDeCuenta}`}
          </dd>
        </>
      )}
      <dt className="font-semibold">Cuenta</dt>
      <dd className="select-all">{numero}</dd>
      {email && (
        <>
          <dt className="font-semibold">Comprobante</dt>
          <dd className="break-all">{email}</dd>
        </>
      )}
    </dl>
  );
}
