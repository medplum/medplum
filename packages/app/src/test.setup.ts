// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MemoryStorage, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

class Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  signal: any;

  constructor(
    input: string | { url?: string },
    init: { method?: string; headers?: any; body?: any; signal?: any } = {}
  ) {
    this.url = typeof input === 'string' ? input : (input?.url ?? '');
    this.method = (init.method ?? 'GET').toUpperCase();
    this.headers = (init.headers ?? {}) as Record<string, string>;
    this.body = init.body;
    this.signal = init.signal ?? null;
  }

  clone(): Request {
    return new Request(this.url, {
      method: this.method,
      headers: { ...this.headers },
      body: this.body,
      signal: this.signal,
    });
  }
}

Object.defineProperty(globalThis.window, 'Request', { value: Request });
Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });

const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);

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

// jsdom does not implement scrollIntoView
// See: https://github.com/jsdom/jsdom/issues/1695#issuecomment-449931788
Element.prototype.scrollIntoView = jest.fn();

indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
