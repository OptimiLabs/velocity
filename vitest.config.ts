import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // DOM globals are provisioned manually in __tests__/setup.ts via happy-dom.
    // Using jsdom here pulls in cssstyle/jsdom transitive deps that currently
    // fail to initialize in this environment.
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "bun:sqlite": path.resolve(__dirname, "__tests__/helpers/bun-sqlite-shim.ts"),
    },
  },
});
