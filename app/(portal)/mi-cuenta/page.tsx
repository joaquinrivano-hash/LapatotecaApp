"use client";

import Image from "next/image";
import {
  CalendarDays,
  Camera,
  ChevronRight,
  PawPrint,
  Ticket,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { MiPerro } from "@/components/portal/mi-perro";
import {
  CuentaParaDevolver,
  cuentaInicial,
  faltanDatosDeCuenta,
} from "@/components/portal/cuenta-para-devolver";
import { ContactoCasa } from "@/components/shared/contacto-casa";
import { YaPuedeReservar } from "@/components/shared/ya-puede-reservar";
import { ComoPagar } from "@/components/shared/como-pagar";
import { excedePeso } from "@/lib/rules/admision";
import { PrecioCLP } from "@/components/shared/precio";
import { BarraParticipacion } from "@/components/admin/barra-participacion";
import { useState } from "react";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { useCliente } from "@/lib/hooks/use-cliente";
import { NEGOCIO } from "@/lib/config/negocio";
import type { DatosBancarios, Pago } from "@/lib/types";
import { etiquetaConcepto } from "@/lib/rules/cobro-mensual";
import { calcularDevolucionJardin } from "@/lib/rules/precio-jardin";
import { nombreDePlan, planVigente, saldoPlan } from "@/lib/rules/planes";
import {
  cancelarDiaDeJardin,
  loPagadoPorElDia,
  ReservaRechazada,
} from "@/lib/servicios/reservas";
import { alertasDePerro } from "@/lib/servicios/clientes";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import {
  formatearDiaMes,
  formatearFecha,
  formatearHora,
} from "@/lib/utils/fecha";

export default function MiCuenta() {
  const hoy = hoyDelStaff();
  const clienteId = useSesion((s) => s.clienteId);
  const base = useCliente();

  const extra = useConsulta(
    async (repo) => {
      if (!clienteId) return null;
      const perros = await repo.perros.porCliente(clienteId);
      const ids = new Set(perros.map((p) => p.id));

      const [planes, reservas, estadias, reportes] = await Promise.all([
        repo.planes.porCliente(clienteId),
        repo.reservasHotel.porCliente(clienteId),
        repo.estadiasJardin.porCliente(clienteId),
        repo.reportes.listar(),
      ]);
      const pagos = await repo.pagos.porCliente(clienteId);

      return {
        planes,
        reservas,
        estadias,
        // Un cobro reembolsado en cero no se muestra: es la constancia de
        // algo que se anuló, y al dueño le diría "te cobramos $0".
        pagos: pagos
          .filter((p) => !(p.estado === "reembolsado" && p.monto === 0))
          .sort((a, b) => b.emitidoEn.localeCompare(a.emitidoEn)),
        reportes: reportes
          .filter((r) => r.perroIds.some((id) => ids.has(id)))
          .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
          .slice(0, 20),
      };
    },
    [clienteId ?? ""],
  );

  const perros = base.datos?.perros ?? [];
  const [fichaDe, setFichaDe] = useState<string | null>(null);
  const ficha = perros.find((p) => p.id === fichaDe);
  const datos = extra.datos;

  if (base.cargando && perros.length === 0) return <Skeleton className="h-96" />;

  const vigentes = (datos?.planes ?? []).filter((p) => planVigente(p, hoy));
  const proximas = [
    ...(datos?.reservas ?? [])
      .filter(
        (r) =>
          r.inicioProgramado.slice(0, 10) >= hoy &&
          r.estado !== "cancelada" &&
          r.estado !== "finalizada",
      )
      .map((r) => ({
        id: r.id,
        linea: "hotel" as const,
        perroId: r.perroId,
        fecha: r.inicioProgramado.slice(0, 10),
        detalle: `Hasta el ${formatearFecha(r.finProgramado)}`,
        total: r.cotizacion.total,
        inicioProgramado: r.inicioProgramado,
        esDiaDePrueba: false,
        porConfirmar: r.estado === "pendiente",
        sePuedeCancelar: false,
      })),
    // Lo que viene es lo que todavía no termina. Un día finalizado o al que
    // el perro no llegó ya pasó, aunque sea de hoy: mostrarlo acá lo hacía
    // parecer una reserva y ofrecía cancelarlo.
    ...(datos?.estadias ?? [])
      .filter(
        (e) =>
          e.fecha >= hoy &&
          e.estado !== "cancelada" &&
          e.estado !== "finalizada" &&
          e.estado !== "no_show",
      )
      .map((e) => ({
        id: e.id,
        linea: "jardin" as const,
        perroId: e.perroId,
        fecha: e.fecha,
        detalle: `${formatearHora(e.inicioProgramado)} a ${formatearHora(e.finProgramado)}`,
        total: e.cotizacion?.total ?? 0,
        inicioProgramado: e.inicioProgramado,
        esDiaDePrueba: e.origen === "dia_de_prueba",
        porConfirmar: false,
        // Si el perro ya llegó, no se cancela: es un retiro, y lo registra
        // el equipo.
        sePuedeCancelar: e.estado === "esperada",
      })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porPagar = (datos?.pagos ?? []).filter(
    (p) => p.estado === "pendiente" || p.estado === "vencido",
  );

  const nombrePerro = (id: string) =>
    perros.find((p) => p.id === id)?.nombre ?? "Tu perro";
  const fotoPerro = (id: string) => perros.find((p) => p.id === id)?.fotoUrl;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">
          Hola{base.datos?.cliente ? `, ${base.datos.cliente.nombre}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Tus perros, tus planes y cómo les fue.
        </p>
      </div>

      {/* Arriba de los perros a propósito: es una noticia, y una noticia
          debajo de una lista es una noticia que no se lee. */}
      <YaPuedeReservar clienteId={clienteId} />

      <section className="space-y-2">
        {perros.map((perro) => {
          const prueba = (datos?.estadias ?? []).find(
            (e) =>
              e.perroId === perro.id &&
              e.origen === "dia_de_prueba" &&
              e.fecha === perro.diaDePrueba.fecha &&
              e.estado !== "cancelada",
          );
          // El día de prueba agendado es una buena noticia para el dueño, no
          // un problema: va aparte de las alertas, sin triángulo ni amarillo.
          const todas = alertasDePerro(perro, hoy, prueba?.inicioProgramado);
          const agendado =
            perro.diaDePrueba.estado === "agendado"
              ? todas.find((a) => a.tipo === "sin_dia_de_prueba")
              : undefined;
          const alertas = todas.filter((a) => a !== agendado);
          const bloquea = alertas.some((a) => a.bloquea);
          return (
            <Card key={perro.id}>
              <CardContent className="p-0">
                <button
                  type="button"
                  aria-label={`Ver la ficha de ${perro.nombre}`}
                  onClick={() => setFichaDe(perro.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                <PerroAvatar
                  id={perro.id}
                  nombre={perro.nombre}
                  fotoUrl={perro.fotoUrl}
                  tamano="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-lg font-bold">
                    {perro.nombre}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {perro.raza} · {perro.pesoKg} kg
                  </p>
                  {agendado && (
                    <p className="text-success mt-1 text-sm font-semibold text-pretty">
                      {agendado.mensaje} ¡Te esperamos!
                    </p>
                  )}
                  {alertas.length > 0 && (
                    <p
                      className={cn(
                        "mt-1 text-sm",
                        bloquea ? "text-destructive" : "text-warning",
                      )}
                    >
                      {alertas[0].mensaje}
                    </p>
                  )}
                </div>
                {alertas.length > 0 && (
                  <Badge variant={bloquea ? "destructive" : "warning"}>
                    <TriangleAlert />
                  </Badge>
                )}
                <ChevronRight className="text-muted-foreground size-5 shrink-0" />
                </button>
                {perro.diaDePrueba.estado === "rechazado" && (
                  /* Un rechazo es una conversación, no un aviso. El motivo
                     se escribió para la ficha —"se puso brusco con los
                     chicos"— y leerlo así, sin nadie al lado, es duro y no
                     deja hacer nada. Mejor abrir la puerta de hablarlo. */
                  <div className="space-y-2 border-t border-border/60 p-3 text-sm">
                    {/* El hecho ya lo dice la línea de arriba, con su
                        triángulo. Repetirlo acá en otro tono es decirlo dos
                        veces; lo que falta es qué hacer. */}
                    <p className="text-pretty">
                      Conversémoslo y vemos qué podemos hacer por{" "}
                      {perro.nombre}.
                    </p>
                    <ContactoCasa
                      mensaje={`Hola, quiero conversar sobre el día de prueba de ${perro.nombre}.`}
                    />
                  </div>
                )}
                {excedePeso(perro) && (
                  <div className="space-y-2 border-t border-border/60 p-3 text-sm">
                    <p className="text-pretty">
                      {perro.nombre} pasa de los{" "}
                      {NEGOCIO.admision.pesoMaximoKg} kg que recibimos, así que
                      antes de agendar su día de prueba lo conversamos.
                    </p>
                    <ContactoCasa
                      mensaje={`Hola, creé la cuenta de ${perro.nombre} (${perro.pesoKg} kg) y quiero conversar su día de prueba.`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        <p className="text-muted-foreground px-1 text-xs">
          Toca a tu perrito para ver o corregir su ficha.
        </p>
      </section>

      <Sheet open={ficha !== undefined} onOpenChange={() => setFichaDe(null)}>
        <SheetContent>
          {ficha && (
            <MiPerro
              perro={ficha}
              hoy={hoy}
              onGuardado={() => base.recargar()}
            />
          )}
        </SheetContent>
      </Sheet>

      {vigentes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Tus planes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vigentes.map((plan) => (
              <div key={plan.id} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {nombrePerro(plan.perroId)}
                    <Badge variant="jardin" className="ml-2">
                      <Ticket />
                      {nombreDePlan(plan)}
                    </Badge>
                  </span>
                  <span className="text-sm tabular-nums">
                    te quedan <strong>{saldoPlan(plan)}</strong> de{" "}
                    {plan.diasTotales}
                  </span>
                </div>
                <BarraParticipacion
                  etiqueta=""
                  valor=""
                  fraccion={plan.diasUsados / plan.diasTotales}
                  tono="jardin"
                  className="[&>div:first-child]:hidden"
                />
                <p className="text-muted-foreground text-xs">
                  Vence el {formatearFecha(`${plan.venceEn}T12:00:00Z`)}. Los
                  días no usados no pasan al mes siguiente.
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="proximas">
        <TabsList>
          <TabsTrigger value="proximas">
            Lo que viene
            {proximas.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-1.5 text-xs tabular-nums">
                {proximas.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cobros">
            Cobros
            {porPagar.length > 0 && (
              <span className="bg-primary/15 text-primary rounded-full px-1.5 text-xs tabular-nums">
                {porPagar.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="proximas" className="mt-3 space-y-2">
          {extra.cargando && !datos ? (
            <Skeleton className="h-32" />
          ) : proximas.length === 0 ? (
            <EstadoVacio
              titulo="No tienes nada agendado"
              descripcion="Cuando reserves un día o una estadía, va a aparecer acá."
              icono={CalendarDays}
            />
          ) : (
            proximas.map((item) => (
              <Card key={`${item.linea}-${item.id}`}>
                <CardContent className="flex items-center gap-3 p-3">
                  <PerroAvatar
                    id={item.perroId}
                    nombre={nombrePerro(item.perroId)}
                    fotoUrl={fotoPerro(item.perroId)}
                    tamano="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold capitalize">
                      {formatearDiaMes(`${item.fecha}T12:00:00Z`)}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {nombrePerro(item.perroId)} · {item.detalle}
                    </p>
                    {/* Tomada pero sin abono: el cupo es suyo, falta pagar. */}
                    {item.porConfirmar && (
                      <p className="text-warning text-xs font-semibold">
                        Por confirmar: falta el abono
                      </p>
                    )}
                  </div>
                  <Badge variant={item.linea === "hotel" ? "hotel" : "jardin"}>
                    {item.linea === "hotel" ? "Hotel" : "Jardín"}
                  </Badge>
                  {item.total > 0 && <PrecioCLP monto={item.total} />}
                </CardContent>

                {/* El día de prueba se cancela desde su propia pantalla, que
                    además deja reprogramar. */}
                {item.linea === "jardin" &&
                  !item.esDiaDePrueba &&
                  item.sePuedeCancelar && (
                  <CancelarDia
                    estadiaId={item.id}
                    inicioProgramado={item.inicioProgramado}
                    perro={nombrePerro(item.perroId)}
                    datosGuardados={base.datos?.cliente?.datosBancarios}
                  />
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="cobros" className="mt-3 space-y-2">
          {extra.cargando && !datos ? (
            <Skeleton className="h-40" />
          ) : (datos?.pagos ?? []).length === 0 ? (
            <EstadoVacio
              titulo="No tienes cobros"
              descripcion="Acá vas a ver lo que debes y lo que ya pagaste."
              icono={Wallet}
            />
          ) : (
            <>
              {porPagar.length > 0 && (
                <Card className="border-primary/40">
                  <CardContent className="space-y-3 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">Por pagar</span>
                      <PrecioCLP
                        monto={porPagar.reduce((s, p) => s + p.monto, 0)}
                        tamano="xl"
                      />
                    </div>
                    {/* Cómo pagar va junto a lo que se debe, no al final de
                        la lista: con veinte cobros abajo nadie lo encuentra. */}
                    <ComoPagar />
                  </CardContent>
                </Card>
              )}

              {(datos?.pagos ?? []).map((pago) => (
                <Card key={pago.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {etiquetaConcepto(pago.concepto)}
                      </p>
                      <p className="text-muted-foreground truncate text-sm">
                        {formatearFecha(pago.emitidoEn)}
                      </p>
                    </div>
                    <EstadoDelCobro pago={pago} />
                    <PrecioCLP monto={pago.monto} />
                  </CardContent>
                </Card>
              ))}

            </>
          )}
        </TabsContent>

        <TabsContent value="reportes" className="mt-3 space-y-2">
          {extra.cargando && !datos ? (
            <Skeleton className="h-40" />
          ) : (datos?.reportes ?? []).length === 0 ? (
            <EstadoVacio
              titulo="Todavía no hay reportes"
              descripcion="Te mandamos 2 o 3 al día cuando tu perro está con nosotros."
              icono={Camera}
            />
          ) : (
            (datos?.reportes ?? []).map((reporte) => (
              <Card key={reporte.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    {reporte.perroIds.slice(0, 3).map((id) => (
                      <PerroAvatar
                        key={id}
                        id={id}
                        nombre={nombrePerro(id)}
                        fotoUrl={fotoPerro(id)}
                        tamano="sm"
                      />
                    ))}
                    <span className="text-muted-foreground text-sm capitalize">
                      {formatearDiaMes(`${reporte.fecha}T12:00:00Z`)} ·{" "}
                      {reporte.autorStaff}
                    </span>
                  </div>

                  {reporte.fotoUrl ? (
                    <Image
                      src={reporte.fotoUrl}
                      alt={`Foto del ${reporte.fecha}`}
                      width={640}
                      height={420}
                      unoptimized
                      className="h-48 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="bg-secondary/60 text-muted-foreground flex h-24 items-center justify-center gap-2 rounded-xl text-sm">
                      <PawPrint className="size-4" />
                      Sin foto
                    </div>
                  )}

                  <p className="text-sm text-pretty">{reporte.nota}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Cancelar un día de jardín, con la condición a la vista antes de confirmar.
 *
 * El día está pagado por adelantado, así que cancelar tiene consecuencia. Por
 * eso el primer toque no cancela: abre la condición que aplica AHORA, con el
 * número de horas incluido. Enterarse después de que el día se perdió es la
 * manera segura de que se sienta letra chica.
 */
function CancelarDia({
  estadiaId,
  inicioProgramado,
  perro,
  datosGuardados,
}: {
  estadiaId: string;
  inicioProgramado: string;
  perro: string;
  datosGuardados?: DatosBancarios;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [cuenta, setCuenta] = useState(() => cuentaInicial(datosGuardados));
  const { ocupado, ejecutar } = useAccion();

  // Lo pagado no depende del reloj, así que se pide una vez.
  const pagado = useConsulta(
    (repo) => loPagadoPorElDia(repo, estadiaId),
    [estadiaId],
  );

  // La política SÍ depende del reloj, y se recalcula en el render y no al
  // montar: si alguien deja la pestaña abierta toda la tarde, lo que ve tiene
  // que ser la condición de ahora y no la de cuando abrió.
  const devolucion = calcularDevolucionJardin(
    inicioProgramado,
    new Date().toISOString(),
  );

  // Hay plata que devolver solo si corresponde devolver Y alcanzó a pagar.
  // Si el cobro seguía pendiente, anularlo ya es la devolución: ofrecerle una
  // transferencia a alguien que nunca pagó es prometerle algo que no llega.
  const aDevolver = devolucion.devuelve ? (pagado.datos ?? 0) : 0;
  const faltaCuenta = aDevolver > 0 && faltanDatosDeCuenta(cuenta);

  if (!confirmando) {
    return (
      <div className="px-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 px-2"
          onClick={() => setConfirmando(true)}
        >
          Cancelar este día
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border/60 space-y-3 border-t px-3 py-3">
      <p className="text-sm text-pretty">
        {!devolucion.devuelve
          ? `Quedan menos de ${NEGOCIO.jardin.horasParaCancelarSinCosto} horas, así que el día se cobra igual. El cupo ya está tomado y no alcanzamos a ofrecerlo.`
          : aDevolver > 0
            ? "Todavía estás a tiempo, así que te devolvemos lo que pagaste."
            : "Todavía estás a tiempo: cancelas y no te cobramos el día."}
      </p>

      {aDevolver > 0 && (
        <CuentaParaDevolver
          aDevolver={aDevolver}
          cuenta={cuenta}
          alCambiar={setCuenta}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={devolucion.devuelve ? "default" : "destructive"}
          disabled={ocupado || faltaCuenta}
          onClick={async () => {
            try {
              const resultado = await ejecutar((repo) =>
                cancelarDiaDeJardin(
                  repo,
                  estadiaId,
                  new Date().toISOString(),
                  aDevolver > 0 ? cuenta : undefined,
                ),
              );
              toast.success(`Cancelamos el día de ${perro}`, {
                description:
                  resultado.aDevolver > 0
                    ? "Te transferimos en los próximos días hábiles."
                    : resultado.devolucion.devuelve
                      ? "No te cobramos nada."
                      : "El día queda cobrado, como decía la condición.",
              });
            } catch (problema) {
              // El motivo se dice: "no pudimos" a secas deja al dueño sin
              // saber si reintentar o escribirnos.
              toast.error(
                problema instanceof ReservaRechazada
                  ? problema.message
                  : "No pudimos cancelar ese día.",
                {
                  description:
                    problema instanceof ReservaRechazada
                      ? problema.motivos.join(" ")
                      : problema instanceof Error
                        ? problema.message
                        : undefined,
                },
              );
            }
          }}
        >
          {faltaCuenta ? "Completa la cuenta" : "Sí, cancelar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => setConfirmando(false)}
        >
          Mejor no
        </Button>
      </div>
    </div>
  );
}

/** Cómo se ve un cobro según en qué quedó. */
function EstadoDelCobro({ pago }: { pago: Pago }) {
  if (pago.estado === "pagado") return <Badge variant="success">Pagado</Badge>;
  if (pago.estado === "vencido") return <Badge variant="warning">Vencido</Badge>;
  // Un reembolsado con monto es plata que la casa le debe, no un cobro suyo.
  if (pago.estado === "reembolsado") {
    return <Badge variant="jardin">Te lo devolvemos</Badge>;
  }
  return <Badge>Por pagar</Badge>;
}

