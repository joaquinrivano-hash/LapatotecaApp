import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoPatoteca } from "@/components/shared/logo";

/** Placeholder de la etapa 1. La landing real se construye en la etapa 4. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <LogoPatoteca tamano={128} prioridad />
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-balance">La Patoteca</h1>
        <p className="text-muted-foreground max-w-sm text-pretty">
          Hotel y guardería para perros en Providencia. Cuidamos a tu perro en
          una casa, sin jaulas ni caniles.
        </p>
      </div>
      <Button asChild size="xl">
        <Link href="/ingresar">Entrar al prototipo</Link>
      </Button>
      <span className="bg-secondary text-secondary-foreground rounded-full px-4 py-1.5 text-sm font-semibold">
        El portal del cliente se construye en la etapa 4
      </span>
    </main>
  );
}
