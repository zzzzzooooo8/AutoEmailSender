import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
  };
}

Object.defineProperties(window, {
  localStorage: {
    configurable: true,
    value: createMemoryStorage(),
  },
  sessionStorage: {
    configurable: true,
    value: createMemoryStorage(),
  },
});

afterEach(() => {
  cleanup();
});
