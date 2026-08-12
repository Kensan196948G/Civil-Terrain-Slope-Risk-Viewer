import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // MapLibre GL JS (約1MB) を専用チャンクへ分離し、react ベンダーも分割する。
    // 地図タブ自体は App.tsx の lazy import で遅延読み込みするため、初期ロードは
    // アプリ本体のみになる。MapLibre のサイズはライブラリ由来であり分割で解決
    // するため、警告しきい値は 1.2MB に設定する (バンドル肥大の再発検知用)。
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          "react-vendor": ["react", "react-dom", "react/jsx-runtime"],
        },
      },
    },
  },
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
