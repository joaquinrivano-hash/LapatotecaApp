"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Search, Syringe, TriangleAlert, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { Tile } from "@/components/shared/tile";
import { FichaCliente } from "@/components/admin/ficha-cliente";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  cargarClientes,
  resumirAlertas,
  type ClienteConPerros,
} from "@/lib/servicios/clientes";
import { cn } from "@/lib/utils";

export default function Clientes() {
  const hoy = hoyDelStaff();
  const [busqueda, setBusqueda] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const clientes = useConsulta(
    (repo) => cargarClientes(repo, hoy, busqueda),
    [hoy, busqueda],
  );

  const todos = clientes.datos ?? [];
  const resumen = resumirAlertas(todos);
  const visibles = soloAlertas
    ? todos.filter((c) => c.alertas.length > 0)
    : todos;

  const seleccionado = todos.find((c) => c.cliente.id === abierto) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Clientes y perros</h1>
          <p className="text-muted-foreground text-sm">
            {todos.length} {todos.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        <Button size="lg" onClick={() => setCreando(true)}>
          <UserPlus />
          Nuevo cliente
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile etiqueta="Clientes" valor={todos.length} icono={Users} />
        <Tile
          etiqueta="Vacunas vencidas"
          valor={resumen.vacunasVencidas}
          acento={resumen.vacunasVencidas > 0 ? "alerta" : "neutro"}
          icono={Syringe}
        />
        <Tile
          etiqueta="Por vencer"
          valor={resumen.vacunasPorVencer}
          detalle="en los próximos 30 días"
          icono={Syringe}
        />
        <Tile
          etiqueta="No pueden reservar"
          valor={resumen.bloqueantes}
          acento={resumen.bloqueantes > 0 ? "alerta" : "neutro"}
          icono={TriangleAlert}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del dueño o del perro…"
            className="pl-12"
          />
        </div>
        <Button
          variant={soloAlertas ? "default" : "outline"}
          size="lg"
          onClick={() => setSoloAlertas((v) => !v)}
        >
          <TriangleAlert />
          Solo con alertas
        </Button>
      </div>

      {clientes.cargando && todos.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo={soloAlertas ? "Nada pendiente" : "No encontramos a nadie"}
          descripcion={
            soloAlertas
              ? "Ningún perro tiene vacunas vencidas ni requisitos pendientes."
              : "Prueba con otro nombre."
          }
          icono={soloAlertas ? Syringe : Search}
        />
      ) : (
        <ul className="space-y-2">
          {visibles.map((entrada) => (
            <li key={entrada.cliente.id}>
              <FilaCliente
                entrada={entrada}
                onAbrir={() => setAbierto(entrada.cliente.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={seleccionado !== null}
        onOpenChange={(v) => !v && setAbierto(null)}
      >
        <SheetContent lado="right" className="max-w-lg">
          {seleccionado && (
            <FichaCliente
              entrada={seleccionado}
              hoy={hoy}
              onCerrar={() => setAbierto(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={creando} onOpenChange={setCreando}>
        <SheetContent lado="right" className="max-w-lg">
          <NuevoCliente onListo={() => setCreando(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilaCliente({
  entrada,
  onAbrir,
}: {
  entrada: ClienteConPerros;
  onAbrir: () => void;
}) {
  const { cliente, perros, alertas, bloqueado } = entrada;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="bg-card flex w-full items-center gap-3 rounded-2xl border border-border/70 p-3 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex -space-x-3">
        {perros.slice(0, 3).map((perro) => (
          <PerroAvatar
            key={perro.id}
            id={perro.id}
            nombre={perro.nombre}
            fotoUrl={perro.fotoUrl}
            className="ring-card ring-2"
          />
        ))}
        {perros.length === 0 && (
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full text-xs font-semibold">
            sin
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {cliente.nombre} {cliente.apellido}
        </p>
        <p className="text-muted-foreground truncate text-sm">
          {perros.map((p) => p.nombre).join(", ") || "Sin perros"} ·{" "}
          {cliente.comuna}
        </p>
      </div>

      {alertas.length > 0 && (
        <Badge variant={bloqueado ? "destructive" : "warning"}>
          <TriangleAlert />
          {alertas.length}
        </Badge>
      )}
    </button>
  );
}

const CAMPOS_CLIENTE = [
  ["nombre", "Nombre"],
  ["apellido", "Apellido"],
  ["email", "Email"],
  ["telefono", "Teléfono"],
  ["comuna", "Comuna"],
] as const;

function NuevoCliente({ onListo }: { onListo: () => void }) {
  const { ocupado, ejecutar } = useAccion();
  const [cliente, setCliente] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    comuna: "Providencia",
  });
  const [perro, setPerro] = useState({ nombre: "", raza: "", pesoKg: "" });

  const puedeGuardar =
    cliente.nombre.trim().length > 0 &&
    cliente.apellido.trim().length > 0 &&
    cliente.telefono.trim().length > 0;

  async function guardar() {
    const ahora = new Date().toISOString();

    await ejecutar(async (repo) => {
      const creado = await repo.clientes.crear({ ...cliente, creadoEn: ahora });

      if (perro.nombre.trim()) {
        const peso = Number(perro.pesoKg.replace(",", "."));
        await repo.perros.crear({
          clienteId: creado.id,
          nombre: perro.nombre.trim(),
          raza: perro.raza.trim() || "Sin especificar",
          pesoKg: Number.isFinite(peso) && peso > 0 ? peso : 10,
          sexo: "hembra",
          esterilizado: true,
          vacunas: [],
          // Un perro nuevo siempre parte sin día de prueba: es el requisito
          // que lo habilita para reservar.
          diaDePrueba: { estado: "pendiente" },
          creadoEn: ahora,
        });
      }
    });

    toast.success("Cliente creado", {
      description: perro.nombre.trim()
        ? `${perro.nombre.trim()} queda pendiente de su día de prueba.`
        : undefined,
    });
    onListo();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Nuevo cliente</SheetTitle>
      </SheetHeader>

      <div className="space-y-4 overflow-y-auto px-5 pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS_CLIENTE.map(([campo, etiqueta]) => (
            <div key={campo} className="space-y-1.5">
              <Label htmlFor={`nuevo-${campo}`}>
                {etiqueta}
                {campo !== "email" && campo !== "comuna" && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </Label>
              <Input
                id={`nuevo-${campo}`}
                value={cliente[campo]}
                onChange={(e) =>
                  setCliente((c) => ({ ...c, [campo]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-dashed border-border p-3">
          <p className="text-sm font-semibold">Su primer perro (opcional)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["nombre", "Nombre"],
                ["raza", "Raza"],
                ["pesoKg", "Peso (kg)"],
              ] as const
            ).map(([campo, etiqueta]) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`perro-${campo}`}>{etiqueta}</Label>
                <Input
                  id={`perro-${campo}`}
                  inputMode={campo === "pesoKg" ? "decimal" : undefined}
                  value={perro[campo]}
                  onChange={(e) =>
                    setPerro((p) => ({ ...p, [campo]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            Queda pendiente de su día de prueba. Los datos que falten se
            completan después en su ficha.
          </p>
        </div>
      </div>

      <SheetFooter>
        <Button
          size="xl"
          disabled={!puedeGuardar || ocupado}
          onClick={guardar}
          className={cn(!puedeGuardar && "opacity-60")}
        >
          <UserPlus />
          Crear cliente
        </Button>
      </SheetFooter>
    </>
  );
}
