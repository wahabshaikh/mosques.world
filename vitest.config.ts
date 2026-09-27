import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/db/**", "lib/analytics.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
