import { WifiOff } from "lucide-react";
import { LogoPatoteca } from "@/components/shared/logo";

export const metadata = { title: "Sin conexión — La Patoteca" };

export default function SinConexion() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <LogoPatoteca tamano={96} />
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold">Te quedaste sin señal</h1>
        <p className="text-muted-foreground max-w-sm text-pretty">
          Esta pantalla todavía no estaba guardada. Las que ya visitaste sí
          funcionan sin conexión, y todo lo que hagas se guarda en el teléfono.
        </p>
      </div>
      <span className="bg-secondary text-secondary-foreground flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold">
        <WifiOff className="size-4" />
        Vuelve a intentar cuando tengas señal
      </span>
    </main>
  );
}
