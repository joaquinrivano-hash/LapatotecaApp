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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { MiPerro } from "@/components/portal/mi-perro";
import { PrecioCLP } from "@/components/shared/precio";
import { BarraParticipacion } from "@/components/admin/barra-participacion";
import { useId, useState } from "react";
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
      })),
    ...(datos?.estadias ?? [])
      .filter((e) => e.fecha >= hoy && e.estado !== "cancelada")
      .map((e) => ({
        id: e.id,
        linea: "jardin" as const,
        perroId: e.perroId,
        fecha: e.fecha,
        detalle: `${formatearHora(e.inicioProgramado)} a ${formatearHora(e.finProgramado)}`,
        total: e.cotizacion?.total ?? 0,
        inicioProgramado: e.inicioProgramado,
        esDiaDePrueba: e.origen === "dia_de_prueba",
      })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porPagar = (datos?.pagos ?? []).filter(
    (p) => p.estado === "pendiente" || p.estado === "vencido",
  );

  const nombrePerro = (id: string) =>
    perros.find((p) => p.id === id)?.nombre ?? "Tu perro";

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

      <section className="space-y-2">
        {perros.map((perro) => {
          const alertas = alertasDePerro(perro, hoy);
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
                    tamano="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold capitalize">
                      {formatearDiaMes(`${item.fecha}T12:00:00Z`)}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {nombrePerro(item.perroId)} · {item.detalle}
                    </p>
                  </div>
                  <Badge variant={item.linea === "hotel" ? "hotel" : "jardin"}>
                    {item.linea === "hotel" ? "Hotel" : "Jardín"}
                  </Badge>
                  {item.total > 0 && <PrecioCLP monto={item.total} />}
                </CardContent>

                {/* El día de prueba se cancela desde su propia pantalla, que
                    además deja reprogramar. */}
                {item.linea === "jardin" && !item.esDiaDePrueba && (
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
                  <CardContent className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                    <span className="font-semibold">Por pagar</span>
                    <PrecioCLP
                      monto={porPagar.reduce((s, p) => s + p.monto, 0)}
                      tamano="xl"
                    />
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

              {/* Las condiciones de pago a la vista, no detrás de un enlace:
                  si no hay pasarela, el dueño tiene que saber cómo pagar. */}
              <p className="text-muted-foreground px-1 text-xs text-pretty">
                Los cobros se pagan por transferencia o en el local. Cuando
                recibamos el pago lo marcamos acá.
              </p>
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
  const [cuenta, setCuenta] = useState<DatosBancarios>(
    datosGuardados ?? {
      titular: "",
      rut: "",
      banco: "",
      tipoDeCuenta: TIPOS_DE_CUENTA[0],
      numero: "",
    },
  );
  const { ocupado, ejecutar } = useAccion();
  const idTipoDeCuenta = useId();

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
  const faltaCuenta =
    aDevolver > 0 &&
    (!cuenta.titular.trim() || !cuenta.rut.trim() || !cuenta.numero.trim());

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
        <div className="bg-secondary/50 space-y-3 rounded-xl p-3">
          <p className="text-sm font-semibold">
            Te devolvemos <PrecioCLP monto={aDevolver} /> por transferencia
          </p>
          <p className="text-muted-foreground text-xs text-pretty">
            Dinos a qué cuenta. La hacemos dentro de los próximos días hábiles.
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CampoCuenta
              etiqueta="Nombre del titular"
              valor={cuenta.titular}
              alCambiar={(titular) => setCuenta({ ...cuenta, titular })}
            />
            <CampoCuenta
              etiqueta="RUT del titular"
              valor={cuenta.rut}
              alCambiar={(rut) => setCuenta({ ...cuenta, rut })}
            />
            <CampoCuenta
              etiqueta="Banco"
              valor={cuenta.banco}
              alCambiar={(banco) => setCuenta({ ...cuenta, banco })}
            />
            <div className="space-y-1">
              <Label htmlFor={idTipoDeCuenta} className="text-xs">
                Tipo de cuenta
              </Label>
              <Select
                id={idTipoDeCuenta}
                value={cuenta.tipoDeCuenta}
                onChange={(e) =>
                  setCuenta({ ...cuenta, tipoDeCuenta: e.target.value })
                }
              >
                {TIPOS_DE_CUENTA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <CampoCuenta
                etiqueta="Número de cuenta"
                valor={cuenta.numero}
                alCambiar={(numero) => setCuenta({ ...cuenta, numero })}
              />
            </div>
          </div>

          {/* El titular puede no ser el cliente: hay cuentas a nombre de la
              pareja, y el banco rechaza si el nombre no calza con el RUT. */}
          <p className="text-muted-foreground text-xs text-pretty">
            Si la cuenta está a nombre de otra persona, pon sus datos: el banco
            rechaza la transferencia cuando el nombre no calza con el RUT.
          </p>
        </div>
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
            } catch {
              toast.error("No pudimos cancelar ese día.");
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

const TIPOS_DE_CUENTA = [
  "Cuenta corriente",
  "Cuenta vista",
  "Cuenta RUT",
  "Cuenta de ahorro",
];

function CampoCuenta({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  // La etiqueta va amarrada al campo con `htmlFor`. Sin eso un lector de
  // pantalla lee cinco cajas de texto sin nombre, y tocar la etiqueta en el
  // celular no enfoca nada: el área tocable se reduce a la caja.
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
      />
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
