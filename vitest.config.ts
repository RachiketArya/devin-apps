import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
