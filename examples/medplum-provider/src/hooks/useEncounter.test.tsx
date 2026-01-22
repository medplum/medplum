// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useEncounter } from './useEncounter';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

describe('useEncounter', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({});
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  test('returns undefined when encounter ID is not found in params', () => {
    vi.mocked(useParams).mockReturnValue({});

    const { result } = renderHook(() => useEncounter(), { wrapper });

    expect(result.current).toBeUndefined();
  });

  test('loads encounter resource by ID from URL params', async () => {
    const mockEncounter: WithId<Encounter> = {
      resourceType: 'Encounter',
      id: 'encounter-123',
      status: 'in-progress',
      class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
      subject: { reference: 'Patient/patient-123' },
    };

    await medplum.createResource(mockEncounter);
    vi.mocked(useParams).mockReturnValue({ encounterId: 'encounter-123' });

    const { result } = renderHook(() => useEncounter(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current?.id).toBe('encounter-123');
      expect(result.current?.status).toBe('in-progress');
      expect(result.current?.class?.code).toBe('AMB');
    });
  });

  test('handles different encounter IDs correctly', async () => {
    const mockEncounter: WithId<Encounter> = {
      resourceType: 'Encounter',
      id: 'encounter-456',
      status: 'finished',
      class: { code: 'IMP', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
      subject: { reference: 'Patient/patient-456' },
    };

    await medplum.createResource(mockEncounter);
    vi.mocked(useParams).mockReturnValue({ encounterId: 'encounter-456' });

    const { result } = renderHook(() => useEncounter(), { wrapper });

    await waitFor(() => {
      expect(result.current?.id).toBe('encounter-456');
      expect(result.current?.status).toBe('finished');
      expect(result.current?.class?.code).toBe('IMP');
    });
  });

  test('returns undefined when encounter does not exist', async () => {
    vi.mocked(useParams).mockReturnValue({ encounterId: 'encounter-nonexistent' });

    const { result } = renderHook(() => useEncounter(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });
});
