// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError, ReadablePromise, serverError } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import {
  isValueSetUnavailableError,
  useValueSetAvailabilities,
  useValueSetAvailability,
} from './useValueSetAvailability';

const AVAILABLE = 'http://example.com/available';
const MISSING = 'http://example.com/missing';
const OTHER = 'http://example.com/other';

function setup(): { medplum: MockClient; wrapper: ({ children }: { children: ReactNode }) => JSX.Element } {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'valueSetExpand').mockImplementation((params) => {
    if (params.url === MISSING) {
      // Reject via the promise (not a synchronous throw) so the hook's `.then().catch()` probe
      // chain catches it, matching how a real 400 surfaces.
      return new ReadablePromise<ValueSet>(
        Promise.reject(new OperationOutcomeError(badRequest(`ValueSet ${MISSING} not found`)))
      );
    }
    return new ReadablePromise<ValueSet>(
      Promise.resolve({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: { timestamp: new Date().toISOString(), contains: [] },
      })
    );
  });
  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  }
  return { medplum, wrapper };
}

describe('isValueSetUnavailableError', () => {
  test('permanent 400/404 counts as unavailable', () => {
    expect(isValueSetUnavailableError(new OperationOutcomeError(badRequest('nope')))).toBe(true);
  });

  test('transient failure does not count as unavailable', () => {
    expect(isValueSetUnavailableError(new OperationOutcomeError(serverError(new Error('boom'))))).toBe(false);
    expect(isValueSetUnavailableError(new Error('network'))).toBe(false);
  });
});

describe('useValueSetAvailability', () => {
  test('undefined url is always available and never loading', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailability(undefined), { wrapper });
    expect(result.current).toBe(true);
  });

  test('available url resolves to true after probing', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailability(AVAILABLE), { wrapper });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(true));
  });

  test('missing url resolves to false', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailability(MISSING), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  test('transient failure keeps the field available', async () => {
    const { medplum, wrapper } = setup();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(serverError(new Error('boom'))));
    const { result } = renderHook(() => useValueSetAvailability(AVAILABLE), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('useValueSetAvailabilities', () => {
  test('empty list is not loading and returns empty verdicts', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailabilities([]), { wrapper });
    expect(result.current).toEqual({ loading: false, available: [], unavailable: [] });
  });

  test('falsy entries are ignored', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailabilities([undefined, '']), { wrapper });
    expect(result.current).toEqual({ loading: false, available: [], unavailable: [] });
  });

  test('sorts a mix of available and unavailable urls', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useValueSetAvailabilities([AVAILABLE, MISSING, OTHER]), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available.sort()).toEqual([AVAILABLE, OTHER].sort());
    expect(result.current.unavailable).toEqual([MISSING]);
  });

  test('duplicate urls collapse to a single probe', async () => {
    const { medplum, wrapper } = setup();
    const spy = vi.spyOn(medplum, 'valueSetExpand');
    const { result } = renderHook(() => useValueSetAvailabilities([MISSING, MISSING, MISSING]), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toEqual([MISSING]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
