"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  EyeOff,
  Minus,
  Package,
  PackageX,
  Plus,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoVacio } from "@/components/shared/estado-vacio";
import { PrecioCLP } from "@/components/shared/precio";
import { Tile } from "@/components/shared/tile";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import {
  borradorDesde,
  CATEGORIAS_PRODUCTO,
  revisarProducto,
  type BorradorDeProducto,
  type RevisionDeProducto,
} from "@/lib/rules/producto";
import { cn } from "@/lib/utils";
import type { CategoriaProducto, Producto } from "@/lib/types";

/** Bajo este stock la pantalla avisa. */
const STOCK_BAJO = 4;

export default function Inventario() {
  const [busqueda, setBusqueda] = useState("");
  // `null` cerrado, "nuevo" para agregar, o el id del que se edita.
  const [editando, setEditando] = useState<string | null>(null);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Tienda</h1>
          <p className="text-muted-foreground text-sm">
            {todos.length} productos en catálogo. Toca uno para editarlo.
          </p>
        </div>
        <Button onClick={() => setEditando("nuevo")}>
          <Plus />
          Agregar producto
        </Button>
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
              {CATEGORIAS_PRODUCTO[categoria as CategoriaProducto]}
            </h2>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {lista.map((producto) => (
                <FilaProducto
                  key={producto.id}
                  producto={producto}
                  onEditar={() => setEditando(producto.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <Sheet
        open={editando !== null}
        onOpenChange={(abierto) => !abierto && setEditando(null)}
      >
        <SheetContent>
          {editando !== null && (
            <EditorProducto
              // La clave lo reinicia al pasar de un producto a otro.
              key={editando}
              producto={todos.find((p) => p.id === editando)}
              onListo={() => setEditando(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilaProducto({
  producto,
  onEditar,
}: {
  producto: Producto;
  onEditar: () => void;
}) {
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
    <Card
      className={cn(
        agotado && "border-destructive/40",
        !producto.activo && "opacity-70",
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        {/* El cuerpo abre el editor y los botones de la derecha ajustan el
            stock: dos blancos separados, nunca un botón dentro de otro. */}
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${producto.nombre}`}
          className="min-w-0 flex-1 text-left"
        >
          {/* El nombre se parte en dos líneas antes que recortarse: en el
              celular "Alimento premium adu…" no distingue adulto de cachorro. */}
          <p className="line-clamp-2 font-semibold text-pretty">
            {producto.nombre}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            <PrecioCLP monto={producto.precio} tamano="sm" /> ·{" "}
            {producto.descripcion}
          </p>
          {!producto.activo && (
            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs font-semibold">
              <EyeOff className="size-3.5" />
              Oculto en la tienda
            </p>
          )}
        </button>

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

/**
 * Editar o agregar un producto.
 *
 * No hay "eliminar": un producto que ya se vendió aparece en órdenes viejas,
 * y borrarlo dejaría esas compras apuntando a nada. Para sacarlo de la
 * vitrina se oculta, que además se deshace con un toque.
 */
function EditorProducto({
  producto,
  onListo,
}: {
  producto?: Producto;
  onListo: () => void;
}) {
  const { ocupado, ejecutar } = useAccion();
  const [borrador, setBorrador] = useState<BorradorDeProducto>(() =>
    borradorDesde(producto),
  );
  // Los errores se muestran recién al intentar guardar: marcar en rojo lo
  // que todavía no se alcanza a escribir es hostil.
  const [errores, setErrores] = useState<RevisionDeProducto["errores"]>({});

  const cambiar = (cambios: Partial<BorradorDeProducto>) =>
    setBorrador({ ...borrador, ...cambios });

  async function guardar() {
    const revision = revisarProducto(borrador);
    setErrores(revision.errores);
    if (!revision.datos) return;
    const datos = revision.datos;

    if (producto) {
      await ejecutar((repo) => repo.productos.actualizar(producto.id, datos));
      toast.success(`${datos.nombre} quedó actualizado`);
    } else {
      await ejecutar((repo) => repo.productos.crear(datos));
      toast.success(`${datos.nombre} ya está en la tienda`, {
        description: datos.activo ? undefined : "Quedó oculto hasta que lo actives.",
      });
    }
    onListo();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{producto ? "Editar producto" : "Nuevo producto"}</SheetTitle>
        <SheetDescription>
          {producto
            ? "Lo que cambies se ve en la tienda apenas guardes."
            : "Aparece en la tienda apenas lo guardes."}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 overflow-y-auto px-5 pb-2">
        <Campo etiqueta="Nombre" id="producto-nombre" error={errores.nombre}>
          <Input
            id="producto-nombre"
            value={borrador.nombre}
            placeholder="Ej: Snack de pollo deshidratado"
            aria-invalid={Boolean(errores.nombre)}
            onChange={(e) => cambiar({ nombre: e.target.value })}
          />
        </Campo>

        <Campo etiqueta="Descripción" id="producto-descripcion">
          <Textarea
            id="producto-descripcion"
            value={borrador.descripcion}
            placeholder="Lo que el dueño lee en la tienda."
            rows={3}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
          />
        </Campo>

        <Campo etiqueta="Categoría" id="producto-categoria">
          <Select
            id="producto-categoria"
            value={borrador.categoria}
            onChange={(e) =>
              cambiar({ categoria: e.target.value as CategoriaProducto })
            }
          >
            {Object.entries(CATEGORIAS_PRODUCTO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Precio" id="producto-precio" error={errores.precio}>
            <Input
              id="producto-precio"
              inputMode="numeric"
              value={borrador.precio}
              placeholder="Ej: 18.000"
              aria-invalid={Boolean(errores.precio)}
              onChange={(e) => cambiar({ precio: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Stock" id="producto-stock" error={errores.stock}>
            <Input
              id="producto-stock"
              inputMode="numeric"
              value={borrador.stock}
              aria-invalid={Boolean(errores.stock)}
              onChange={(e) => cambiar({ stock: e.target.value })}
            />
          </Campo>
        </div>

        <label className="bg-secondary/40 flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3">
          <span className="min-w-0 text-sm">
            <span className="block font-semibold">Visible en la tienda</span>
            <span className="text-muted-foreground block text-xs text-pretty">
              Apágalo para sacarlo de la vitrina sin perder el producto.
            </span>
          </span>
          <Switch
            checked={borrador.activo}
            onCheckedChange={(activo) => cambiar({ activo })}
          />
        </label>
      </div>

      <SheetFooter>
        <Button size="xl" disabled={ocupado} onClick={guardar}>
          {producto ? <Save /> : <Plus />}
          {ocupado ? "Guardando…" : producto ? "Guardar cambios" : "Agregar a la tienda"}
        </Button>
      </SheetFooter>
    </>
  );
}

function Campo({
  etiqueta,
  id,
  error,
  children,
}: {
  etiqueta: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
