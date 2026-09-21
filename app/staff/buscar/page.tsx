"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PerroAvatar } from "@/components/shared/perro-avatar";
import { FichaPerro } from "@/components/staff/ficha-perro";
import { itemsDelDia } from "@/components/staff/items";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  cargarDiaDeStaff,
  hoyDelStaff,
  registrarLlegadaHotel,
  registrarLlegadaJardin,
  registrarSalidaHotel,
  registrarSalidaJardin,
} from "@/lib/servicios/asistencia";
import { formatearCLP } from "@/lib/utils/moneda";
import type { Perro } from "@/lib/types";

export default function Buscar() {
  const hoy = hoyDelStaff();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<Perro | null>(null);

  const dia = useConsulta((repo) => cargarDiaDeStaff(repo, hoy), [hoy]);
  const encontrados = useConsulta(
    (repo) => repo.perros.buscar(texto),
    [texto],
  );
  const { ocupado, ejecutar } = useAccion();

  const items = useMemo(
    () => (dia.datos ? itemsDelDia(dia.datos) : []),
    [dia.datos],
  );

  const itemDe = (perroId: string) => items.find((i) => i.perro.id === perroId);
  const clienteDe = (perro: Perro) =>
    dia.datos?.clientes.find((c) => c.id === perro.clienteId);

  const resultados = texto.trim() ? (encontrados.datos ?? []) : [];

  async function accionar(perro: Perro, accion: "llego" | "se_fue") {
    const item = itemDe(perro.id);
    if (!item) return;

    if (accion === "llego") {
      await ejecutar(async (repo) => {
        if (item.linea === "hotel") await registrarLlegadaHotel(repo, item.id);
        else await registrarLlegadaJardin(repo, item.id);
      });
      toast.success(`Llegó ${perro.nombre}`);
      setAbierto(null);
      return;
    }

    if (item.linea === "hotel") {
      const resultado = await ejecutar((repo) =>
        registrarSalidaHotel(repo, item.id),
      );
      toast.success(`Se fue ${perro.nombre}`, {
        description:
          resultado.saldoPorCobrar > 0
            ? `Queda por cobrar ${formatearCLP(resultado.saldoPorCobrar)}.`
            : undefined,
      });
    } else {
      const resultado = await ejecutar((repo) =>
        registrarSalidaJardin(repo, item.id),
      );
      if (resultado.recargo > 0) {
        toast.warning(`Se fue ${perro.nombre}, fuera de horario`, {
          description: `Se agregaron ${formatearCLP(resultado.recargo)}.`,
        });
      } else {
        toast.success(`Se fue ${perro.nombre}`);
      }
    }
    setAbierto(null);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre del perro o del dueño…"
          className="h-14 pl-12"
          autoFocus
        />
      </div>

      {!texto.trim() ? (
        <EstadoVacio
          titulo="Busca a cualquier perro"
          descripcion="Sirve el nombre del perro o el de su dueño: 'Pelusa' o 'la Javiera'."
          icono={Search}
        />
      ) : encontrados.cargando ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : resultados.length === 0 ? (
        <EstadoVacio
          titulo="No encontramos a nadie"
          descripcion={`Nada que coincida con "${texto}".`}
          icono={Search}
        />
      ) : (
        <ul className="space-y-2">
          {resultados.slice(0, 30).map((perro) => {
            const item = itemDe(perro.id);
            const cliente = clienteDe(perro);
            return (
              <li key={perro.id}>
                <button
                  type="button"
                  onClick={() => setAbierto(perro)}
                  className="bg-card flex w-full items-center gap-3 rounded-2xl border border-border/70 p-3 text-left shadow-sm transition-colors active:scale-[0.99]"
                >
                  <PerroAvatar
                    id={perro.id}
                    nombre={perro.nombre}
                    fotoUrl={perro.fotoUrl}
                    tamano="lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-display block truncate text-lg font-bold">
                      {perro.nombre}
                    </span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {cliente
                        ? `${cliente.nombre} ${cliente.apellido}`
                        : perro.raza}
                    </span>
                  </span>
                  {item ? (
                    <Badge
                      variant={
                        item.estado === "presente"
                          ? "success"
                          : item.estado === "esperado"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {item.estado === "presente"
                        ? "Adentro"
                        : item.estado === "esperado"
                          ? "Por llegar"
                          : "Se fue"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Hoy no viene</Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <SheetContent>
          {abierto && (
            <FichaPerro
              perro={abierto}
              cliente={clienteDe(abierto)}
              item={itemDe(abierto.id)}
              hoy={hoy}
              ocupado={ocupado}
              onAccion={(accion) => accionar(abierto, accion)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
