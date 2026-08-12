import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found in index.html");
}

// PWA の Service Worker は本番ビルドのみ登録する。
// Vite dev は HMR と競合するため、開発時の登録は行わない。
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service Worker registration failed", error);
    });
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
