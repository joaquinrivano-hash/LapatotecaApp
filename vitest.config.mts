import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Las reglas son funciones puras sin estado compartido: no hace falta
    // aislar cada archivo en su propio worker.
    isolate: false,
  },
});
