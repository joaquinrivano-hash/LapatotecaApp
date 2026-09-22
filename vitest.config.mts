import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // Las reglas viven en lib/, y las rutas de API en app/: las dos llevan
    // tests y las dos corren con `npm test`.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // Las reglas son funciones puras sin estado compartido: no hace falta
    // aislar cada archivo en su propio worker.
    isolate: false,
  },
});
