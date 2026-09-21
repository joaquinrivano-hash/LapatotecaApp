"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck,
  Search,
  Ticket,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { PrecioCLP } from "@/components/shared/precio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  opcionesDeRetiro,
  registrarIngreso,
  revisarIngreso,
} from "@/lib/servicios/asistencia";
import { cn } from "@/lib/utils";
import { hhmmDesdeMinutos } from "@/lib/utils/fecha";
import type { Perro } from "@/lib/types";

/**
 * El perro que llegó sin reserva.
 *
 * La decisión de aceptarlo la toma quien está mirando al perro. Lo que hace
 * esta pantalla es ponerle enfrente lo que necesita saber —cupo, vacunas,
 * plan con saldo, cuánto va a salir— y después registrar la realidad.
 */
export function AgregarPerro({ onListo }: { onListo?: () => void }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => setAbierto(true)}
      >
        <UserPlus />
        Llegó un perro sin reserva
      </Button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="max-h-[92svh]">
          {abierto && (
            <Contenido
              onListo={() => {
                setAbierto(false);
                onListo?.();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Contenido({ onListo }: { onListo: () => void }) {
  const [texto, setTexto] = useState("");
  const [perro, setPerro] = useState<Perro | null>(null);
  const [finMinutos, setFinMinutos] = useState<number | null>(null);

  const encontrados = useConsulta(
    (repo) => (texto.trim() ? repo.perros.buscar(texto) : Promise.resolve([])),
    [texto],
  );

  if (perro) {
    return (
      <Revision
        perro={perro}
        finMinutos={finMinutos}
        onCambiarRetiro={setFinMinutos}
        onVolver={() => setPerro(null)}
        onListo={onListo}
      />
    );
  }

  const resultados = encontrados.datos ?? [];

  return (
    <>
      <SheetHeader>
        <SheetTitle>¿Quién llegó?</SheetTitle>
        <SheetDescription>
          Busca por el nombre del perro o el de su dueño.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-3 overflow-y-auto px-5 pb-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pelusa, o la Javiera…"
            className="h-14 pl-12"
            autoFocus
          />
        </div>

        {!texto.trim() ? (
          <p className="text-muted-foreground py-6 text-center text-sm text-pretty">
            Solo perros que ya son clientes. Uno nuevo necesita su día de
            prueba antes de quedarse.
          </p>
        ) : encontrados.cargando ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : resultados.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No encontramos a nadie con ese nombre.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {resultados.slice(0, 20).map((candidato) => (
              <li key={candidato.id}>
                <button
                  type="button"
                  onClick={() => setPerro(candidato)}
                  className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors"
                >
                  <PerroAvatar
                    id={candidato.id}
                    nombre={candidato.nombre}
                    fotoUrl={candidato.fotoUrl}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {candidato.nombre}
                    </span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {candidato.raza} · {candidato.pesoKg} kg
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Revision({
  perro,
  finMinutos,
  onCambiarRetiro,
  onVolver,
  onListo,
}: {
  perro: Perro;
  finMinutos: number | null;
  onCambiarRetiro: (minutos: number) => void;
  onVolver: () => void;
  onListo: () => void;
}) {
  const { ocupado, ejecutar } = useAccion();
  const opciones = opcionesDeRetiro();
  const retiro = finMinutos ?? opciones.at(-1)?.minutos ?? 19 * 60;

  const revision = useConsulta(
    (repo) =>
      revisarIngreso(repo, { perroId: perro.id, finEstimadoMinutos: retiro }),
    [perro.id, retiro],
  );

  async function registrar() {
    const forzar = !(revision.datos?.sinReparos ?? false);
    await ejecutar((repo) =>
      registrarIngreso(repo, {
        perroId: perro.id,
        finEstimadoMinutos: retiro,
        forzar,
      }),
    );
    toast.success(`${perro.nombre} quedó adentro`, {
      description: forzar
        ? "Registrado con reparos: quedó anotado en el día."
        : undefined,
    });
    onListo();
  }

  const datos = revision.datos;
  const yaEsta = datos?.estadiaExistente ?? null;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <PerroAvatar
            id={perro.id}
            nombre={perro.nombre}
            fotoUrl={perro.fotoUrl}
            tamano="lg"
          />
          <div className="min-w-0">
            <SheetTitle>{perro.nombre}</SheetTitle>
            <SheetDescription>
              {datos?.cliente
                ? `${datos.cliente.nombre} ${datos.cliente.apellido}`
                : perro.raza}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-3 overflow-y-auto px-5 pb-4">
        {revision.cargando && !datos ? (
          <Skeleton className="h-40" />
        ) : !datos ? null : yaEsta ? (
          <p className="bg-secondary flex items-start gap-2 rounded-xl p-3 text-sm">
            <CalendarCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              {perro.nombre} ya está agendado hoy. Márcale la llegada desde la
              lista de Hoy.
            </span>
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-semibold">¿Hasta qué hora se queda?</p>
              <div className="grid grid-cols-2 gap-2">
                {opciones.map((opcion) => (
                  <button
                    key={opcion.minutos}
                    type="button"
                    onClick={() => onCambiarRetiro(opcion.minutos)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all",
                      retiro === opcion.minutos
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {opcion.etiqueta}
                    <span className="block text-xs font-normal">
                      hasta {hhmmDesdeMinutos(opcion.minutos)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-secondary/50 flex items-center justify-between gap-3 rounded-xl p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 shrink-0" />
                Cupos libres
              </span>
              <Badge
                variant={datos.cuposDisponibles > 0 ? "success" : "destructive"}
              >
                {datos.cuposDisponibles} de 25
              </Badge>
            </div>

            <div className="bg-secondary/50 flex items-center justify-between gap-3 rounded-xl p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Ticket className="size-4 shrink-0" />
                {datos.planDisponible ? "Con plan vigente" : "Día suelto"}
              </span>
              {datos.planDisponible ? (
                <Badge variant="jardin">
                  quedan{" "}
                  {datos.planDisponible.diasTotales -
                    datos.planDisponible.diasUsados}{" "}
                  días
                </Badge>
              ) : (
                <PrecioCLP monto={datos.cotizacionEstimada.total} />
              )}
            </div>

            {datos.admision.problemas.map((problema) => (
              <p
                key={problema.motivo}
                className="bg-warning/12 text-warning flex items-start gap-2 rounded-xl p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{problema.mensaje}</span>
              </p>
            ))}

            {!datos.capacidad.hayCupo && (
              <p className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  A esta hora ya hay 25 perros. Si lo dejas entrar, el día
                  queda sobre el máximo.
                </span>
              </p>
            )}
          </>
        )}
      </div>

      <SheetFooter>
        {!yaEsta && (
          <Button
            size="xl"
            disabled={ocupado || revision.cargando || !datos}
            variant={datos?.sinReparos === false ? "destructive" : "default"}
            onClick={registrar}
          >
            <UserPlus />
            {datos?.sinReparos === false
              ? "Registrar de todas formas"
              : `Dejar entrar a ${perro.nombre}`}
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={onVolver}>
          Buscar otro perro
        </Button>
      </SheetFooter>
    </>
  );
}
