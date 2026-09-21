"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  AlertCircle,
  Camera,
  CheckCheck,
  Eye,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { canalMensajeria } from "@/lib/integraciones/mensajeria";
import { armarMensajesDeReporte } from "@/lib/integraciones/mensajeria/armado";
import { reintentarMensaje } from "@/lib/integraciones/mensajeria/servicio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { repositorio } from "@/lib/repo";
import { cargarDiaDeStaff, hoyDelStaff } from "@/lib/servicios/asistencia";
import { crearYEnviarReporte } from "@/lib/servicios/reportes";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import { formatearHora } from "@/lib/utils/fecha";
import { comprimirImagen } from "@/lib/utils/imagen";
import type { EstadoMensaje, MensajeSaliente } from "@/lib/types";

const ATAJOS = [
  "Día tranquilo, comió todo.",
  "Jugó toda la mañana, llegó cansadísimo.",
  "Durmió siesta después de almuerzo.",
  "Se hizo amigo de los nuevos.",
];

export default function Reportes() {
  const hoy = hoyDelStaff();
  const staff = useSesion((s) => s.staff) ?? "Equipo";
  const dia = useConsulta((repo) => cargarDiaDeStaff(repo, hoy), [hoy]);
  const mensajes = useConsulta((repo) => repo.mensajes.enRango(hoy, hoy), [hoy]);
  const { ocupado, ejecutar } = useAccion();

  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<string | undefined>();
  const [verPrevia, setVerPrevia] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  // Los candidatos son los perros que estuvieron hoy: no tiene sentido mandar
  // el reporte del día de un perro que no vino.
  const candidatos = useMemo(() => {
    if (!dia.datos) return [];
    const ids = new Set(
      dia.datos.estadias
        .filter((e) => e.estado === "presente" || e.estado === "finalizada")
        .map((e) => e.perroId)
        .concat(
          dia.datos.reservas
            .filter((r) => r.estado === "en_curso" || r.estado === "finalizada")
            .map((r) => r.perroId),
        ),
    );
    return dia.datos.perros.filter((p) => ids.has(p.id));
  }, [dia.datos]);

  // La previsualización usa la MISMA función que el envío, así que lo que se
  // ve acá es exactamente lo que le llega al dueño.
  const previa = useMemo(() => {
    if (!dia.datos || seleccionados.length === 0 || !nota.trim()) return null;
    return armarMensajesDeReporte({
      reporte: {
        id: "previa",
        perroIds: seleccionados,
        fecha: hoy,
        nota: nota.trim(),
        fotoUrl: foto,
        autorStaff: staff,
        creadoEn: new Date().toISOString(),
      },
      perros: dia.datos.perros,
      clientes: dia.datos.clientes,
      ahora: new Date().toISOString(),
    });
  }, [dia.datos, seleccionados, nota, foto, hoy, staff]);

  function alternar(id: string) {
    setSeleccionados((previos) =>
      previos.includes(id)
        ? previos.filter((p) => p !== id)
        : [...previos, id],
    );
  }

  async function elegirFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      setFoto(await comprimirImagen(archivo));
    } catch {
      toast.error("No pudimos procesar esa foto.");
    } finally {
      evento.target.value = "";
    }
  }

  async function enviar() {
    if (seleccionados.length === 0 || !nota.trim()) return;

    const resultado = await ejecutar((repo) =>
      crearYEnviarReporte(repo, canalMensajeria(), {
        perroIds: seleccionados,
        nota,
        fotoUrl: foto,
        autorStaff: staff,
      }),
    );

    const { enviados, fallidos, omitidos } = resultado.despacho;

    if (enviados > 0) {
      toast.success(
        `Reporte enviado a ${enviados} ${enviados === 1 ? "dueño" : "dueños"}`,
        {
          description: canalMensajeria().simulado
            ? "Canal simulado: quedó en la bandeja, no salió a WhatsApp."
            : "Salió por WhatsApp.",
        },
      );
    }

    if (fallidos > 0 || omitidos.length > 0) {
      toast.warning(
        `${fallidos + omitidos.length} no salieron`,
        {
          description:
            omitidos[0]?.motivo ?? "Revisa la bandeja para reintentar.",
        },
      );
    }

    setSeleccionados([]);
    setNota("");
    setFoto(undefined);
  }

  const puedeEnviar =
    seleccionados.length > 0 && nota.trim().length > 0 && !ocupado;

  if (dia.cargando && !dia.datos) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="nuevo">
      <TabsList>
        <TabsTrigger value="nuevo">Nuevo reporte</TabsTrigger>
        <TabsTrigger value="enviados">
          Enviados hoy
          {(mensajes.datos?.length ?? 0) > 0 && (
            <span className="bg-secondary rounded-full px-1.5 text-xs tabular-nums">
              {mensajes.datos!.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="nuevo" className="mt-3 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>¿De quién es el reporte?</CardTitle>
            <p className="text-muted-foreground text-sm">
              Cada dueño recibe un solo mensaje con sus perros nombrados.
            </p>
          </CardHeader>
          <CardContent>
            {candidatos.length === 0 ? (
              <EstadoVacio
                titulo="Todavía no llega nadie"
                descripcion="Marca las llegadas en Hoy y después vuelve acá."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {candidatos.map((perro) => {
                  const activo = seleccionados.includes(perro.id);
                  return (
                    <button
                      key={perro.id}
                      type="button"
                      onClick={() => alternar(perro.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border-2 py-1.5 pr-4 pl-1.5 transition-all active:scale-[0.98]",
                        activo
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <PerroAvatar
                        id={perro.id}
                        nombre={perro.nombre}
                        fotoUrl={perro.fotoUrl}
                        tamano="sm"
                      />
                      <span className="text-sm font-semibold">
                        {perro.nombre}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>La foto del día</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={archivoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={elegirFoto}
            />
            {foto ? (
              <div className="relative">
                <Image
                  src={foto}
                  alt="Foto del reporte"
                  width={640}
                  height={480}
                  unoptimized
                  className="h-48 w-full rounded-xl object-cover"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => setFoto(undefined)}
                  aria-label="Quitar foto"
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="xl"
                className="w-full"
                onClick={() => archivoRef.current?.click()}
              >
                <Camera />
                Sacar o elegir foto
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>¿Cómo estuvo el día?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Cuéntale al dueño cómo le fue hoy…"
              rows={4}
            />
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((atajo) => (
                <button
                  key={atajo}
                  type="button"
                  onClick={() =>
                    setNota((actual) =>
                      actual.trim() ? `${actual.trim()} ${atajo}` : atajo,
                    )
                  }
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/70 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {atajo}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {previa && previa.mensajes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>
                  Se manda a {previa.mensajes.length}{" "}
                  {previa.mensajes.length === 1 ? "dueño" : "dueños"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVerPrevia((v) => !v)}
                >
                  <Eye />
                  {verPrevia ? "Ocultar" : "Ver mensaje"}
                </Button>
              </div>
            </CardHeader>
            {verPrevia && (
              <CardContent className="space-y-2">
                <div className="bg-jardin-suave rounded-2xl rounded-tl-sm p-3 text-sm whitespace-pre-line">
                  {previa.mensajes[0].vistaPrevia}
                </div>
                <p className="text-muted-foreground text-xs">
                  Plantilla <code>{previa.mensajes[0].plantilla}</code> ·{" "}
                  {previa.mensajes[0].destino}
                </p>
              </CardContent>
            )}
            {previa.omitidos.length > 0 && (
              <CardContent className="pt-0">
                {previa.omitidos.map((omitido) => (
                  <p
                    key={omitido.clienteId}
                    className="text-warning flex items-start gap-1.5 text-sm"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {omitido.nombre}: {omitido.motivo}
                    </span>
                  </p>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        <Button
          size="xl"
          className="w-full"
          disabled={!puedeEnviar}
          onClick={enviar}
        >
          <Send />
          {ocupado ? "Enviando…" : "Enviar por WhatsApp"}
        </Button>
      </TabsContent>

      <TabsContent value="enviados" className="mt-3 space-y-2">
        <BandejaDeSalida
          mensajes={mensajes.datos ?? []}
          cargando={mensajes.cargando}
        />
      </TabsContent>
    </Tabs>
  );
}

const ETIQUETA_ESTADO: Record<
  EstadoMensaje,
  { texto: string; variante: React.ComponentProps<typeof Badge>["variant"] }
> = {
  pendiente: { texto: "En cola", variante: "outline" },
  enviando: { texto: "Enviando", variante: "outline" },
  enviado: { texto: "Enviado", variante: "default" },
  entregado: { texto: "Entregado", variante: "success" },
  leido: { texto: "Leído", variante: "success" },
  fallido: { texto: "Falló", variante: "destructive" },
};

function BandejaDeSalida({
  mensajes,
  cargando,
}: {
  mensajes: MensajeSaliente[];
  cargando: boolean;
}) {
  const { ocupado, ejecutar } = useAccion();

  if (cargando) return <Skeleton className="h-40" />;

  if (mensajes.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no mandas nada hoy"
        descripcion="Los reportes que envíes van a aparecer acá con su estado de entrega."
        icono={CheckCheck}
      />
    );
  }

  async function reintentar(id: string) {
    const mensaje = await ejecutar(() =>
      reintentarMensaje(repositorio(), canalMensajeria(), id),
    );
    if (mensaje.estado === "fallido") toast.error(mensaje.error ?? "Falló otra vez.");
    else toast.success("Reenviado");
  }

  return (
    <>
      {[...mensajes]
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
        .map((mensaje) => {
          const etiqueta = ETIQUETA_ESTADO[mensaje.estado];
          return (
            <div
              key={mensaje.id}
              className="bg-card space-y-2 rounded-2xl border border-border/70 p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm tabular-nums">
                  {formatearHora(mensaje.creadoEn)} · {mensaje.destino}
                </span>
                <Badge variant={etiqueta.variante}>{etiqueta.texto}</Badge>
              </div>

              <p className="line-clamp-3 text-sm whitespace-pre-line">
                {mensaje.vistaPrevia}
              </p>

              {mensaje.estado === "fallido" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-destructive text-xs">
                    {mensaje.error}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => reintentar(mensaje.id)}
                  >
                    <RefreshCw />
                    Reintentar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}
