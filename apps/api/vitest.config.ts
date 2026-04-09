import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: "./src",
    include: ["**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "../coverage",
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
  resolve: {
    alias: {
      "@luka/database": path.resolve(__dirname, "../../packages/database/src"),
      "@luka/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
