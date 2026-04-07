// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType, MedplumClient } from '@medplum/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAvailableTables } from './useAvailableTables';

describe('useAvailableTables', () => {
  let medplum: MedplumClient;
  let onChange: jest.Mock;
  let onError: jest.Mock;

  beforeEach(() => {
    onChange = jest.fn();
    onError = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Loads resource types and transforms to tables', async () => {
    const fetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: {
              timestamp: '2021-01-01T00:00:00.000Z',
              contains: [{ code: 'Patient' }, { code: 'Observation' }],
            },
          }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const tables = onChange.mock.calls[0][0];
    expect(tables).toContain('Patient');
    expect(tables).toContain('Patient_History');
    expect(tables).toContain('Patient_References');
    expect(tables).toContain('Observation');
    expect(tables).toContain('Observation_History');
    expect(tables).toContain('Observation_References');
    expect(tables).toContain('Address');
    expect(tables).toContain('ContactPoint');
    expect(tables).toContain('HumanName');
    expect(tables).toContain('Coding');
    expect(tables).toContain('Coding_Property');
    expect(tables).toContain('DatabaseMigration');
  });

  test('Calls onError when request fails', async () => {
    const fetch = jest.fn(async () => {
      throw new Error('Network error');
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange, onError }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('Logs to console.error when onError not provided', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const fetch = jest.fn(async () => {
      throw new Error('Network error');
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange }));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('Handles empty expansion', async () => {
    const fetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: {
              timestamp: '2021-01-01T00:00:00.000Z',
              contains: [],
            },
          }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const tables = onChange.mock.calls[0][0];
    // Should still have static tables even with no resource types
    expect(tables).toContain('Address');
    expect(tables).toContain('ContactPoint');
  });

  test('Handles undefined expansion', async () => {
    const fetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
          }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const tables = onChange.mock.calls[0][0];
    // Should still have static tables
    expect(tables).toContain('Address');
  });

  test('Handles contains with undefined codes', async () => {
    const fetch = jest.fn(async (url: string) => {
      if (url.includes('ValueSet/$expand')) {
        return {
          status: 200,
          headers: {
            get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
          },
          json: async () => ({
            resourceType: 'ValueSet',
            status: 'active',
            expansion: {
              timestamp: '2021-01-01T00:00:00.000Z',
              contains: [{ code: 'Patient' }, { display: 'No code' }, { code: undefined }],
            },
          }),
        };
      }
      return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
    });

    medplum = new MedplumClient({ fetch });

    renderHook(() => useAvailableTables({ medplum, onChange }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const tables = onChange.mock.calls[0][0];
    expect(tables).toContain('Patient');
    // Should not have undefined entries
    expect(tables.includes(undefined)).toBe(false);
  });

  test('Reacts to medplum client changes', async () => {
    const createFetch = (
      resourceTypes: string[]
    ): ((url: string) => Promise<{ status: number; headers: any; json: () => Promise<any> }>) =>
      jest.fn(async (url: string) => {
        if (url.includes('ValueSet/$expand')) {
          return {
            status: 200,
            headers: {
              get: (name: string) => ({ 'content-type': ContentType.FHIR_JSON })[name],
            },
            json: async () => ({
              resourceType: 'ValueSet',
              status: 'active',
              expansion: {
                timestamp: '2021-01-01T00:00:00.000Z',
                contains: resourceTypes.map((code) => ({ code })),
              },
            }),
          };
        }
        return { status: 404, headers: { get: () => undefined }, json: async () => ({}) };
      });

    const medplum1 = new MedplumClient({ fetch: createFetch(['Patient']) });
    const medplum2 = new MedplumClient({ fetch: createFetch(['Observation']) });

    const { rerender } = renderHook(({ medplum, onChange }) => useAvailableTables({ medplum, onChange }), {
      initialProps: { medplum: medplum1, onChange },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    expect(onChange.mock.calls[0][0]).toContain('Patient');
    expect(onChange.mock.calls[0][0]).not.toContain('Observation');

    await act(async () => {
      rerender({ medplum: medplum2, onChange });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    expect(onChange.mock.calls[1][0]).toContain('Observation');
    expect(onChange.mock.calls[1][0]).not.toContain('Patient');
  });
});
