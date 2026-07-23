import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to a locally running Workers dev server
    // (`pnpm --filter @civil-terrain/api dev`, port 8787).
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
