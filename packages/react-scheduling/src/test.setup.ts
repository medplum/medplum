// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// MockClient answers searches from memory by evaluating each search parameter
// against the stored resources, so a parameter it has not indexed matches
// nothing — silently, with an empty bundle rather than an error. Tests that
// search need the bundles indexed up front. `searchScheduleCandidates` finds
// schedules by `Schedule.service-type`, so without this it would appear to find
// no schedules configured for any service.
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}

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

// jsdom does not implement scrollIntoView, which Mantine's Combobox calls when it
// moves the active option.
// See: https://github.com/jsdom/jsdom/issues/1695#issuecomment-449931788
Element.prototype.scrollIntoView = vi.fn();

// MockClient resolves `_sort` and search filters against the global search
// parameter registry, so it has to be indexed before any search runs.
for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
}
