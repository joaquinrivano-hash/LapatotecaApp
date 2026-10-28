"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  MessageSquareText,
  Pill,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import {
  FilaTarea,
  HojaDeOpciones,
  HojaDeResumen,
  ListaDeAnotaciones,
  QuienNoComio,
  etiquetaDeArrastre,
} from "@/components/staff/tareas";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  CLAVE_EXTRA,
  CLAVE_NOVEDAD,
  claveDeMedicamento,
  estaResuelta,
  rondaDeLaHora,
} from "@/lib/rules/tareas";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import {
  anotarEnElDia,
  anotarQuienNoComio,
  borrarAnotacion,
  cargarTareasDelDia,
  marcarTarea,
  resumenDelDia,
  type Firma,
} from "@/lib/servicios/tareas";
import type { RepositorioPatoteca } from "@/lib/repo/tipos";
import { useSesion } from "@/lib/store/sesion";
import type { EstadoTarea, RegistroDeTarea, RondaDelDia } from "@/lib/types";

interface Opciones {
  clave: string;
  titulo: string;
  estado: EstadoTarea;
  nota?: string;
}

export default function TareasDelDia() {
  const hoy = hoyDelStaff();
  const staff = useSesion((s) => s.staff) ?? "Equipo";
  const usuarioId = useSesion((s) => s.usuarioId);
  const firma: Firma = { autorStaff: staff, autorId: usuarioId };

  const dia = useConsulta((repo) => cargarTareasDelDia(repo, hoy), [hoy]);
  const { ocupado, ejecutar } = useAccion();

  const [ronda, setRonda] = useState<RondaDelDia>(() =>
    rondaDeLaHora(new Date().toISOString()),
  );
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [novedad, setNovedad] = useState("");

  /** Toda acción pasa por acá: el motivo del error se muestra, no se traga. */
  async function hacer<T>(
    accion: (repo: RepositorioPatoteca) => Promise<T>,
    exito?: string,
  ) {
    try {
      const r = await ejecutar(accion);
      if (exito) toast.success(exito);
      return r;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardarlo.");
      return undefined;
    }
  }

  function marcar(clave: string, estado: EstadoTarea, nota?: string, perroIds?: string[]) {
    return hacer((repo) =>
      marcarTarea(repo, { fecha: hoy, clave, estado, nota, perroIds }, firma),
    );
  }

  function alternar(clave: string, estado: EstadoTarea, registro?: RegistroDeTarea) {
    // El toque rápido es "hecha". Si ya estaba resuelta, se deshace.
    return estaResuelta(estado)
      ? marcar(clave, "pendiente")
      : marcar(clave, "hecha", registro?.nota, registro?.perroIds);
  }

  async function anotar(clave: string, nota: string, limpiar?: () => void) {
    const r = await hacer((repo) => anotarEnElDia(repo, { fecha: hoy, clave, nota }, firma));
    if (r) limpiar?.();
  }

  if (dia.error) {
    return (
      <p className="text-destructive py-10 text-center text-sm">
        No pudimos cargar las tareas: {dia.error}
      </p>
    );
  }
  if (!dia.datos) return <Skeleton className="h-96" />;

  const datos = dia.datos;
  const encargos = datos.tareas.filter((t) => t.tarea.tipo === "encargo");
  const aseo = datos.tareas.filter((t) => t.tarea.tipo === "rutina");
  const { resueltas, total } = datos.avance;
  const porcentaje = total ? Math.round((resueltas / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Cómo va el día */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-bold">Tareas de hoy</h1>
              <p className="text-muted-foreground text-sm">
                {total === 0
                  ? "Nada que marcar todavía."
                  : resueltas === total
                    ? "Todo listo por ahora. ¡Bien!"
                    : `Van ${resueltas} de ${total}.`}
              </p>
            </div>
            <span className="font-display text-primary text-3xl font-bold tabular-nums">
              {porcentaje}%
            </span>
          </div>
          <div
            className="bg-secondary h-3 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={porcentaje}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance del día"
          >
            <div
              className="bg-success h-full rounded-full transition-all"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* La rutina de cada comida */}
      <Tabs value={ronda} onValueChange={(v) => setRonda(v as RondaDelDia)}>
        <TabsList className="grid w-full grid-cols-3">
          {datos.rondas.map((r) => {
            const listos = r.pasos.filter((p) => estaResuelta(p.estado)).length;
            return (
              <TabsTrigger key={r.ronda} value={r.ronda} className="flex-col gap-0 py-1.5">
                <span>{r.nombre}</span>
                <span className="text-[11px] font-normal tabular-nums opacity-70">
                  {listos}/{r.pasos.length}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {datos.rondas.map((r) => (
          <TabsContent key={r.ronda} value={r.ronda} className="mt-3 space-y-2">
            {r.pasos.map((paso) => (
              <FilaTarea
                key={paso.clave}
                titulo={paso.titulo}
                estado={paso.estado}
                registro={paso.registro}
                ocupado={ocupado}
                onAlternar={() => alternar(paso.clave, paso.estado, paso.registro)}
                onOpciones={() =>
                  setOpciones({
                    clave: paso.clave,
                    titulo: paso.titulo,
                    estado: paso.estado,
                    nota: paso.registro?.nota,
                  })
                }
              >
                {paso.paso === "comida" && paso.estado === "hecha" && paso.registro && (
                  <QuienNoComio
                    perros={datos.perros}
                    seleccionados={paso.registro.perroIds ?? []}
                    ocupado={ocupado}
                    onCambiar={(ids) =>
                      hacer((repo) => anotarQuienNoComio(repo, paso.registro!.id, ids))
                    }
                  />
                )}
              </FilaTarea>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Remedios */}
      {datos.remedios.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Pill className="size-5" /> Medicamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {datos.remedios.map(({ perro, medicamentos, dados }) => (
              <div key={perro.id} className="flex items-start gap-3">
                <PerroAvatar id={perro.id} nombre={perro.nombre} fotoUrl={perro.fotoUrl} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-semibold">{perro.nombre}</p>
                  {medicamentos.map((m, i) => {
                    const veces = dados.filter((d) => d.nota === m.nombre);
                    return (
                      <div key={`${m.nombre}-${i}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 text-sm">
                            <span className="font-semibold">{m.nombre}</span>
                            <span className="text-muted-foreground">
                              {[m.dosis, m.frecuencia].filter(Boolean).length
                                ? ` · ${[m.dosis, m.frecuencia].filter(Boolean).join(" · ")}`
                                : ""}
                            </span>
                          </p>
                          <Button
                            size="sm"
                            variant={veces.length ? "outline" : "default"}
                            disabled={ocupado}
                            onClick={() =>
                              anotar(claveDeMedicamento(perro.id), m.nombre)
                            }
                          >
                            Se le dio
                          </Button>
                        </div>
                        {veces.length > 0 && (
                          <ListaDeAnotaciones
                            registros={veces.map((v) => ({
                              ...v,
                              nota: `Se le dio ${m.nombre}`,
                            }))}
                            usuarioId={usuarioId}
                            autor={staff}
                            ocupado={ocupado}
                            onBorrar={(id) => hacer((repo) => borrarAnotacion(repo, id))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Encargos */}
      {encargos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display flex items-center gap-2 px-1 text-lg font-bold">
            <ClipboardList className="size-5" /> Encargos
          </h2>
          {encargos.map(({ tarea, estado, registro, arrastradaDesde }) => (
            <FilaTarea
              key={tarea.id}
              titulo={tarea.titulo}
              estado={estado}
              registro={registro}
              instrucciones={tarea.instrucciones}
              etiqueta={etiquetaDeArrastre(arrastradaDesde)}
              ocupado={ocupado}
              onAlternar={() => alternar(tarea.id, estado, registro)}
              onOpciones={() =>
                setOpciones({ clave: tarea.id, titulo: tarea.titulo, estado, nota: registro?.nota })
              }
            />
          ))}
        </section>
      )}

      {/* Aseo */}
      <section className="space-y-2">
        <h2 className="font-display flex items-center gap-2 px-1 text-lg font-bold">
          <Sparkles className="size-5" /> Aseo de hoy
        </h2>
        {aseo.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-2xl border border-dashed border-border p-4 text-center text-sm">
            {datos.hayRutina
              ? "Hoy no toca nada de la rutina de aseo."
              : "Administración todavía no arma la rutina de aseo. Mientras tanto, anota abajo lo que hagas."}
          </p>
        ) : (
          aseo.map(({ tarea, estado, registro }) => (
            <FilaTarea
              key={tarea.id}
              titulo={tarea.titulo}
              estado={estado}
              registro={registro}
              instrucciones={tarea.instrucciones}
              ocupado={ocupado}
              onAlternar={() => alternar(tarea.id, estado, registro)}
              onOpciones={() =>
                setOpciones({ clave: tarea.id, titulo: tarea.titulo, estado, nota: registro?.nota })
              }
            />
          ))
        )}
      </section>

      {/* Lo que no estaba en la lista */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5" /> ¿Hiciste algo más?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (extra.trim()) anotar(CLAVE_EXTRA, extra, () => setExtra(""));
            }}
          >
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Se cortó maleza, se fue a buscar a Lola…"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={ocupado || !extra.trim()}>
              Anotar
            </Button>
          </form>
          <ListaDeAnotaciones
            registros={datos.extras}
            usuarioId={usuarioId}
            autor={staff}
            ocupado={ocupado}
            onBorrar={(id) => hacer((repo) => borrarAnotacion(repo, id))}
          />
        </CardContent>
      </Card>

      {/* Para el turno que viene */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-5" /> Novedades
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Lo que tiene que saber el que viene: quién llegó sin arnés, qué
            cosas se quedaron, qué te dijo un dueño.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={novedad}
            onChange={(e) => setNovedad(e.target.value)}
            placeholder="Owen llegó sin arnés…"
            rows={2}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={ocupado || !novedad.trim()}
            onClick={() => anotar(CLAVE_NOVEDAD, novedad, () => setNovedad(""))}
          >
            Anotar novedad
          </Button>
          <ListaDeAnotaciones
            registros={datos.novedades}
            usuarioId={usuarioId}
            autor={staff}
            ocupado={ocupado}
            onBorrar={(id) => hacer((repo) => borrarAnotacion(repo, id))}
          />
        </CardContent>
      </Card>

      <Button
        size="xl"
        className="w-full"
        onClick={() => setResumen(resumenDelDia(datos, staff))}
      >
        <Send /> Armar reporte para el grupo
      </Button>

      {opciones && (
        <HojaDeOpciones
          key={opciones.clave}
          abierta
          titulo={opciones.titulo}
          estado={opciones.estado}
          notaInicial={opciones.nota}
          ocupado={ocupado}
          onCerrar={() => setOpciones(null)}
          onElegir={async (estado, nota) => {
            const registro = datos.registros.find((r) => r.clave === opciones.clave);
            const r = await marcar(opciones.clave, estado, nota, registro?.perroIds);
            if (r !== undefined) setOpciones(null);
          }}
        />
      )}

      <HojaDeResumen
        abierta={resumen !== null}
        texto={resumen ?? ""}
        onCerrar={() => setResumen(null)}
      />
    </div>
  );
}
