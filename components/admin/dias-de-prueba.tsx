"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CalendarClock, Check, PawPrint, X } from "lucide-react";

import { AprobarSinDiaDePrueba } from "@/components/admin/aprobar-sin-dia-de-prueba";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  diasDePruebaPorEvaluar,
  diasDePruebaQueVienen,
  inscritosSinDiaDePrueba,
  resolverDiaDePrueba,
  type DiaDePruebaPorEvaluar,
  type DiaDePruebaQueViene,
  type InscritoSinDiaDePrueba,
} from "@/lib/servicios/evaluacion";
import { formatearDiaMes, formatearHora } from "@/lib/utils/fecha";

/**
 * Los días de prueba: los que vienen y los que esperan veredicto.
 *
 * Son las dos mitades de lo mismo y por eso viven en una tarjeta. Antes
 * estaba solo la segunda, y con eso un día de prueba recién agendado no
 * aparecía EN NINGÚN LADO: la cola de veredictos solo mira los que ya
 * pasaron —un jueves no se evalúa el martes— y el calendario de ocupación
 * muestra un número, no quién viene. La casa se enteraba el día que el perro
 * aparecía en la puerta, que es la primera vez que ese dueño le pide algo.
 *
 * El veredicto va arriba porque es lo que tranca a un cliente: hasta que no
 * se dé, ese perro no puede reservar.
 *
 * En medio, los inscritos que no han agendado. Ahí aparece el cliente que
 * viene hace años apenas crea su cuenta, para aprobarlo sin que venga.
 *
 * Se esconde sola cuando no hay nada de ninguna de las dos: un negocio al
 * día no necesita mirar una tarjeta vacía.
 */
export function DiasDePrueba({ hoy }: { hoy: string }) {
  const porEvaluar = useConsulta(
    (repo) => diasDePruebaPorEvaluar(repo, hoy),
    [hoy],
  );
  const queVienen = useConsulta(
    (repo) => diasDePruebaQueVienen(repo, hoy),
    [hoy],
  );
  const sinAgendar = useConsulta(
    (repo) => inscritosSinDiaDePrueba(repo, hoy),
    [hoy],
  );

  if (porEvaluar.cargando || queVienen.cargando || sinAgendar.cargando)
    return <Skeleton className="h-28 w-full rounded-2xl" />;

  const cola = porEvaluar.datos ?? [];
  const vienen = queVienen.datos ?? [];
  const inscritos = sinAgendar.datos ?? [];
  if (cola.length === 0 && vienen.length === 0 && inscritos.length === 0)
    return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <PawPrint className="size-5" />
          Días de prueba
        </CardTitle>
        {cola.length > 0 && (
          <p className="text-muted-foreground text-sm text-pretty">
            Hasta que no lo apruebes, el perrito no puede reservar.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {cola.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase">
              {cola.length === 1
                ? "Uno por evaluar"
                : `${cola.length} por evaluar`}
            </h3>
            {cola.map((entrada) => (
              <Fila key={entrada.perro.id} entrada={entrada} />
            ))}
          </div>
        )}

        {inscritos.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase">
              {inscritos.length === 1
                ? "Uno inscrito sin día de prueba"
                : `${inscritos.length} inscritos sin día de prueba`}
            </h3>
            <p className="text-muted-foreground text-sm text-pretty">
              Si ya era cliente antes de la app, apruébalo sin que venga.
            </p>
            {/* Cinco y el resto resumido: el día que se inscriban muchos
                clientes de antes juntos, una lista de veinte no se lee. Al
                aprobar uno, sube el siguiente. */}
            {inscritos.slice(0, MOSTRAR_INSCRITOS).map((entrada) => (
              <Inscrito key={entrada.perro.id} entrada={entrada} hoy={hoy} />
            ))}
            {inscritos.length > MOSTRAR_INSCRITOS && (
              <p className="text-muted-foreground text-sm">
                Y {inscritos.length - MOSTRAR_INSCRITOS} más: aparecen a
                medida que apruebes estos, o búscalos en Clientes.
              </p>
            )}
          </div>
        )}

        {vienen.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase">
              {vienen.length === 1 ? "Uno agendado" : `${vienen.length} agendados`}
            </h3>
            {/* Lo que esto contesta es "¿quién viene a conocer la casa?",
                que antes no se podía contestar en ninguna pantalla. El único
                botón es para el cliente de antes que alcanzó a agendar: el
                veredicto espera a que venga. */}
            {vienen.map((entrada) => (
              <Agendado key={entrada.estadia.id} entrada={entrada} hoy={hoy} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MOSTRAR_INSCRITOS = 5;

/** Cuándo se inscribió, en palabras: "hoy", "ayer", "hace 3 días". */
function cuandoSeInscribio(dias: number): string {
  if (dias === 0) return "se inscribió hoy";
  if (dias === 1) return "se inscribió ayer";
  return `se inscribió hace ${dias} días`;
}

function Inscrito({
  entrada,
  hoy,
}: {
  entrada: InscritoSinDiaDePrueba;
  hoy: string;
}) {
  const { perro, cliente, diasInscrito } = entrada;
  const [aprobando, setAprobando] = useState(false);

  return (
    <div className="bg-secondary/40 space-y-3 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <PerroAvatar
          id={perro.id}
          nombre={perro.nombre}
          fotoUrl={perro.fotoUrl}
          tamano="sm"
        />
        {/* El botón va abajo y no al lado: al lado cortaba el nombre del
            dueño, que es justo como se reconoce a un cliente de antes. */}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-semibold text-pretty">
              {perro.nombre}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {cliente ? `${cliente.nombre} ${cliente.apellido}` : "sin dueño"}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              {cuandoSeInscribio(diasInscrito)}
            </p>
          </div>
          {!aprobando && (
            <Button variant="outline" size="sm" onClick={() => setAprobando(true)}>
              <BadgeCheck />
              Ya era cliente
            </Button>
          )}
        </div>
      </div>
      {aprobando && (
        <AprobarSinDiaDePrueba
          perro={perro}
          hoy={hoy}
          onCerrar={() => setAprobando(false)}
        />
      )}
    </div>
  );
}

/** Cuándo llega, en palabras: "hoy", "mañana", "en 7 días". */
function cuandoLlega(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

function Agendado({
  entrada,
  hoy,
}: {
  entrada: DiaDePruebaQueViene;
  hoy: string;
}) {
  const { perro, cliente, estadia, fecha, diasParaQueLlegue } = entrada;
  const [aprobando, setAprobando] = useState(false);

  return (
    <div className="bg-secondary/40 space-y-3 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <PerroAvatar
          id={perro.id}
          nombre={perro.nombre}
          fotoUrl={perro.fotoUrl}
          tamano="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {perro.nombre}
            <span className="text-muted-foreground font-normal">
              {" "}
              · {cliente ? `${cliente.nombre} ${cliente.apellido}` : "sin dueño"}
            </span>
          </p>
          <p className="text-muted-foreground text-sm">
            {formatearDiaMes(`${fecha}T12:00:00Z`)}
            {" · "}
            {formatearHora(estadia.inicioProgramado)}
            {" · "}
            {cuandoLlega(diasParaQueLlegue)}
          </p>
          {/* Casi todos los que agendan son clientes nuevos: la pregunta va
              como enlace y no como un botón en cada fila. */}
          {!aprobando && (
            <button
              type="button"
              onClick={() => setAprobando(true)}
              className="text-muted-foreground mt-1 text-sm underline underline-offset-2"
            >
              ¿Ya era cliente?
            </button>
          )}
        </div>
        <CalendarClock className="text-muted-foreground size-5 shrink-0" />
      </div>
      {aprobando && (
        <AprobarSinDiaDePrueba
          perro={perro}
          hoy={hoy}
          onCerrar={() => setAprobando(false)}
        />
      )}
    </div>
  );
}

function Fila({ entrada }: { entrada: DiaDePruebaPorEvaluar }) {
  const { perro, cliente, estadia, fecha, diasEsperando } = entrada;
  const { ocupado, ejecutar } = useAccion();
  const idNota = useId();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function resolver(veredicto: "aprobado" | "rechazado", nota?: string) {
    try {
      await ejecutar((repo) =>
        resolverDiaDePrueba(repo, perro.id, veredicto, nota),
      );
      toast.success(
        veredicto === "aprobado"
          ? `${perro.nombre} quedó aprobado`
          : `${perro.nombre} quedó rechazado`,
        {
          description:
            veredicto === "aprobado"
              ? "Ya puede reservar jardín y hotel."
              : "Queda anotado en su ficha con el motivo.",
        },
      );
    } catch (problema) {
      toast.error(
        problema instanceof Error ? problema.message : "No pudimos guardarlo.",
      );
    }
  }

  return (
    <div className="bg-secondary/40 space-y-3 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <PerroAvatar
          id={perro.id}
          nombre={perro.nombre}
          fotoUrl={perro.fotoUrl}
          tamano="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {perro.nombre}
            <span className="text-muted-foreground font-normal">
              {" "}
              · {cliente ? `${cliente.nombre} ${cliente.apellido}` : "sin dueño"}
            </span>
          </p>
          <p className="text-muted-foreground text-sm">
            {formatearDiaMes(`${fecha}T12:00:00Z`)}
            {diasEsperando > 0 &&
              ` · hace ${diasEsperando} ${diasEsperando === 1 ? "día" : "días"}`}
            {/* Las horas reales: a qué hora llegó y a qué hora lo buscaron.
                Es el dato que ayuda a acordarse de cuál perro era. */}
            {estadia?.inicioReal && (
              <>
                {" · "}
                {formatearHora(estadia.inicioReal)}
                {estadia.finReal && `–${formatearHora(estadia.finReal)}`}
              </>
            )}
          </p>
        </div>
      </div>

      {rechazando ? (
        <div className="space-y-2">
          <Label htmlFor={idNota}>¿Por qué no lo aprobamos?</Label>
          <Input
            id={idNota}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se puso brusco con los chicos"
          />
          <p className="text-muted-foreground text-xs text-pretty">
            Queda en su ficha. Sin el motivo, el día que alguien lea el
            rechazo no va a saber qué pasó.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={ocupado || motivo.trim() === ""}
              onClick={() => resolver("rechazado", motivo)}
            >
              Confirmar
            </Button>
            <Button variant="ghost" onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        /* Aprobar es un toque: casi todos se aprueban. Rechazar pide el
           motivo, porque un rechazo sin explicación no le sirve a nadie
           cuando alguien lo lea después. */
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={ocupado}
            onClick={() => resolver("aprobado")}
          >
            <Check />
            Aprobar
          </Button>
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() => setRechazando(true)}
          >
            <X />
            No aprobar
          </Button>
        </div>
      )}
    </div>
  );
}
