import { Badge } from "@/components/ui/badge";
import type { EstadoEstadia, EstadoReserva, Linea } from "@/lib/types";

const ESTADIA: Record<
  EstadoEstadia,
  { texto: string; variante: React.ComponentProps<typeof Badge>["variant"] }
> = {
  esperada: { texto: "Esperado", variante: "outline" },
  presente: { texto: "Presente", variante: "success" },
  finalizada: { texto: "Se fue", variante: "secondary" },
  cancelada: { texto: "Cancelada", variante: "destructive" },
  no_show: { texto: "No llegó", variante: "warning" },
};

const RESERVA: Record<
  EstadoReserva,
  { texto: string; variante: React.ComponentProps<typeof Badge>["variant"] }
> = {
  pendiente: { texto: "Por confirmar", variante: "warning" },
  confirmada: { texto: "Confirmada", variante: "default" },
  en_curso: { texto: "Alojado", variante: "success" },
  finalizada: { texto: "Finalizada", variante: "secondary" },
  cancelada: { texto: "Cancelada", variante: "destructive" },
  no_show: { texto: "No llegó", variante: "warning" },
};

export function EstadoEstadiaBadge({ estado }: { estado: EstadoEstadia }) {
  const { texto, variante } = ESTADIA[estado];
  return <Badge variant={variante}>{texto}</Badge>;
}

export function EstadoReservaBadge({ estado }: { estado: EstadoReserva }) {
  const { texto, variante } = RESERVA[estado];
  return <Badge variant={variante}>{texto}</Badge>;
}

export function LineaBadge({ linea }: { linea: Linea }) {
  return (
    <Badge variant={linea === "hotel" ? "hotel" : "jardin"}>
      {linea === "hotel" ? "Hotel" : "Jardín"}
    </Badge>
  );
}
