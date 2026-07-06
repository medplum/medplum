// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';
import { vi } from 'vitest';

Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

window.ResizeObserver = ResizeObserver;
