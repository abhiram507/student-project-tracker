import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Deterministic test environment. A fixed secret keeps signed-token
    // assertions reproducible; the DATABASE_URL is never dialled because every
    // service test injects a mocked PrismaClient.
    env: {
      SESSION_SECRET: "test-secret-value-that-is-long-enough-for-hs256-abcdef",
      DATABASE_URL: "postgresql://spt:spt@localhost:5432/spt_test?schema=public",
      NODE_ENV: "test",
    },
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts"],
      thresholds: { lines: 88, functions: 85, branches: 90, statements: 88 },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
