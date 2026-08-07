import '@testing-library/jest-dom/vitest';

// PriceChart uses ResizeObserver to auto-fit the chart on container size changes.
// jsdom does not implement ResizeObserver — stub it so unit tests don't crash.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
