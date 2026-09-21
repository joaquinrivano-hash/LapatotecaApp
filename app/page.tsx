import { PawPrint } from "lucide-react";

/** Placeholder de la etapa 1. La landing real se construye en la etapa 4. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <PawPrint className="size-12 text-primary" aria-hidden />
      <h1 className="text-3xl font-bold text-balance">La Patoteca</h1>
      <p className="max-w-sm text-muted-foreground text-pretty">
        Hotel y jardín canino en Providencia. Cuidamos a tu perro en una casa,
        sin jaulas.
      </p>
      <span className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground">
        Prototipo en construcción
      </span>
    </main>
  );
}
