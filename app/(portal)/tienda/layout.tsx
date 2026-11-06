import { redirect } from "next/navigation";
import { NEGOCIO } from "@/lib/config/negocio";

/**
 * La puerta de la tienda.
 *
 * Esconderla de la navegación no alcanza: la ruta seguiría respondiendo a
 * quien tenga el enlace guardado, y una pantalla que la casa decidió no
 * ofrecer no debería poder venderle nada a nadie. Acá se corta en el
 * servidor, antes de que la pantalla llegue al navegador.
 *
 * Encenderla de vuelta es cambiar `NEGOCIO.tienda.visible`.
 */
export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!NEGOCIO.tienda.visible) redirect("/reservar");
  return children;
}
