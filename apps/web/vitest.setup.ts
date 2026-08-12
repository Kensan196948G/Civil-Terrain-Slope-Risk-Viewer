import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom の localStorage は環境によって不完全 (clear 未実装等) なことがある。
 * App の履歴機能は localStorage を使うため、メモリ実装へ差し替えて
 * テスト間の状態を確実にリセットできるようにする。
 */
function installLocalStoragePolyfill(): void {
  class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
      return this.values.size;
    }

    clear(): void {
      this.values.clear();
    }

    getItem(key: string): string | null {
      return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
      return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
      this.values.delete(key);
    }

    setItem(key: string, value: string): void {
      this.values.set(key, value);
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear();
    } catch {
      Object.defineProperty(window, "localStorage", {
        value: new MemoryStorage(),
        configurable: true,
      });
    }
  }
}

installLocalStoragePolyfill();

// Vitest globals are not enabled, so unmount rendered trees explicitly.
afterEach(() => {
  cleanup();
});
