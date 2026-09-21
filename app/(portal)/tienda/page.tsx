"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PrecioCLP } from "@/components/shared/precio";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { comprarEnTienda, ReservaRechazada } from "@/lib/servicios/reservas";
import { useSesion } from "@/lib/store/sesion";
import { cn } from "@/lib/utils";
import type { CategoriaProducto, Producto } from "@/lib/types";

const ETIQUETA: Record<CategoriaProducto, string> = {
  alimento: "Alimento",
  snack: "Snacks",
  juguete: "Juguetes",
  accesorio: "Accesorios",
  higiene: "Higiene",
};

export default function Tienda() {
  const clienteId = useSesion((s) => s.clienteId);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [abierto, setAbierto] = useState(false);
  const { ocupado, ejecutar } = useAccion();

  const productos = useConsulta((repo) => repo.productos.activos(), []);
  const todos = productos.datos ?? [];

  const texto = busqueda.trim().toLowerCase();
  const visibles = texto
    ? todos.filter((p) => p.nombre.toLowerCase().includes(texto))
    : todos;

  const porCategoria = useMemo(
    () =>
      visibles.reduce<Record<string, Producto[]>>((mapa, producto) => {
        mapa[producto.categoria] = [...(mapa[producto.categoria] ?? []), producto];
        return mapa;
      }, {}),
    [visibles],
  );

  const items = Object.entries(carrito).filter(([, cantidad]) => cantidad > 0);
  const unidades = items.reduce((s, [, cantidad]) => s + cantidad, 0);
  const total = items.reduce((s, [id, cantidad]) => {
    const producto = todos.find((p) => p.id === id);
    return s + (producto?.precio ?? 0) * cantidad;
  }, 0);

  function ajustar(producto: Producto, delta: number) {
    setCarrito((actual) => {
      const nuevo = Math.max(
        0,
        Math.min(producto.stock, (actual[producto.id] ?? 0) + delta),
      );
      return { ...actual, [producto.id]: nuevo };
    });
  }

  async function pagar() {
    if (!clienteId) return;
    try {
      const { orden, ajustados } = await ejecutar((repo) =>
        comprarEnTienda(
          repo,
          clienteId,
          items.map(([productoId, cantidad]) => ({ productoId, cantidad })),
        ),
      );
      toast.success("Compra lista", {
        description:
          ajustados.length > 0
            ? ajustados.join(" ")
            : `Pagaste ${orden.items.length} ${orden.items.length === 1 ? "producto" : "productos"}. Lo dejamos listo para el retiro.`,
      });
      setCarrito({});
      setAbierto(false);
    } catch (error) {
      if (error instanceof ReservaRechazada) {
        toast.error(error.message, { description: error.motivos.join(" ") });
      } else {
        toast.error("No pudimos cerrar la compra.");
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Tienda</h1>
          <p className="text-muted-foreground text-sm">
            Lo retiras cuando vengas a buscar a tu perro.
          </p>
        </div>
        <Button
          size="lg"
          variant={unidades > 0 ? "default" : "outline"}
          onClick={() => setAbierto(true)}
          disabled={unidades === 0}
        >
          <ShoppingCart />
          {unidades > 0 ? `${unidades} · ` : ""}
          <PrecioCLP monto={total} tamano="sm" className="text-inherit" />
        </Button>
      </div>

      <Input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto…"
      />

      {productos.cargando && todos.length === 0 ? (
        <Skeleton className="h-64" />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Sin resultados"
          descripcion="Ningún producto coincide con esa búsqueda."
          icono={ShoppingBag}
        />
      ) : (
        Object.entries(porCategoria).map(([categoria, lista]) => (
          <section key={categoria} className="space-y-2">
            <h2 className="font-display font-bold">
              {ETIQUETA[categoria as CategoriaProducto]}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {lista.map((producto) => (
                <Card
                  key={producto.id}
                  className={cn(producto.stock === 0 && "opacity-60")}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{producto.nombre}</p>
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {producto.descripcion}
                      </p>
                      <p className="mt-1">
                        <PrecioCLP monto={producto.precio} />
                        {producto.stock === 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Agotado
                          </Badge>
                        )}
                      </p>
                    </div>
                    {producto.stock > 0 &&
                      ((carrito[producto.id] ?? 0) === 0 ? (
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Agregar ${producto.nombre}`}
                          onClick={() => ajustar(producto, 1)}
                        >
                          <Plus />
                        </Button>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Quitar una unidad de ${producto.nombre}`}
                            onClick={() => ajustar(producto, -1)}
                          >
                            <Minus />
                          </Button>
                          <span className="min-w-6 text-center font-bold tabular-nums">
                            {carrito[producto.id]}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Agregar otra unidad de ${producto.nombre}`}
                            disabled={carrito[producto.id] >= producto.stock}
                            onClick={() => ajustar(producto, 1)}
                          >
                            <Plus />
                          </Button>
                        </span>
                      ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Tu carrito</SheetTitle>
          </SheetHeader>

          <div className="space-y-2 overflow-y-auto px-5 pb-4">
            {items.map(([id, cantidad]) => {
              const producto = todos.find((p) => p.id === id);
              if (!producto) return null;
              return (
                <div key={id} className="flex items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{producto.nombre}</p>
                    <p className="text-muted-foreground text-sm">
                      {cantidad} × <PrecioCLP monto={producto.precio} tamano="sm" />
                    </p>
                  </div>
                  <PrecioCLP monto={producto.precio * cantidad} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${producto.nombre}`}
                    onClick={() =>
                      setCarrito((c) => ({ ...c, [id]: 0 }))
                    }
                    className="text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>

          <SheetFooter>
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-display font-bold">Total</span>
              <PrecioCLP monto={total} tamano="xl" />
            </p>
            <Button size="xl" disabled={ocupado || unidades === 0} onClick={pagar}>
              <ShoppingCart />
              Pagar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
