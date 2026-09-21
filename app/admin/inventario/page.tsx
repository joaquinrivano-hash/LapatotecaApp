"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Package, PackageX, Plus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PrecioCLP } from "@/components/shared/precio";
import { Tile } from "@/components/shared/tile";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { cn } from "@/lib/utils";
import type { CategoriaProducto, Producto } from "@/lib/types";

/** Bajo este stock la pantalla avisa. */
const STOCK_BAJO = 4;

const ETIQUETA_CATEGORIA: Record<CategoriaProducto, string> = {
  alimento: "Alimento",
  snack: "Snacks",
  juguete: "Juguetes",
  accesorio: "Accesorios",
  higiene: "Higiene",
};

export default function Inventario() {
  const [busqueda, setBusqueda] = useState("");
  const productos = useConsulta((repo) => repo.productos.listar(), []);

  const todos = productos.datos ?? [];
  const texto = busqueda.trim().toLowerCase();
  const visibles = texto
    ? todos.filter((p) => p.nombre.toLowerCase().includes(texto))
    : todos;

  const agotados = todos.filter((p) => p.stock === 0);
  const bajos = todos.filter((p) => p.stock > 0 && p.stock <= STOCK_BAJO);
  const valorInventario = todos.reduce((s, p) => s + p.precio * p.stock, 0);

  const porCategoria = visibles.reduce<Record<string, Producto[]>>(
    (mapa, producto) => {
      mapa[producto.categoria] = [...(mapa[producto.categoria] ?? []), producto];
      return mapa;
    },
    {},
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Tienda</h1>
        <p className="text-muted-foreground text-sm">
          {todos.length} productos en catálogo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          etiqueta="Agotados"
          valor={agotados.length}
          acento={agotados.length > 0 ? "alerta" : "neutro"}
          icono={PackageX}
        />
        <Tile
          etiqueta="Stock bajo"
          valor={bajos.length}
          detalle={`${STOCK_BAJO} unidades o menos`}
          icono={TriangleAlert}
        />
        <Tile
          etiqueta="Valor en bodega"
          valor={<PrecioCLP monto={valorInventario} tamano="xl" />}
          icono={Package}
        />
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
          icono={Package}
        />
      ) : (
        Object.entries(porCategoria).map(([categoria, lista]) => (
          <section key={categoria} className="space-y-2">
            <h2 className="font-display font-bold">
              {ETIQUETA_CATEGORIA[categoria as CategoriaProducto]}
            </h2>
            <div className="grid gap-2 lg:grid-cols-2">
              {lista.map((producto) => (
                <FilaProducto key={producto.id} producto={producto} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilaProducto({ producto }: { producto: Producto }) {
  const { ocupado, ejecutar } = useAccion();

  async function ajustar(delta: number) {
    const actualizado = await ejecutar((repo) =>
      repo.productos.ajustarStock(producto.id, delta),
    );
    if (actualizado.stock === 0) {
      toast.warning(`${producto.nombre} quedó agotado`);
    }
  }

  const agotado = producto.stock === 0;
  const bajo = producto.stock > 0 && producto.stock <= STOCK_BAJO;

  return (
    <Card className={cn(agotado && "border-destructive/40")}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{producto.nombre}</p>
          <p className="text-muted-foreground truncate text-sm">
            <PrecioCLP monto={producto.precio} tamano="sm" /> ·{" "}
            {producto.descripcion}
          </p>
        </div>

        {agotado ? (
          <Badge variant="destructive">Agotado</Badge>
        ) : bajo ? (
          <Badge variant="warning">Quedan {producto.stock}</Badge>
        ) : (
          <Badge variant="secondary">{producto.stock}</Badge>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={`Quitar una unidad de ${producto.nombre}`}
            disabled={ocupado || agotado}
            onClick={() => ajustar(-1)}
          >
            <Minus />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Agregar una unidad de ${producto.nombre}`}
            disabled={ocupado}
            onClick={() => ajustar(1)}
          >
            <Plus />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
