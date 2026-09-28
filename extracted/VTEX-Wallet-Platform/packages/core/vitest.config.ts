import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15000,
    // Tests séquentiels : plusieurs suites partagent la même base réelle
    // (wallets/transactions), l'exécution parallèle créerait de faux
    // conflits de verrouillage entre suites indépendantes.
    fileParallelism: false,
  },
})
