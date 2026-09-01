// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { OperationDefinition, Patient } from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from '@medplum/health-gorilla-core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import {
  HEALTH_GORILLA_HIE_P360_IMPORT_ALL_OPERATION_URL,
  HEALTH_GORILLA_HIE_P360_IMPORT_SELECTIVE_OPERATION_URL,
  HEALTH_GORILLA_HIE_P360_INGEST_SELECTED_OPERATION_URL,
  useHealthGorillaHieImportEligibility,
} from './useHealthGorillaHieImportEligibility';

type OperationKind = 'all' | 'selective' | 'ingest-selected';

const OPERATION_CONFIG: Record<
  OperationKind,
  Pick<OperationDefinition, 'url' | 'code' | 'resource' | 'instance' | 'type'>
> = {
  all: {
    url: HEALTH_GORILLA_HIE_P360_IMPORT_ALL_OPERATION_URL,
    code: 'health-gorilla-hie-p360-import-all',
    resource: ['Patient'],
    instance: true,
    type: false,
  },
  selective: {
    url: HEALTH_GORILLA_HIE_P360_IMPORT_SELECTIVE_OPERATION_URL,
    code: 'health-gorilla-hie-p360-import-selective',
    resource: ['Patient'],
    instance: true,
    type: false,
  },
  'ingest-selected': {
    url: HEALTH_GORILLA_HIE_P360_INGEST_SELECTED_OPERATION_URL,
    code: 'health-gorilla-hie-p360-ingest-selected',
    resource: ['Task'],
    instance: false,
    type: true,
  },
};

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

function createMedplum(): MockClient {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'getProject').mockReturnValue({ resourceType: 'Project', id: '123' });
  return medplum;
}

function patient(value = 'hg-patient-id'): Patient {
  return {
    resourceType: 'Patient',
    id: 'patient-1',
    identifier: [{ system: HEALTH_GORILLA_SYSTEM, value }],
  };
}

function operation(
  kind: OperationKind,
  overrides?: Partial<OperationDefinition>,
  projectId = 'linked-hie-project'
): OperationDefinition {
  const config = OPERATION_CONFIG[kind];
  return {
    resourceType: 'OperationDefinition',
    id: `p360-${kind}-operation`,
    name: `HealthGorillaPatient360${kind}`,
    status: 'active',
    kind: 'operation',
    system: false,
    meta: { project: projectId },
    ...config,
    ...overrides,
  };
}

function completeOperationSet(projectId = 'linked-hie-project'): OperationDefinition[] {
  return [
    operation('all', undefined, projectId),
    operation('selective', undefined, projectId),
    operation('ingest-selected', undefined, projectId),
  ];
}

describe('useHealthGorillaHieImportEligibility', () => {
  test.each([undefined, '', '   '])('does not check the operation for a blank identifier value (%s)', async (value) => {
    const medplum = createMedplum();
    const searchSpy = vi.spyOn(medplum, 'searchResources');
    const input =
      value === undefined ? { ...patient(), identifier: [{ system: HEALTH_GORILLA_SYSTEM }] } : patient(value);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(input), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasHealthGorillaIdentifier).toBe(false);
    expect(result.current.eligible).toBe(false);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  test('requires all three active linked-project operations', async () => {
    const medplum = createMedplum();
    const operations = completeOperationSet();
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockImplementation(((_resourceType, query) => {
      const url = (query as URLSearchParams).get('url');
      return Promise.resolve(operations.filter((candidate) => candidate.url === url));
    }) as typeof medplum.searchResources);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.eligible).toBe(true));
    expect(searchSpy).toHaveBeenCalledTimes(3);
    expect(searchSpy.mock.calls.map((call) => (call[1] as URLSearchParams).get('url'))).toEqual([
      HEALTH_GORILLA_HIE_P360_IMPORT_ALL_OPERATION_URL,
      HEALTH_GORILLA_HIE_P360_IMPORT_SELECTIVE_OPERATION_URL,
      HEALTH_GORILLA_HIE_P360_INGEST_SELECTED_OPERATION_URL,
    ]);
    for (const call of searchSpy.mock.calls) {
      expect((call[1] as URLSearchParams).get('status')).toBe('active');
      expect(call[2]).toEqual({ cache: 'reload' });
    }
  });

  test.each<OperationKind>(['all', 'selective', 'ingest-selected'])(
    'rejects a missing %s operation',
    async (missing) => {
      const medplum = createMedplum();
      const operations = completeOperationSet().filter((candidate) => candidate.id !== `p360-${missing}-operation`);
      vi.spyOn(medplum, 'searchResources').mockResolvedValue(operations as any);

      const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
        wrapper: wrapper(medplum),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.eligible).toBe(false);
    }
  );

  test('requires all operations to be owned by the same linked project', async () => {
    const medplum = createMedplum();
    const operations = [
      operation('all'),
      operation('selective'),
      operation('ingest-selected', undefined, 'different-linked-project'),
    ];
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(operations as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  test.each<[OperationKind, string, Partial<OperationDefinition>]>([
    ['all', 'active project ownership', { meta: { project: '123' } }],
    ['selective', 'inactive status', { status: 'draft' }],
    ['ingest-selected', 'wrong operation code', { code: 'another-operation' }],
    ['all', 'type operation', { instance: false, type: true }],
    ['selective', 'wrong resource type', { resource: ['Observation'] }],
    ['ingest-selected', 'instance operation', { instance: true, type: false }],
    ['ingest-selected', 'missing project provenance', { meta: undefined }],
  ])('rejects the %s operation with %s', async (kind, _label, overrides) => {
    const medplum = createMedplum();
    const operations = completeOperationSet().map((candidate) =>
      candidate.id === `p360-${kind}-operation` ? { ...candidate, ...overrides } : candidate
    );
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(operations as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  test('allows linked operations even when active-project copies are also visible', async () => {
    const medplum = createMedplum();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      ...completeOperationSet(),
      ...completeOperationSet('123'),
    ] as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.eligible).toBe(true));
  });

  test('does not let the retired legacy operation confer eligibility', async () => {
    const medplum = createMedplum();
    const legacy: OperationDefinition = {
      ...operation('all'),
      id: 'legacy-operation',
      url: 'https://medplum.com/fhir/OperationDefinition/health-gorilla-hie-p360',
      code: 'health-gorilla-hie-p360',
      status: 'retired',
    };
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([legacy] as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  test('does not retain eligibility while checking a different patient', async () => {
    const medplum = createMedplum();
    let searchCount = 0;
    let resolveSecond: ((operations: OperationDefinition[]) => void) | undefined;
    const secondSearch = new Promise<OperationDefinition[]>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(medplum, 'searchResources').mockImplementation((() => {
      searchCount += 1;
      return searchCount <= 3 ? Promise.resolve(completeOperationSet()) : secondSearch;
    }) as unknown as typeof medplum.searchResources);

    const firstPatient = patient();
    const { result, rerender } = renderHook(
      ({ currentPatient }) => useHealthGorillaHieImportEligibility(currentPatient),
      { wrapper: wrapper(medplum), initialProps: { currentPatient: firstPatient } }
    );
    await waitFor(() => expect(result.current.eligible).toBe(true));

    rerender({ currentPatient: { ...firstPatient, id: 'patient-2' } });
    expect(result.current.eligible).toBe(false);
    expect(result.current.loading).toBe(true);
    resolveSecond?.([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  test('returns an outcome when any operation capability check fails', async () => {
    const medplum = createMedplum();
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('operation search failed'));

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.outcome).toBeDefined());
    expect(result.current.eligible).toBe(false);
    expect(result.current.outcome?.issue?.[0]?.details?.text).toContain('operation search failed');
  });
});
