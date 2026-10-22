"use client";

/**
 * A qué cuenta devolverle la plata a un dueño que canceló a tiempo y ya había
 * pagado.
 *
 * Aparece SOLO cuando hay algo que devolver. Si el cobro seguía pendiente,
 * anularlo ya es la devolución, y ofrecerle una transferencia a alguien que
 * nunca pagó es prometerle algo que no llega. La deciden las pantallas que
 * cancelan —el día de jardín en Mi cuenta y el día de prueba—, que son las
 * que saben cuánto vuelve.
 */

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PrecioCLP } from "@/components/shared/precio";
import type { DatosBancarios } from "@/lib/types";

const TIPOS_DE_CUENTA = [
  "Cuenta corriente",
  "Cuenta vista",
  "Cuenta RUT",
  "Cuenta de ahorro",
];

/**
 * Parte con lo que ya está en su ficha: nadie se sabe su número de cuenta de
 * memoria, y pedírselo de nuevo en cada devolución es la manera de que quede
 * a medias.
 */
export function cuentaInicial(guardada?: DatosBancarios): DatosBancarios {
  return (
    guardada ?? {
      titular: "",
      rut: "",
      banco: "",
      tipoDeCuenta: TIPOS_DE_CUENTA[0],
      numero: "",
    }
  );
}

/** Sin titular, RUT y número la transferencia no se puede hacer. */
export function faltanDatosDeCuenta(cuenta: DatosBancarios): boolean {
  return !cuenta.titular.trim() || !cuenta.rut.trim() || !cuenta.numero.trim();
}

export function CuentaParaDevolver({
  aDevolver,
  cuenta,
  alCambiar,
}: {
  aDevolver: number;
  cuenta: DatosBancarios;
  alCambiar: (cuenta: DatosBancarios) => void;
}) {
  const idTipoDeCuenta = useId();

  return (
    <div className="bg-secondary/50 space-y-3 rounded-xl p-3">
      <p className="text-sm font-semibold">
        Te devolvemos <PrecioCLP monto={aDevolver} /> por transferencia
      </p>
      <p className="text-muted-foreground text-xs text-pretty">
        Dinos a qué cuenta. La hacemos dentro de los próximos días hábiles.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CampoCuenta
          etiqueta="Nombre del titular"
          valor={cuenta.titular}
          alCambiar={(titular) => alCambiar({ ...cuenta, titular })}
        />
        <CampoCuenta
          etiqueta="RUT del titular"
          valor={cuenta.rut}
          alCambiar={(rut) => alCambiar({ ...cuenta, rut })}
        />
        <CampoCuenta
          etiqueta="Banco"
          valor={cuenta.banco}
          alCambiar={(banco) => alCambiar({ ...cuenta, banco })}
        />
        <div className="space-y-1">
          <Label htmlFor={idTipoDeCuenta} className="text-xs">
            Tipo de cuenta
          </Label>
          <Select
            id={idTipoDeCuenta}
            value={cuenta.tipoDeCuenta}
            onChange={(e) =>
              alCambiar({ ...cuenta, tipoDeCuenta: e.target.value })
            }
          >
            {TIPOS_DE_CUENTA.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <CampoCuenta
            etiqueta="Número de cuenta"
            valor={cuenta.numero}
            alCambiar={(numero) => alCambiar({ ...cuenta, numero })}
          />
        </div>
      </div>

      {/* El titular puede no ser el cliente: hay cuentas a nombre de la
          pareja, y el banco rechaza si el nombre no calza con el RUT. */}
      <p className="text-muted-foreground text-xs text-pretty">
        Si la cuenta está a nombre de otra persona, pon sus datos: el banco
        rechaza la transferencia cuando el nombre no calza con el RUT.
      </p>
    </div>
  );
}

function CampoCuenta({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  // La etiqueta va amarrada al campo con `htmlFor`. Sin eso un lector de
  // pantalla lee cinco cajas de texto sin nombre, y tocar la etiqueta en el
  // celular no enfoca nada: el área tocable se reduce a la caja.
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </div>
  );
}
