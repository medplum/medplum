// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
  Appointment,
  ClinicalImpression,
  Encounter,
  Patient,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../utils/notifications';
import { useEncounterChart } from './useEncounterChart';

vi.mock('../utils/notifications');

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  subject: { reference: 'Patient/patient-123' },
  participant: [
    {
      individual: { reference: 'Practitioner/practitioner-123' },
    },
  ],
  appointment: [{ reference: 'Appointment/appointment-123' }],
};

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['Test'], family: 'Patient' }],
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

const mockAppointment: Appointment = {
  resourceType: 'Appointment',
  id: 'appointment-123',
  status: 'booked',
  participant: [],
};

const mockTask: Task = {
  resourceType: 'Task',
  id: 'task-123',
  status: 'in-progress',
  intent: 'order',
  encounter: { reference: 'Encounter/encounter-123' },
  authoredOn: '2024-01-01T10:00:00Z',
};

const mockClinicalImpression: ClinicalImpression = {
  resourceType: 'ClinicalImpression',
  id: 'clinical-impression-123',
  status: 'completed',
  subject: { reference: 'Patient/patient-123' },
  encounter: { reference: 'Encounter/encounter-123' },
};

describe('useEncounterChart', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  test('returns initial state when no encounter provided', () => {
    const { result } = renderHook(() => useEncounterChart(undefined), { wrapper });

    expect(result.current.encounter).toBeUndefined();
    expect(result.current.practitioner).toBeUndefined();
    expect(result.current.tasks).toEqual([]);
    expect(result.current.clinicalImpression).toBeUndefined();
    expect(result.current.appointment).toBeUndefined();
  });

  test('resolves encounter reference and loads data', async () => {
    // Create resources in MockClient
    const createdEncounter = await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    const encounterRef: Reference<Encounter> = { reference: `Encounter/${createdEncounter.id}` };

    const { result } = renderHook(() => useEncounterChart(encounterRef), { wrapper });

    await waitFor(() => {
      expect(result.current.encounter?.id).toBe(createdEncounter.id);
    });
  });

  test('fetches tasks for encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockTask);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe('task-123');
    });
  });

  test('sorts tasks by authoredOn date', async () => {
    const olderTask: Task = {
      ...mockTask,
      id: 'task-old',
      authoredOn: '2024-01-01T08:00:00Z',
    };
    const newerTask: Task = {
      ...mockTask,
      id: 'task-new',
      authoredOn: '2024-01-01T12:00:00Z',
    };

    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(newerTask);
    await medplum.createResource(olderTask);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
      expect(result.current.tasks[0].id).toBe('task-old');
      expect(result.current.tasks[1].id).toBe('task-new');
    });
  });

  test('fetches clinical impression for encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockClinicalImpression);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.clinicalImpression?.id).toBe('clinical-impression-123');
    });
  });

  test('creates a clinical impression when the encounter has none', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    const createSpy = vi.spyOn(medplum, 'createResourceIfNoneExist');

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.clinicalImpression?.id).toBeDefined();
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'ClinicalImpression',
        status: 'in-progress',
        subject: { reference: 'Patient/patient-123' },
        encounter: { reference: 'Encounter/encounter-123' },
      }),
      'encounter=Encounter/encounter-123'
    );
    expect(result.current.clinicalImpression?.status).toBe('in-progress');
  });

  test('does not create a clinical impression when the encounter has no subject', async () => {
    const encounterWithoutSubject: WithId<Encounter> = {
      ...mockEncounter,
      id: 'encounter-no-subject',
      subject: undefined,
    };
    await medplum.createResource(encounterWithoutSubject);
    await medplum.createResource(mockPractitioner);
    const searchSpy = vi.spyOn(medplum, 'searchResources');
    const createSpy = vi.spyOn(medplum, 'createResourceIfNoneExist');

    const { result } = renderHook(() => useEncounterChart(encounterWithoutSubject), { wrapper });

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalledWith(
        'ClinicalImpression',
        'encounter=Encounter/encounter-no-subject',
        expect.any(Object)
      );
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.current.clinicalImpression).toBeUndefined();
  });

  test('ignores results that resolve after the hook unmounts', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    const resolveSearches: ((value: never[]) => void)[] = [];
    vi.spyOn(medplum, 'searchResources').mockImplementation(
      () =>
        new Promise<never[]>((resolve) => {
          resolveSearches.push(resolve);
        }) as any
    );
    const createSpy = vi.spyOn(medplum, 'createResourceIfNoneExist');

    const { result, unmount } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'ClinicalImpression',
        expect.any(String),
        expect.any(Object)
      );
    });

    unmount();
    await act(async () => {
      resolveSearches.forEach((resolve) => resolve([]));
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.current.tasks).toEqual([]);
    expect(result.current.clinicalImpression).toBeUndefined();
  });

  test('ignores a clinical impression created after the hook unmounts', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    let resolveCreate: (value: ClinicalImpression) => void = () => undefined;
    const createSpy = vi.spyOn(medplum, 'createResourceIfNoneExist').mockImplementation(
      () =>
        new Promise<ClinicalImpression>((resolve) => {
          resolveCreate = resolve;
        }) as any
    );

    const { result, unmount } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });

    unmount();
    await act(async () => {
      resolveCreate({ ...mockClinicalImpression, id: 'late-impression' });
    });

    expect(result.current.clinicalImpression).toBeUndefined();
  });

  test('does not create a clinical impression when one already exists', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockClinicalImpression);
    const createSpy = vi.spyOn(medplum, 'createResourceIfNoneExist');

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.clinicalImpression?.id).toBe('clinical-impression-123');
    });

    expect(createSpy).not.toHaveBeenCalled();
  });

  test('fetches practitioner from encounter participant', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.practitioner?.id).toBe('practitioner-123');
    });
  });

  test('fetches appointment from encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockAppointment);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.appointment?.id).toBe('appointment-123');
    });
  });

  test('handles search errors gracefully', async () => {
    const error = new Error('Search failed');
    await medplum.createResource(mockEncounter);

    // Mock searchResources to fail
    medplum.searchResources = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalled();
    });

    // Hook should still have the encounter
    expect(result.current.encounter?.id).toBe('encounter-123');
    expect(result.current.tasks).toEqual([]);
    expect(result.current.clinicalImpression).toBeUndefined();
  });

  test('resolves patient reference when provided', async () => {
    await medplum.createResource(mockPatient);
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.encounter?.id).toBe('encounter-123');
    });
  });

  test('allows manual state updates via setters', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    const { result } = renderHook(() => useEncounterChart(undefined), { wrapper });

    expect(result.current.encounter).toBeUndefined();

    const updatedEncounter: WithId<Encounter> = {
      ...mockEncounter,
      status: 'finished',
    };

    act(() => {
      result.current.setEncounter(updatedEncounter);
    });

    expect(result.current.encounter?.status).toBe('finished');
  });
});
