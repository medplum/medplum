// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { usePatient } from './usePatient';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

describe('usePatient', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({});
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  test('returns undefined when patient ID is not found in params', () => {
    vi.mocked(useParams).mockReturnValue({});

    expect(() => {
      renderHook(() => usePatient(), { wrapper });
    }).toThrow('Patient ID not found');
  });

  test('returns undefined when patient ID is missing but ignoreMissingPatientId is true', () => {
    vi.mocked(useParams).mockReturnValue({});

    const { result } = renderHook(() => usePatient({ ignoreMissingPatientId: true }), { wrapper });

    expect(result.current).toBeUndefined();
  });

  test('loads patient resource by ID from URL params', async () => {
    const mockPatient: WithId<Patient> = {
      resourceType: 'Patient',
      id: 'patient-123',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    await medplum.createResource(mockPatient);
    vi.mocked(useParams).mockReturnValue({ patientId: 'patient-123' });

    const { result } = renderHook(() => usePatient(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current?.id).toBe('patient-123');
      expect(result.current?.name?.[0]?.given?.[0]).toBe('John');
      expect(result.current?.name?.[0]?.family).toBe('Doe');
    });
  });

  test('calls setOutcome callback when patient is not found', async () => {
    const setOutcome = vi.fn();
    vi.mocked(useParams).mockReturnValue({ patientId: 'patient-nonexistent' });

    const { result } = renderHook(() => usePatient({ setOutcome }), { wrapper });

    await waitFor(() => {
      expect(setOutcome).toHaveBeenCalled();
    });

    expect(result.current).toBeUndefined();
  });

  test('handles patient reference correctly', async () => {
    const mockPatient: WithId<Patient> = {
      resourceType: 'Patient',
      id: 'patient-456',
      name: [{ given: ['Jane'], family: 'Smith' }],
    };

    await medplum.createResource(mockPatient);
    vi.mocked(useParams).mockReturnValue({ patientId: 'patient-456' });

    const { result } = renderHook(() => usePatient(), { wrapper });

    await waitFor(() => {
      expect(result.current?.id).toBe('patient-456');
      expect(result.current?.name?.[0]?.given?.[0]).toBe('Jane');
    });
  });
});
