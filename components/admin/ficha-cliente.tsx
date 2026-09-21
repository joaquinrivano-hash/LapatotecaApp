"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Save, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { useAccion } from "@/lib/hooks/use-consulta";
import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import { alertasDePerro, type ClienteConPerros } from "@/lib/servicios/clientes";
import { cn } from "@/lib/utils";
import { formatearTelefono } from "@/lib/utils/telefono";
import type { EstadoDiaDePrueba, Perro, TipoVacuna } from "@/lib/types";

const ESTADOS_PRUEBA: { valor: EstadoDiaDePrueba; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "agendado", etiqueta: "Agendado" },
  { valor: "aprobado", etiqueta: "Aprobado" },
  { valor: "rechazado", etiqueta: "Rechazado" },
];

export function FichaCliente({
  entrada,
  hoy,
  onCerrar,
}: {
  entrada: ClienteConPerros;
  hoy: string;
  onCerrar: () => void;
}) {
  const { cliente, perros } = entrada;
  const { ocupado, ejecutar } = useAccion();
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({
    nombre: cliente.nombre,
    apellido: cliente.apellido,
    email: cliente.email,
    telefono: cliente.telefono,
    comuna: cliente.comuna,
    direccion: cliente.direccion ?? "",
  });

  async function guardar() {
    await ejecutar((repo) => repo.clientes.actualizar(cliente.id, datos));
    setEditando(false);
    toast.success("Ficha actualizada");
  }

  async function eliminar() {
    if (perros.length > 0) {
      toast.error("Primero elimina sus perros", {
        description: "Un perro sin dueño queda huérfano en el historial.",
      });
      return;
    }
    await ejecutar((repo) => repo.clientes.eliminar(cliente.id));
    toast.success("Cliente eliminado");
    onCerrar();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {cliente.nombre} {cliente.apellido}
        </SheetTitle>
        <SheetDescription>
          {cliente.comuna} · cliente desde {cliente.creadoEn.slice(0, 10)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 overflow-y-auto px-5 pb-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold">Datos de contacto</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditando((v) => !v)}
            >
              <Pencil />
              {editando ? "Cancelar" : "Editar"}
            </Button>
          </div>

          {editando ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["nombre", "Nombre"],
                  ["apellido", "Apellido"],
                  ["email", "Email"],
                  ["telefono", "Teléfono"],
                  ["comuna", "Comuna"],
                  ["direccion", "Dirección"],
                ] as const
              ).map(([campo, etiqueta]) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={campo}>{etiqueta}</Label>
                  <Input
                    id={campo}
                    value={datos[campo]}
                    onChange={(e) =>
                      setDatos((d) => ({ ...d, [campo]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <Button
                className="sm:col-span-2"
                size="lg"
                disabled={ocupado}
                onClick={guardar}
              >
                <Save />
                Guardar
              </Button>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Dato etiqueta="Email" valor={cliente.email} />
              <Dato
                etiqueta="Teléfono"
                valor={formatearTelefono(cliente.telefono)}
              />
              <Dato etiqueta="Comuna" valor={cliente.comuna} />
              <Dato etiqueta="Dirección" valor={cliente.direccion ?? "—"} />
            </dl>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="font-display font-bold">
            Sus perros
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {perros.length}
            </span>
          </h3>

          {perros.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Este cliente no tiene perros registrados.
            </p>
          ) : (
            perros.map((perro) => (
              <EditorPerro key={perro.id} perro={perro} hoy={hoy} />
            ))
          )}
        </section>
      </div>

      <SheetFooter>
        <Button
          variant="ghost"
          size="lg"
          disabled={ocupado}
          onClick={eliminar}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 />
          Eliminar cliente
        </Button>
      </SheetFooter>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold uppercase">
        {etiqueta}
      </dt>
      <dd className="break-words">{valor}</dd>
    </div>
  );
}

function EditorPerro({ perro, hoy }: { perro: Perro; hoy: string }) {
  const { ocupado, ejecutar } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [pesoKg, setPesoKg] = useState(String(perro.pesoKg));
  const [esterilizado, setEsterilizado] = useState(perro.esterilizado);
  const [notas, setNotas] = useState(perro.notas ?? "");
  const [estadoPrueba, setEstadoPrueba] = useState(perro.diaDePrueba.estado);
  const [vencimientos, setVencimientos] = useState<Record<string, string>>(
    Object.fromEntries(
      NEGOCIO.admision.vacunasObligatorias.map((tipo) => [
        tipo,
        perro.vacunas.find((v) => v.tipo === tipo)?.fechaVencimiento ?? "",
      ]),
    ),
  );

  const alertas = alertasDePerro(perro, hoy);

  async function guardar() {
    const peso = Number(pesoKg.replace(",", "."));
    if (!Number.isFinite(peso) || peso <= 0) {
      toast.error("El peso tiene que ser un número.");
      return;
    }

    // Se guarda la fecha de vencimiento, que es la que decide la admisión.
    // La de aplicación se deriva un año antes si no había una registrada.
    const vacunas = NEGOCIO.admision.vacunasObligatorias
      .filter((tipo) => vencimientos[tipo])
      .map((tipo: TipoVacuna) => {
        const previa = perro.vacunas.find((v) => v.tipo === tipo);
        return {
          tipo,
          fechaVencimiento: vencimientos[tipo],
          fechaAplicacion:
            previa?.fechaVencimiento === vencimientos[tipo]
              ? previa.fechaAplicacion
              : `${Number(vencimientos[tipo].slice(0, 4)) - 1}${vencimientos[tipo].slice(4)}`,
        };
      });

    await ejecutar((repo) =>
      repo.perros.actualizar(perro.id, {
        pesoKg: peso,
        esterilizado,
        notas: notas.trim() || undefined,
        vacunas,
        diaDePrueba: { ...perro.diaDePrueba, estado: estadoPrueba },
      }),
    );
    setAbierto(false);
    toast.success(`${perro.nombre} actualizado`);
  }

  async function eliminar() {
    await ejecutar((repo) => repo.perros.eliminar(perro.id));
    toast.success(`${perro.nombre} eliminado`);
  }

  return (
    <div className="rounded-2xl border border-border/70 p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <PerroAvatar
          id={perro.id}
          nombre={perro.nombre}
          fotoUrl={perro.fotoUrl}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{perro.nombre}</span>
          <span className="text-muted-foreground block truncate text-sm">
            {perro.raza} · {perro.pesoKg} kg ·{" "}
            {perro.sexo === "macho" ? "macho" : "hembra"}
          </span>
        </span>
        {alertas.length > 0 && (
          <Badge variant={alertas.some((a) => a.bloquea) ? "destructive" : "warning"}>
            <TriangleAlert />
            {alertas.length}
          </Badge>
        )}
      </button>

      {alertas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {alertas.map((alerta) => (
            <li
              key={alerta.tipo}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm",
                alerta.bloquea
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/12 text-warning",
              )}
            >
              {alerta.mensaje}
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`peso-${perro.id}`}>Peso (kg)</Label>
              <Input
                id={`peso-${perro.id}`}
                inputMode="decimal"
                value={pesoKg}
                onChange={(e) => setPesoKg(e.target.value)}
              />
            </div>
            <label className="bg-secondary/50 flex cursor-pointer items-center justify-between gap-3 self-end rounded-xl p-3">
              <span className="text-sm font-semibold">Esterilizado</span>
              <Switch
                checked={esterilizado}
                onCheckedChange={setEsterilizado}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Día de prueba</Label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS_PRUEBA.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => setEstadoPrueba(opcion.valor)}
                  className={cn(
                    "rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-all",
                    estadoPrueba === opcion.valor
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vacunas: hasta cuándo están vigentes</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {NEGOCIO.admision.vacunasObligatorias.map((tipo) => (
                <div key={tipo} className="space-y-1">
                  <span className="text-muted-foreground text-xs capitalize">
                    {nombreVacuna(tipo)}
                  </span>
                  <Input
                    type="date"
                    value={vencimientos[tipo] ?? ""}
                    onChange={(e) =>
                      setVencimientos((v) => ({ ...v, [tipo]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`notas-${perro.id}`}>Notas</Label>
            <Textarea
              id={`notas-${perro.id}`}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Mañas, comidas, alergias…"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" disabled={ocupado} onClick={guardar}>
              <Save />
              Guardar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Eliminar a ${perro.nombre}`}
              disabled={ocupado}
              onClick={eliminar}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

