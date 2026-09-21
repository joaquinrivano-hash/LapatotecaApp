"use client";

import { CalendarX, Repeat, Ticket, TicketX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PrecioCLP } from "@/components/shared/precio";
import { Tile } from "@/components/shared/tile";
import { BarraParticipacion } from "@/components/admin/barra-participacion";
import { useConsulta } from "@/lib/hooks/use-consulta";
import {
  diasPerdidos,
  nombreDePlan,
  planVigente,
  saldoPlan,
} from "@/lib/rules/planes";
import { hoyDelStaff } from "@/lib/servicios/asistencia";
import { diasEntre, formatearFecha } from "@/lib/utils/fecha";
import type { PlanComprado } from "@/lib/types";

export default function Planes() {
  const hoy = hoyDelStaff();

  const datos = useConsulta(async (repo) => {
    const [planes, suscripciones, perros, clientes] = await Promise.all([
      repo.planes.listar(),
      repo.suscripciones.listar(),
      repo.perros.listar(),
      repo.clientes.listar(),
    ]);
    return { planes, suscripciones, perros, clientes };
  }, [hoy]);

  if (datos.cargando && !datos.datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!datos.datos) return null;
  const { planes, suscripciones, perros, clientes } = datos.datos;

  const vigentes = planes.filter((p) => planVigente(p, hoy));
  const activas = suscripciones.filter((s) => s.estado === "activa");

  // Días que el cliente pagó y se le vencieron sin usar: la fuga silenciosa
  // del modelo de packs.
  const perdidos = planes.reduce((suma, p) => suma + diasPerdidos(p, hoy), 0);
  const diasVendidos = planes.reduce((suma, p) => suma + p.diasTotales, 0);

  const nombrePerro = (id: string) =>
    perros.find((p) => p.id === id)?.nombre ?? "Perro";
  const nombreCliente = (id: string) => {
    const c = clientes.find((x) => x.id === id);
    return c ? `${c.nombre} ${c.apellido}` : "Cliente";
  };

  const porVencer = [...vigentes]
    .filter((p) => diasEntre(hoy, p.venceEn) <= 10)
    .sort((a, b) => a.venceEn.localeCompare(b.venceEn));

  // Los planes son mensuales, así que a fin de mes vencen todos juntos y la
  // sección repetiría la lista completa. Solo vale la pena cuando destaca a
  // unos pocos.
  const destacarPorVencer =
    porVencer.length > 0 && porVencer.length < vigentes.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Planes de jardín</h1>
        <p className="text-muted-foreground text-sm">
          Días comprados, días usados y qué se está venciendo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile etiqueta="Planes vigentes" valor={vigentes.length} icono={Ticket} />
        <Tile
          etiqueta="Suscripciones"
          valor={activas.length}
          detalle="se recargan el día 1"
          icono={Repeat}
        />
        <Tile
          etiqueta="Vencen pronto"
          valor={porVencer.length}
          detalle="en 10 días o menos"
          acento={porVencer.length > 0 ? "alerta" : "neutro"}
          icono={CalendarX}
        />
        <Tile
          etiqueta="Días perdidos"
          valor={perdidos}
          detalle={`de ${diasVendidos} vendidos`}
          acento={perdidos > 0 ? "alerta" : "neutro"}
          icono={TicketX}
        />
      </div>

      {destacarPorVencer && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Se vencen pronto</CardTitle>
            <p className="text-muted-foreground text-sm text-pretty">
              Días ya pagados que el cliente va a perder si no los usa. Vale una
              llamada.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {porVencer.map((plan) => (
              <FilaPlan
                key={plan.id}
                plan={plan}
                hoy={hoy}
                perro={nombrePerro(plan.perroId)}
                cliente={nombreCliente(plan.clienteId)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            Todos los planes vigentes
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {vigentes.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {vigentes.length === 0 ? (
            <EstadoVacio
              titulo="Sin planes vigentes"
              descripcion="Nadie tiene días de pack disponibles ahora mismo."
              icono={Ticket}
            />
          ) : (
            [...vigentes]
              .sort((a, b) => a.venceEn.localeCompare(b.venceEn))
              .map((plan) => (
                <FilaPlan
                  key={plan.id}
                  plan={plan}
                  hoy={hoy}
                  perro={nombrePerro(plan.perroId)}
                  cliente={nombreCliente(plan.clienteId)}
                />
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilaPlan({
  plan,
  hoy,
  perro,
  cliente,
}: {
  plan: PlanComprado;
  hoy: string;
  perro: string;
  cliente: string;
}) {
  const saldo = saldoPlan(plan);
  const restantes = diasEntre(hoy, plan.venceEn);
  const urgente = restantes <= 10;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {perro}
          <span className="text-muted-foreground font-normal"> · {cliente}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <Badge variant={plan.tipo === "pase_libre" ? "jardin" : "secondary"}>
            {nombreDePlan(plan)}
          </Badge>
          <span className="tabular-nums">
            {plan.diasUsados} de {plan.diasTotales}
          </span>
        </span>
      </div>

      <BarraParticipacion
        etiqueta=""
        valor=""
        fraccion={plan.diasUsados / plan.diasTotales}
        tono="jardin"
        className="[&>div:first-child]:hidden"
      />

      <p className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
        <span className={urgente ? "text-warning font-semibold" : undefined}>
          {restantes < 0
            ? "Vencido"
            : restantes === 0
              ? "Vence hoy"
              : `Vence el ${formatearFecha(`${plan.venceEn}T12:00:00Z`)} · ${restantes} ${restantes === 1 ? "día" : "días"}`}
        </span>
        <span>
          Quedan {saldo} {saldo === 1 ? "día" : "días"} ·{" "}
          <PrecioCLP monto={plan.precio} tamano="sm" />
        </span>
      </p>
    </div>
  );
}
