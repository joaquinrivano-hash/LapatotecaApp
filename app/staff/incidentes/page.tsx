"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, MessageCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { canalMensajeria } from "@/lib/integraciones/mensajeria";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { cargarDiaDeStaff, hoyDelStaff } from "@/lib/servicios/asistencia";
import { crearIncidente } from "@/lib/servicios/reportes";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import { formatearDiaMes } from "@/lib/utils/fecha";
import { sumarDias } from "@/lib/utils/fecha";
import type { GravedadIncidente, TipoIncidente } from "@/lib/types";

const TIPOS: { valor: TipoIncidente; etiqueta: string }[] = [
  { valor: "comportamiento", etiqueta: "Comportamiento" },
  { valor: "salud", etiqueta: "Salud" },
  { valor: "pelea", etiqueta: "Pelea" },
  { valor: "escape", etiqueta: "Escape" },
  { valor: "otro", etiqueta: "Otro" },
];

const GRAVEDADES: {
  valor: GravedadIncidente;
  etiqueta: string;
  clase: string;
}[] = [
  { valor: "leve", etiqueta: "Leve", clase: "border-success text-success" },
  { valor: "moderado", etiqueta: "Moderado", clase: "border-warning text-warning" },
  { valor: "grave", etiqueta: "Grave", clase: "border-destructive text-destructive" },
];

const VARIANTE_GRAVEDAD: Record<
  GravedadIncidente,
  React.ComponentProps<typeof Badge>["variant"]
> = { leve: "success", moderado: "warning", grave: "destructive" };

export default function Incidentes() {
  const hoy = hoyDelStaff();
  const staff = useSesion((s) => s.staff) ?? "Equipo";
  const dia = useConsulta((repo) => cargarDiaDeStaff(repo, hoy), [hoy]);
  const recientes = useConsulta(
    (repo) => repo.incidentes.enRango(sumarDias(hoy, -14), hoy),
    [hoy],
  );
  const { ocupado, ejecutar } = useAccion();

  const [perroId, setPerroId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoIncidente>("comportamiento");
  const [gravedad, setGravedad] = useState<GravedadIncidente>("leve");
  const [descripcion, setDescripcion] = useState("");
  const [avisar, setAvisar] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const candidatos = useMemo(() => {
    if (!dia.datos) return [];
    const presentes = new Set(
      dia.datos.estadias
        .filter((e) => e.estado === "presente" || e.estado === "finalizada")
        .map((e) => e.perroId),
    );
    const texto = busqueda.trim().toLowerCase();
    return dia.datos.perros
      .filter((p) => (texto ? p.nombre.toLowerCase().includes(texto) : presentes.has(p.id)))
      .slice(0, 24);
  }, [dia.datos, busqueda]);

  const perro = dia.datos?.perros.find((p) => p.id === perroId);

  async function guardar() {
    if (!perroId || !descripcion.trim()) return;

    const resultado = await ejecutar((repo) =>
      crearIncidente(repo, canalMensajeria(), {
        perroId,
        tipo,
        gravedad,
        descripcion,
        autorStaff: staff,
        avisarAlDueno: avisar,
      }),
    );

    toast.success("Incidente anotado", {
      description: resultado.despacho
        ? resultado.despacho.enviados > 0
          ? "Le avisamos al dueño."
          : "No pudimos avisarle al dueño: revisa la bandeja."
        : "Queda en la ficha del perro.",
    });

    setPerroId(null);
    setDescripcion("");
    setAvisar(false);
    setGravedad("leve");
  }

  if (dia.cargando && !dia.datos) return <Skeleton className="h-96" />;

  return (
    <Tabs defaultValue="nuevo">
      <TabsList>
        <TabsTrigger value="nuevo">Anotar</TabsTrigger>
        <TabsTrigger value="recientes">Últimos 14 días</TabsTrigger>
      </TabsList>

      <TabsContent value="nuevo" className="mt-3 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>¿A qué perro?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre…"
            />
            {candidatos.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No encontramos perros con ese nombre.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {candidatos.map((candidato) => (
                  <button
                    key={candidato.id}
                    type="button"
                    onClick={() =>
                      setPerroId(perroId === candidato.id ? null : candidato.id)
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-full border-2 py-1.5 pr-4 pl-1.5 transition-all active:scale-[0.98]",
                      perroId === candidato.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <PerroAvatar
                      id={candidato.id}
                      nombre={candidato.nombre}
                      fotoUrl={candidato.fotoUrl}
                      tamano="sm"
                    />
                    <span className="text-sm font-semibold">
                      {candidato.nombre}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>¿Qué pasó?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => setTipo(opcion.valor)}
                  className={cn(
                    "rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all",
                    tipo === opcion.valor
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Gravedad</Label>
              <div className="grid grid-cols-3 gap-2">
                {GRAVEDADES.map((opcion) => (
                  <button
                    key={opcion.valor}
                    type="button"
                    onClick={() => setGravedad(opcion.valor)}
                    className={cn(
                      "rounded-xl border-2 py-3 text-sm font-bold transition-all",
                      gravedad === opcion.valor
                        ? opcion.clase
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Cuenta qué pasó, con el detalle que necesitarías si te preguntan mañana…"
              rows={4}
            />

            <label className="bg-secondary/50 flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="size-4 shrink-0" />
                Avisarle al dueño por WhatsApp
              </span>
              <Switch checked={avisar} onCheckedChange={setAvisar} />
            </label>
          </CardContent>
        </Card>

        <Button
          size="xl"
          className="w-full"
          disabled={!perroId || !descripcion.trim() || ocupado}
          onClick={guardar}
        >
          <ShieldAlert />
          {perro ? `Anotar en la ficha de ${perro.nombre}` : "Anotar incidente"}
        </Button>
      </TabsContent>

      <TabsContent value="recientes" className="mt-3 space-y-2">
        {recientes.cargando ? (
          <Skeleton className="h-40" />
        ) : (recientes.datos ?? []).length === 0 ? (
          <EstadoVacio
            titulo="Sin incidentes"
            descripcion="Dos semanas sin novedades. Así da gusto."
            icono={AlertTriangle}
          />
        ) : (
          [...(recientes.datos ?? [])]
            .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
            .map((incidente) => {
              const suPerro = dia.datos?.perros.find(
                (p) => p.id === incidente.perroId,
              );
              return (
                <div
                  key={incidente.id}
                  className="bg-card flex gap-3 rounded-2xl border border-border/70 p-3 shadow-sm"
                >
                  {suPerro && (
                    <PerroAvatar
                      id={suPerro.id}
                      nombre={suPerro.nombre}
                      fotoUrl={suPerro.fotoUrl}
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {suPerro?.nombre ?? "Perro"}
                      </span>
                      <Badge variant={VARIANTE_GRAVEDAD[incidente.gravedad]}>
                        {incidente.gravedad}
                      </Badge>
                      <span className="text-muted-foreground text-xs first-letter:uppercase">
                        {formatearDiaMes(`${incidente.fecha}T12:00:00Z`)} ·{" "}
                        {incidente.autorStaff}
                      </span>
                    </div>
                    <p className="text-sm text-pretty">
                      {incidente.descripcion}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </TabsContent>
    </Tabs>
  );
}
