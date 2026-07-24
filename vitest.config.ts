import { defineConfig } from "vitest/config";

// Root Vitest config. `test.projects` replaces the deprecated
// `vitest.workspace.ts` (removed in Vitest 4). The glob list is equivalent:
// every workspace package plus the standalone fixtures suite runs as a project.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "tests/fixtures"],
  },
});
