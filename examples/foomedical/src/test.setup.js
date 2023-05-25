require('@testing-library/jest-dom');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

window.ResizeObserver =
  window.ResizeObserver ||
  jest.fn().mockImplementation(() => ({
    disconnect: jest.fn(),
    observe: jest.fn(),
    unobserve: jest.fn(),
  }));
