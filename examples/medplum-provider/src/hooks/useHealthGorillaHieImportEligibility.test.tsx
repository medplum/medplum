// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { OperationDefinition, Patient } from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from '@medplum/health-gorilla-core';
import { MockClient, TestProject } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import {
  HEALTH_GORILLA_HIE_P360_OPERATION_URL,
  useHealthGorillaHieImportEligibility,
} from './useHealthGorillaHieImportEligibility';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

function patient(value = 'hg-patient-id'): Patient {
  return {
    resourceType: 'Patient',
    id: 'patient-1',
    identifier: [{ system: HEALTH_GORILLA_SYSTEM, value }],
  };
}

function operation(overrides?: Partial<OperationDefinition>): OperationDefinition {
  return {
    resourceType: 'OperationDefinition',
    id: 'p360-operation',
    url: HEALTH_GORILLA_HIE_P360_OPERATION_URL,
    name: 'HealthGorillaPatient360Retrieval',
    status: 'active',
    kind: 'operation',
    code: 'health-gorilla-hie-p360',
    system: false,
    type: false,
    instance: true,
    resource: ['Patient'],
    meta: { project: 'linked-hie-project' },
    ...overrides,
  };
}

describe('useHealthGorillaHieImportEligibility', () => {
  test.each([undefined, '', '   '])('does not check the operation for a blank identifier value (%s)', async (value) => {
    const medplum = new MockClient();
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

  test('requires an active visible Patient instance operation owned by another project', async () => {
    const medplum = new MockClient();
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([operation()] as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.eligible).toBe(true));
    const query = searchSpy.mock.calls[0][1] as URLSearchParams;
    expect(query.get('url')).toBe(HEALTH_GORILLA_HIE_P360_OPERATION_URL);
    expect(query.get('status')).toBe('active');
    expect(searchSpy.mock.calls[0][2]).toEqual({ cache: 'reload' });
  });

  test.each<[string, Partial<OperationDefinition>]>([
    ['active project ownership', { meta: { project: TestProject.id } }],
    ['inactive status', { status: 'draft' }],
    ['wrong operation code', { code: 'another-operation' }],
    ['type operation', { instance: false, type: true }],
    ['wrong resource type', { resource: ['Observation'] }],
    ['missing project provenance', { meta: undefined }],
  ])('rejects a matching operation with %s', async (_label, overrides) => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([operation(overrides)] as any);

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  test('does not retain eligibility while checking a different patient', async () => {
    const medplum = new MockClient();
    let resolveSecond: ((operations: OperationDefinition[]) => void) | undefined;
    const secondSearch = new Promise<OperationDefinition[]>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([operation()] as any)
      .mockReturnValueOnce(secondSearch as any);

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

  test('returns an outcome when the operation capability check fails', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('operation search failed'));

    const { result } = renderHook(() => useHealthGorillaHieImportEligibility(patient()), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.outcome).toBeDefined());
    expect(result.current.eligible).toBe(false);
    expect(result.current.outcome?.issue?.[0]?.details?.text).toContain('operation search failed');
  });
});
