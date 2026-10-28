"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Pencil,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { HojaDeResumen } from "@/components/staff/tareas";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { RONDAS, rutinaQueFalta } from "@/lib/rules/tareas";
import {
  archivarTarea,
  cargarEncargos,
  cargarRutinaSugerida,
  cargarTareasDelDia,
  crearTarea,
  editarTarea,
  resumenDelDia,
  type DatosDeTarea,
} from "@/lib/servicios/tareas";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import {
  formatearDiaMes,
  formatearFechaLarga,
  formatearHora,
  hoyISO,
  sumarDias,
} from "@/lib/utils/fecha";
import type { EstadoTarea, RegistroDeTarea, RondaDelDia, Tarea } from "@/lib/types";

/** La semana como se lee en Chile: parte el lunes. 0 = domingo. */
const DIAS = [
  { valor: 1, corto: "Lu" },
  { valor: 2, corto: "Ma" },
  { valor: 3, corto: "Mi" },
  { valor: 4, corto: "Ju" },
  { valor: 5, corto: "Vi" },
  { valor: 6, corto: "Sá" },
  { valor: 0, corto: "Do" },
];

const ESTADO: Record<EstadoTarea, { texto: string; variante: React.ComponentProps<typeof Badge>["variant"] }> = {
  pendiente: { texto: "Pendiente", variante: "outline" },
  en_proceso: { texto: "En proceso", variante: "warning" },
  hecha: { texto: "Hecha", variante: "success" },
  no_se_hizo: { texto: "No se hizo", variante: "secondary" },
};

const dia = (fecha: string) => formatearDiaMes(`${fecha}T12:00:00Z`);

export default function TareasAdmin() {
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Tareas del día</h1>
        <p className="text-muted-foreground text-sm">
          Lo que el equipo marca en cada ronda, los encargos y la rutina de
          aseo de la semana.
        </p>
      </div>

      <Tabs defaultValue="dia">
        <TabsList>
          <TabsTrigger value="dia">El día</TabsTrigger>
          <TabsTrigger value="encargos">Encargos</TabsTrigger>
          <TabsTrigger value="rutina">Rutina</TabsTrigger>
        </TabsList>
        <TabsContent value="dia" className="mt-4">
          <ElDia fecha={fecha} hoy={hoy} onFecha={setFecha} />
        </TabsContent>
        <TabsContent value="encargos" className="mt-4">
          <Encargos hoy={hoy} />
        </TabsContent>
        <TabsContent value="rutina" className="mt-4">
          <Rutina />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Errores con su motivo ─────────────────────────────────────────── */

function useHacer() {
  const { ocupado, ejecutar } = useAccion();
  async function hacer<T>(
    accion: (repo: RepositorioPatoteca) => Promise<T>,
    exito?: string,
  ): Promise<T | undefined> {
    try {
      const r = await ejecutar(accion);
      if (exito) toast.success(exito);
      return r;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardarlo.");
      return undefined;
    }
  }
  return { ocupado, hacer };
}

/* ── El día ────────────────────────────────────────────────────────── */

function Firma({ registro }: { registro?: RegistroDeTarea }) {
  if (!registro || registro.estado === "pendiente") return null;
  return (
    <span className="text-muted-foreground text-xs">
      {registro.autorStaff} · {formatearHora(registro.marcadoEn)}
    </span>
  );
}

function Fila({
  titulo,
  estado,
  registro,
  detalle,
}: {
  titulo: string;
  estado: EstadoTarea;
  registro?: RegistroDeTarea;
  detalle?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", estado === "hecha" && "text-muted-foreground")}>
          {titulo}
        </p>
        {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
        {registro?.nota && registro.estado !== "pendiente" && (
          <p className="text-muted-foreground text-xs text-pretty">“{registro.nota}”</p>
        )}
        <Firma registro={registro} />
      </div>
      <Badge variant={ESTADO[estado].variante} className="shrink-0">
        {ESTADO[estado].texto}
      </Badge>
    </li>
  );
}

function ElDia({
  fecha,
  hoy,
  onFecha,
}: {
  fecha: string;
  hoy: string;
  onFecha: (f: string) => void;
}) {
  const datos = useConsulta((repo) => cargarTareasDelDia(repo, fecha), [fecha]);
  const [resumen, setResumen] = useState<string | null>(null);

  const nav = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onFecha(sumarDias(fecha, -1))} aria-label="Día anterior">
        <ChevronLeft />
      </Button>
      <p className="min-w-0 flex-1 text-center font-semibold first-letter:uppercase">
        {formatearFechaLarga(`${fecha}T12:00:00Z`)}
      </p>
      <Button variant="outline" size="icon" onClick={() => onFecha(sumarDias(fecha, 1))} aria-label="Día siguiente">
        <ChevronRight />
      </Button>
      {fecha !== hoy && (
        <Button variant="ghost" onClick={() => onFecha(hoy)}>
          Hoy
        </Button>
      )}
    </div>
  );

  if (!datos.datos) {
    return (
      <div className="space-y-4">
        {nav}
        {datos.error ? (
          <p className="text-destructive text-sm">No pudimos cargar el día: {datos.error}</p>
        ) : (
          <Skeleton className="h-80" />
        )}
      </div>
    );
  }

  const d = datos.datos;
  const nombreDe = (id: string) => d.perros.find((p) => p.id === id)?.nombre ?? "un perrito";
  const { resueltas, total } = d.avance;
  const encargos = d.tareas.filter((t) => t.tarea.tipo === "encargo");
  const aseo = d.tareas.filter((t) => t.tarea.tipo === "rutina");

  return (
    <div className="space-y-4">
      {nav}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <p className="font-display text-3xl font-bold tabular-nums">
              {resueltas}
              <span className="text-muted-foreground text-lg"> / {total}</span>
            </p>
            <p className="text-muted-foreground text-sm">
              {fecha > hoy ? "Lo que va a tocar ese día." : "Resueltas hasta ahora."}
            </p>
          </div>
          <Button variant="outline" onClick={() => setResumen(resumenDelDia(d, "Administración"))}>
            <Send /> Ver el reporte
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {d.rondas.map((r) => (
          <Card key={r.ronda}>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">{r.nombre}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {r.pasos.map((p) => (
                  <Fila
                    key={p.clave}
                    titulo={p.titulo}
                    estado={p.estado}
                    registro={p.registro}
                    detalle={
                      p.paso === "comida" && p.registro?.perroIds?.length
                        ? `No comió: ${p.registro.perroIds.map(nombreDe).join(", ")}`
                        : undefined
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Encargos</CardTitle>
          </CardHeader>
          <CardContent>
            {encargos.length === 0 ? (
              <p className="text-muted-foreground py-3 text-sm">Sin encargos ese día.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {encargos.map((t) => (
                  <Fila
                    key={t.tarea.id}
                    titulo={t.tarea.titulo}
                    estado={t.estado}
                    registro={t.registro}
                    detalle={t.arrastradaDesde ? `Viene del ${dia(t.arrastradaDesde)}` : undefined}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Aseo</CardTitle>
          </CardHeader>
          <CardContent>
            {aseo.length === 0 ? (
              <p className="text-muted-foreground py-3 text-sm">
                {d.hayRutina ? "Ese día no toca nada de la rutina." : "Todavía no hay rutina: ármala en la pestaña Rutina."}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {aseo.map((t) => (
                  <Fila key={t.tarea.id} titulo={t.tarea.titulo} estado={t.estado} registro={t.registro} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {(d.remedios.some((r) => r.dados.length) || d.extras.length > 0 || d.novedades.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Anotaciones
            titulo="Medicamentos"
            registros={d.remedios.flatMap((r) =>
              r.dados.map((x) => ({ ...x, nota: `${r.perro.nombre}: ${x.nota ?? "sus remedios"}` })),
            )}
          />
          <Anotaciones titulo="Además se hizo" registros={d.extras} />
          <Anotaciones titulo="Novedades" registros={d.novedades} />
        </div>
      )}

      <HojaDeResumen abierta={resumen !== null} texto={resumen ?? ""} onCerrar={() => setResumen(null)} />
    </div>
  );
}

function Anotaciones({ titulo, registros }: { titulo: string; registros: RegistroDeTarea[] }) {
  if (registros.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 pt-2">
          {registros.map((r) => (
            <li key={r.id}>
              <p className="text-sm text-pretty">{r.nota}</p>
              <Firma registro={r} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ── Encargos ──────────────────────────────────────────────────────── */

function SelectorDeRonda({
  valor,
  onCambiar,
}: {
  valor?: RondaDelDia;
  onCambiar: (r?: RondaDelDia) => void;
}) {
  return (
    <select
      value={valor ?? ""}
      onChange={(e) => onCambiar((e.target.value || undefined) as RondaDelDia | undefined)}
      className="border-input bg-card h-11 w-full rounded-xl border px-3 text-base"
    >
      <option value="">Cuando se pueda</option>
      {RONDAS.map((r) => (
        <option key={r.clave} value={r.clave}>
          En la {r.nombre.toLowerCase()}
        </option>
      ))}
    </select>
  );
}

function Encargos({ hoy }: { hoy: string }) {
  const staff = useSesion((s) => s.staff);
  const encargos = useConsulta((repo) => cargarEncargos(repo), []);
  const { ocupado, hacer } = useHacer();
  const [titulo, setTitulo] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [ronda, setRonda] = useState<RondaDelDia | undefined>();

  async function crear() {
    const r = await hacer(
      (repo) =>
        crearTarea(repo, "encargo", { titulo, instrucciones, fecha: desde, ronda }, staff ?? "Administración"),
      "Encargo anotado. Lo ve el equipo en sus tareas.",
    );
    if (r) {
      setTitulo("");
      setInstrucciones("");
      setRonda(undefined);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nuevo encargo</CardTitle>
          <p className="text-muted-foreground text-sm">
            Aparece desde el día que elijas y se queda en la lista hasta que
            alguien lo marque hecho.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="encargo-titulo">Qué hay que hacer</Label>
            <Input
              id="encargo-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Lijar la puerta de la pieza de comidas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encargo-como">Cómo (opcional)</Label>
            <Textarea
              id="encargo-como"
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              placeholder="Que quede blanca. La lija está en la pieza de cachureos."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="encargo-desde">Desde</Label>
              <Input id="encargo-desde" type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} />
              {desde && (
                <p className="text-muted-foreground text-xs first-letter:uppercase">
                  {formatearFechaLarga(`${desde}T12:00:00Z`)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Cuándo</Label>
              <SelectorDeRonda valor={ronda} onCambiar={setRonda} />
            </div>
          </div>
          <Button className="w-full" disabled={ocupado || !titulo.trim() || !desde} onClick={crear}>
            <ClipboardList /> Anotar encargo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Vigentes</CardTitle>
        </CardHeader>
        <CardContent>
          {!encargos.datos ? (
            <Skeleton className="mt-3 h-32" />
          ) : encargos.datos.length === 0 ? (
            <EstadoVacio
              titulo="Sin encargos"
              descripcion="Lo puntual que pidas aparece acá, con quién lo hizo y cuándo."
              icono={ClipboardList}
              className="border-0 shadow-none"
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {encargos.datos.map(({ tarea, hecho, ultimo }) => (
                <li key={tarea.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-pretty">{tarea.titulo}</p>
                    {tarea.instrucciones && (
                      <p className="text-muted-foreground text-sm text-pretty">{tarea.instrucciones}</p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {hecho
                        ? `Hecho el ${dia(hecho.fecha)} por ${hecho.autorStaff}`
                        : tarea.fecha && tarea.fecha > hoy
                          ? `Aparece desde el ${dia(tarea.fecha)}`
                          : `Pendiente desde el ${dia(tarea.fecha ?? hoy)}`}
                      {!hecho && ultimo?.estado === "no_se_hizo" && ultimo.nota
                        ? ` · ${dia(ultimo.fecha)}: “${ultimo.nota}”`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado}
                    onClick={() =>
                      hacer((repo) => archivarTarea(repo, tarea.id), hecho ? "Archivado." : "Listo, ya no aparece.")
                    }
                  >
                    <Archive /> {hecho ? "Archivar" : "Ya no hace falta"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── La rutina de la semana ────────────────────────────────────────── */

function SelectorDeDias({
  valor,
  onCambiar,
  disabled,
}: {
  valor: number[];
  onCambiar: (dias: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {DIAS.map((d) => {
        const activo = valor.includes(d.valor);
        return (
          <button
            key={d.valor}
            type="button"
            disabled={disabled}
            aria-pressed={activo}
            onClick={() =>
              onCambiar(activo ? valor.filter((v) => v !== d.valor) : [...valor, d.valor])
            }
            className={cn(
              "size-9 rounded-full border-2 text-xs font-bold transition-colors disabled:opacity-60",
              activo
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {d.corto}
          </button>
        );
      })}
    </div>
  );
}

function FormularioDeRutina({
  inicial,
  ocupado,
  textoBoton,
  onGuardar,
}: {
  inicial?: Tarea;
  ocupado?: boolean;
  textoBoton: string;
  onGuardar: (datos: DatosDeTarea) => Promise<unknown>;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [instrucciones, setInstrucciones] = useState(inicial?.instrucciones ?? "");
  const [dias, setDias] = useState<number[]>(inicial?.diasDeLaSemana ?? [1, 2, 3, 4, 5]);
  const [ronda, setRonda] = useState<RondaDelDia | undefined>(inicial?.ronda);

  return (
    <div className="space-y-3">
      <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Limpiar baños" aria-label="Tarea" />
      <div className="space-y-1.5">
        <Label>Qué días</Label>
        <SelectorDeDias valor={dias} onCambiar={setDias} />
      </div>
      <div className="space-y-1.5">
        <Label>Cuándo</Label>
        <SelectorDeRonda valor={ronda} onCambiar={setRonda} />
      </div>
      <Textarea
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
        placeholder="Cómo se hace (opcional)"
        rows={2}
        aria-label="Instrucciones"
      />
      <Button
        className="w-full"
        disabled={ocupado || !titulo.trim() || dias.length === 0}
        onClick={async () => {
          const r = await onGuardar({ titulo, instrucciones, diasDeLaSemana: dias, ronda });
          if (r && !inicial) {
            setTitulo("");
            setInstrucciones("");
          }
        }}
      >
        {textoBoton}
      </Button>
    </div>
  );
}

function Rutina() {
  const staff = useSesion((s) => s.staff);
  const tareas = useConsulta((repo) => repo.tareas.listar(), []);
  const { ocupado, hacer } = useHacer();
  const [editando, setEditando] = useState<Tarea | null>(null);

  if (!tareas.datos) return <Skeleton className="h-80" />;

  const rutina = tareas.datos
    .filter((t) => t.tipo === "rutina" && t.activa)
    .sort((a, b) => a.orden - b.orden);
  const faltan = rutinaQueFalta(rutina);

  const cargarSugerida = () =>
    hacer(
      (repo) => cargarRutinaSugerida(repo, staff ?? "Administración"),
      "Rutina cargada. Ajusta los días como te acomode.",
    );

  if (rutina.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay rutina de aseo"
        descripcion={`Te proponemos una con ${faltan.length} tareas, armada con lo que más se repite en el grupo de reportes: la cerámica todos los días, el patio los martes, el cubresillón los viernes… Después la ajustas.`}
        icono={Sparkles}
      >
        <Button size="lg" disabled={ocupado} onClick={cargarSugerida}>
          <ListChecks /> Cargar la rutina sugerida
        </Button>
      </EstadoVacio>
    );
  }

  const porDia = DIAS.map((d) => ({
    ...d,
    cuantas: rutina.filter((t) => t.diasDeLaSemana?.includes(d.valor)).length,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Card>
          <CardContent className="grid grid-cols-7 gap-1 pt-5 text-center">
            {porDia.map((d) => (
              <div key={d.valor} className="rounded-xl bg-secondary/50 py-2">
                <p className="text-muted-foreground text-xs font-bold">{d.corto}</p>
                <p className="font-display text-xl font-bold tabular-nums">{d.cuantas}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-2">
            <ul className="divide-y divide-border/60">
              {rutina.map((t) => (
                <li key={t.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-pretty">{t.titulo}</p>
                      {t.ronda && (
                        <p className="text-muted-foreground text-xs">
                          En la {RONDAS.find((r) => r.clave === t.ronda)?.nombre.toLowerCase()}
                        </p>
                      )}
                      {t.instrucciones && (
                        <p className="text-muted-foreground text-sm text-pretty">{t.instrucciones}</p>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setEditando(t)} aria-label={`Editar ${t.titulo}`}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={ocupado}
                        onClick={() => hacer((repo) => archivarTarea(repo, t.id), "Sacada de la rutina.")}
                        aria-label={`Sacar ${t.titulo} de la rutina`}
                      >
                        <Archive />
                      </Button>
                    </div>
                  </div>
                  <SelectorDeDias
                    valor={t.diasDeLaSemana ?? []}
                    disabled={ocupado}
                    onCambiar={(dias) =>
                      hacer((repo) =>
                        editarTarea(repo, t.id, {
                          titulo: t.titulo,
                          instrucciones: t.instrucciones,
                          ronda: t.ronda,
                          diasDeLaSemana: dias,
                        }),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Agregar a la rutina</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioDeRutina
              ocupado={ocupado}
              textoBoton="Agregar"
              onGuardar={(datos) =>
                hacer((repo) => crearTarea(repo, "rutina", datos, staff ?? "Administración"), "Agregada.")
              }
            />
          </CardContent>
        </Card>

        {faltan.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <p className="text-sm text-pretty">
                De la rutina sugerida faltan {faltan.length}:{" "}
                <span className="text-muted-foreground">
                  {faltan.map((f) => f.titulo).join(", ")}.
                </span>
              </p>
              <Button variant="outline" className="w-full" disabled={ocupado} onClick={cargarSugerida}>
                Agregar las que faltan
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <SheetContent lado="right" className="overflow-y-auto px-4 pb-6">
          <SheetHeader className="px-0">
            <SheetTitle>Editar tarea</SheetTitle>
          </SheetHeader>
          {editando && (
            <FormularioDeRutina
              key={editando.id}
              inicial={editando}
              ocupado={ocupado}
              textoBoton="Guardar"
              onGuardar={async (datos) => {
                const r = await hacer((repo) => editarTarea(repo, editando.id, datos), "Guardado.");
                if (r) setEditando(null);
                return r;
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
