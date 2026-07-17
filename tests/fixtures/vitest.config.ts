import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Vitest project config for the golden fixtures.
 *
 * `tests/fixtures` is a member of the root `vitest.workspace.ts`
 * (`["packages/*", "apps/*", "tests/fixtures"]`), so this project runs as part
 * of the default `pnpm test`. To run only this project:
 *
 *   pnpm fixtures:test
 *   npx vitest run --config tests/fixtures/vitest.config.ts
 */
export default defineConfig({
  // Discovery is confined to this directory; the geo package is imported by
  // relative path, so the Vite dev server must be allowed to read the repo root.
  server: { fs: { allow: [repoRoot] } },
  test: {
    name: "fixtures",
    root: here,
    include: ["**/*.test.ts"],
  },
});
