import { afterEach } from "vitest";
import { Window } from "happy-dom";

const window = new Window({
  url: "http://localhost",
});

const globals: Record<string, unknown> = {
  document: window.document,
  window,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  MutationObserver: window.MutationObserver,
  MutationRecord: window.MutationRecord,
  CustomEvent: window.CustomEvent,
  Event: window.Event,
  DocumentFragment: window.DocumentFragment,
  DOMParser: window.DOMParser,
  Text: window.Text,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLButtonElement: window.HTMLButtonElement,
  SVGElement: window.SVGElement,
  NodeFilter: window.NodeFilter,
  TreeWalker: window.TreeWalker,
  Range: window.Range,
  Selection: window.Selection,
  HTMLCollection: window.HTMLCollection,
  NodeList: window.NodeList,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  ResizeObserver: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  IntersectionObserver: class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
};

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

// Import jest-dom matchers after DOM globals are available.
// Must use static import + top-level await so matchers are registered
// before any test runs (dynamic import() is async and may not resolve in time).
// @ts-expect-error — side-effect import for jest-dom matchers
import "@testing-library/jest-dom";

// Clean up DOM between tests to prevent cross-test pollution
afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});
