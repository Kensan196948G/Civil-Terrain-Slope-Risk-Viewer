import { defineConfig } from "vitest/config";

// Root Vitest config. `test.projects` replaces the deprecated
// `vitest.workspace.ts` (removed in Vitest 4). The glob list is equivalent:
// every workspace package plus the standalone fixtures suite runs as a project.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "tests/fixtures"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "**/dist/**",
        "**/src/main.tsx",
        "**/src/vite-env.d.ts",
        "apps/api/src/index.ts",
      ],
      // テスト品質戦略の目標 (80%以上) をゲート化する。
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
