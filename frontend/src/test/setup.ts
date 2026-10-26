import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { setCsrfToken, setRetryDelayMs } from "../lib/http";

setRetryDelayMs(0);

afterEach(() => {
  cleanup();
  setCsrfToken("auth", null);
  setCsrfToken("guest", null);
  setRetryDelayMs(0);
  localStorage.clear();
  vi.unstubAllGlobals();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
window.scrollTo = () => undefined;
