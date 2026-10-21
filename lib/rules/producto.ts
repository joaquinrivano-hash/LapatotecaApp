/**
 * Qué tiene que tener un producto para estar en la vitrina.
 *
 * El precio y el stock llegan escritos por una persona ("18.000", "$18.000",
 * "18000"), así que se leen como se escriben en Chile: el punto es de miles,
 * no decimal, y un monto CLP no tiene centavos.
 */

import type { CategoriaProducto, Producto } from "@/lib/types";

export const CATEGORIAS_PRODUCTO: Record<CategoriaProducto, string> = {
  alimento: "Alimento",
  snack: "Snacks",
  juguete: "Juguetes",
  accesorio: "Accesorios",
  higiene: "Higiene",
};

export interface BorradorDeProducto {
  nombre: string;
  descripcion: string;
  categoria: CategoriaProducto;
  precio: string;
  stock: string;
  activo: boolean;
}

export type DatosDeProducto = Omit<Producto, "id">;

export interface RevisionDeProducto {
  datos?: DatosDeProducto;
  /** Por campo, para marcarlo en el formulario. */
  errores: Partial<Record<keyof BorradorDeProducto, string>>;
}

/** "18.000", "$18.000" o "18000" → 18000. Lo que no sea entero, undefined. */
export function leerEntero(texto: string): number | undefined {
  const limpio = texto.replace(/[$\s.]/g, "");
  if (!/^\d+$/.test(limpio)) return undefined;
  return Number(limpio);
}

export function revisarProducto(borrador: BorradorDeProducto): RevisionDeProducto {
  const errores: RevisionDeProducto["errores"] = {};
  const nombre = borrador.nombre.trim();
  const precio = leerEntero(borrador.precio);
  const stock = leerEntero(borrador.stock);

  if (!nombre) errores.nombre = "Ponle un nombre.";
  if (precio === undefined || precio <= 0) {
    errores.precio = "El precio va en pesos, sin decimales. Ej: 18.000";
  }
  if (stock === undefined) {
    errores.stock = "El stock es un número entero: 0 si está agotado.";
  }

  if (Object.keys(errores).length > 0) return { errores };

  return {
    errores,
    datos: {
      nombre,
      descripcion: borrador.descripcion.trim(),
      categoria: borrador.categoria,
      precio: precio!,
      stock: stock!,
      activo: borrador.activo,
    },
  };
}

export function borradorDesde(producto?: Producto): BorradorDeProducto {
  return producto
    ? {
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        categoria: producto.categoria,
        precio: String(producto.precio),
        stock: String(producto.stock),
        activo: producto.activo,
      }
    : {
        nombre: "",
        descripcion: "",
        categoria: "alimento",
        precio: "",
        stock: "0",
        activo: true,
      };
}
