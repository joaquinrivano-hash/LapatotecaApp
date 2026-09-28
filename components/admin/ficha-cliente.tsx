"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Save, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import {
  aBorrador,
  cambiosDePerro,
  estadoDesde,
  FormularioPerro,
  type EstadoPerro,
} from "@/components/shared/formulario-perro";
import { revisarAltaDePerro, type FaltanteDeAlta } from "@/lib/rules/alta-perro";
import {
  CarnetDeVacunas,
  DatosPerro,
  FotoPerro,
  HistorialIncidentes,
} from "@/components/shared/detalle-perro";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { alertasDePerro, type ClienteConPerros } from "@/lib/servicios/clientes";
import { cn } from "@/lib/utils";
import { formatearTelefono } from "@/lib/utils/telefono";
import type { EstadoDiaDePrueba, Perro } from "@/lib/types";

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
  const [editando, setEditando] = useState(false);

  // El mismo formulario que llena el dueño. El admin agrega el estado del día
  // de prueba, que es lo único que no le toca decidir a él.
  const [ficha, setFicha] = useState<EstadoPerro>(() => estadoDesde(perro));
  const [estadoPrueba, setEstadoPrueba] = useState(perro.diaDePrueba.estado);
  const [faltantes, setFaltantes] = useState<FaltanteDeAlta[]>([]);

  const configuracion = useConsulta((repo) => repo.configuracion.obtener(), []);
  const alertas = alertasDePerro(perro, hoy);

  function empezarAEditar() {
    // Se recarga desde el perro para no arrastrar una edición abandonada.
    setFicha(estadoDesde(perro));
    setFaltantes([]);
    setEditando(true);
  }

  async function guardar() {
    if (!configuracion.datos) return;

    const revision = revisarAltaDePerro(
      aBorrador(ficha),
      configuracion.datos,
      hoy,
    );
    setFaltantes(revision);
    if (revision.length > 0) {
      toast.error("Falta completar la ficha.", {
        description: revision[0].mensaje,
      });
      return;
    }

    await ejecutar((repo) =>
      repo.perros.actualizar(perro.id, {
        ...cambiosDePerro(ficha),
        diaDePrueba: { ...perro.diaDePrueba, estado: estadoPrueba },
      }),
    );
    setEditando(false);
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
          {/* La misma ficha que ve el equipo, para que quien usa las dos
              caras no tenga que aprender dos formatos. Editar es lo que
              agrega el admin, no otra manera de mirar los datos. */}
          <FotoPerro perro={perro} />
          {/* Sin el teléfono: ya está arriba, en los datos del dueño. */}
          <DatosPerro perro={perro} hoy={hoy} />
          <CarnetDeVacunas perro={perro} />
          <HistorialIncidentes perroId={perro.id} hoy={hoy} />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => (editando ? setEditando(false) : empezarAEditar())}
            >
              <Pencil />
              {editando ? "Dejar de editar" : "Editar datos"}
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

          {editando && (
            <div className="space-y-4 border-t border-border/60 pt-3">
              {configuracion.datos && (
                <FormularioPerro
                  estado={ficha}
                  onCambio={setFicha}
                  configuracion={configuracion.datos}
                  faltantes={faltantes}
                  hoy={hoy}
                />
              )}

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

              <Button className="w-full" disabled={ocupado} onClick={guardar}>
                <Save />
                Guardar cambios
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
