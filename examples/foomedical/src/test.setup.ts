import '@testing-library/jest-dom';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

window.ResizeObserver = ResizeObserver;
