// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MemoryStorage, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import '@testing-library/jest-dom/vitest';
import { TextDecoder, TextEncoder } from 'node:util';
import { vi } from 'vitest';

declare global {
  // React Testing Library sets this on `self` in jsdom; React reads it from globalThis.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  interface Window {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
}

// Vitest's jsdom environment exposes `self` separately from `globalThis`. React reads
// IS_REACT_ACT_ENVIRONMENT from globalThis while Testing Library toggles it on self, so
// async RTL act() calls do not suppress spurious "not wrapped in act(...)" warnings.
// See: https://github.com/vitest-dev/vitest/issues/1146
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  get() {
    return globalThis.self?.IS_REACT_ACT_ENVIRONMENT;
  },
  set(value) {
    if (globalThis.self) {
      Object.defineProperty(globalThis.self, 'IS_REACT_ACT_ENVIRONMENT', {
        configurable: true,
        writable: true,
        value,
      });
    }
  },
});
if (globalThis.self) {
  globalThis.self.IS_REACT_ACT_ENVIRONMENT = true;
}

Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });

const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);

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
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

window.ResizeObserver = ResizeObserver;

// jsdom does not implement scrollIntoView
// See: https://github.com/jsdom/jsdom/issues/1695#issuecomment-449931788
Element.prototype.scrollIntoView = vi.fn();

indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
