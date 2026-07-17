import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are not enabled, so unmount rendered trees explicitly.
afterEach(() => {
  cleanup();
});
