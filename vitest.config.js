import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 60000,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/database/**", "src/config/**", "node_modules/**"],
    },
  },
});
