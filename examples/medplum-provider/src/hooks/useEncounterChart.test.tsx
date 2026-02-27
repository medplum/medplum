// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
  Appointment,
  ChargeItem,
  Claim,
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
import { getChargeItemsForEncounter } from '../utils/chargeitems';
import { createClaimFromEncounter } from '../utils/claims';
import { showErrorNotification } from '../utils/notifications';
import { useEncounterChart } from './useEncounterChart';

vi.mock('../utils/chargeitems');
vi.mock('../utils/claims');
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

const mockChargeItem: WithId<ChargeItem> = {
  resourceType: 'ChargeItem',
  id: 'charge-item-123',
  status: 'billable',
  subject: { reference: 'Patient/patient-123' },
  code: { text: 'Test Charge' },
};

const mockClaim: WithId<Claim> = {
  resourceType: 'Claim',
  id: 'claim-123',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  created: new Date().toISOString(),
  patient: { reference: 'Patient/patient-123' },
  provider: { reference: 'Practitioner/practitioner-123' },
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  item: [
    {
      sequence: 1,
      encounter: [{ reference: 'Encounter/encounter-123' }],
      productOrService: {
        coding: [{ code: 'CPT', system: 'http://terminology.hl7.org/CodeSystem/cpt' }],
        text: 'CPT Code',
      },
    },
  ],
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
    expect(result.current.claim).toBeUndefined();
    expect(result.current.practitioner).toBeUndefined();
    expect(result.current.tasks).toEqual([]);
    expect(result.current.clinicalImpression).toBeUndefined();
    expect(result.current.chargeItems).toEqual([]);
    expect(result.current.appointment).toBeUndefined();
  });

  test('resolves encounter reference and loads data', async () => {
    // Create resources in MockClient
    const createdEncounter = await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);

    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);

    const encounterRef: Reference<Encounter> = { reference: `Encounter/${createdEncounter.id}` };

    const { result } = renderHook(() => useEncounterChart(encounterRef), { wrapper });

    await waitFor(() => {
      expect(result.current.encounter?.id).toBe(createdEncounter.id);
    });

    await waitFor(() => {
      expect(result.current.chargeItems).toHaveLength(1);
    });
  });

  test('loads charge items for encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.chargeItems).toHaveLength(1);
      expect(result.current.chargeItems[0].id).toBe('charge-item-123');
    });
  });

  test('fetches existing claim for encounter', async () => {
    const createdEncounter = await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    const claimWithEncounter: Claim = {
      ...mockClaim,
      item: [
        {
          sequence: 1,
          encounter: [{ reference: `Encounter/${createdEncounter.id}` }],
          productOrService: {
            coding: [{ code: 'CPT', system: 'http://terminology.hl7.org/CodeSystem/cpt' }],
            text: 'CPT Code',
          },
        },
      ],
    };
    await medplum.createResource(claimWithEncounter);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(createdEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.claim).toBeDefined();
    });
  });

  test('fetches tasks for encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockTask);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

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
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

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
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.clinicalImpression?.id).toBe('clinical-impression-123');
    });
  });

  test('fetches practitioner from encounter participant', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.practitioner?.id).toBe('practitioner-123');
    });
  });

  test('fetches appointment from encounter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockAppointment);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.appointment?.id).toBe('appointment-123');
    });
  });

  test('creates claim when all conditions are met', async () => {
    const newClaim: WithId<Claim> = {
      resourceType: 'Claim',
      id: 'new-claim-123',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      created: new Date().toISOString(),
      patient: { reference: 'Patient/patient-123' },
      provider: { reference: 'Practitioner/practitioner-123' },
      priority: { coding: [{ code: 'normal' }] },
      insurance: [],
    };

    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockPatient);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);
    vi.mocked(createClaimFromEncounter).mockResolvedValue(newClaim);

    const { result } = renderHook(() => useEncounterChart(mockEncounter, mockPatient), { wrapper });

    // Wait for all prerequisites to be met
    await waitFor(() => {
      expect(result.current.chargeItems).toHaveLength(1);
      expect(result.current.practitioner).toBeDefined();
    });

    // Then wait for claim to be created
    await waitFor(() => {
      expect(result.current.claim?.id).toBe('new-claim-123');
    });

    expect(createClaimFromEncounter).toHaveBeenCalledWith(
      medplum,
      expect.objectContaining({ resourceType: 'Patient', id: 'patient-123' }),
      expect.objectContaining({ resourceType: 'Encounter', id: 'encounter-123' }),
      expect.objectContaining({ resourceType: 'Practitioner', id: 'practitioner-123' }),
      [mockChargeItem]
    );
  });

  test('does not create claim if one already exists', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockPatient);
    const createdClaim = await medplum.createResource(mockClaim);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter, mockPatient), { wrapper });

    await waitFor(() => {
      expect(result.current.claim).toBeDefined();
    });

    // Verify the existing claim is found (may have different ID due to MockClient)
    expect(result.current.claim?.id).toBe(createdClaim.id);

    // Verify no new claim is created
    expect(createClaimFromEncounter).not.toHaveBeenCalled();
  });

  test('does not create claim if patient is missing', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.chargeItems).toHaveLength(1);
      expect(result.current.practitioner).toBeDefined();
    });

    // Verify claim was not created and remains undefined
    expect(result.current.claim).toBeUndefined();
    expect(createClaimFromEncounter).not.toHaveBeenCalled();
  });

  test('does not create claim if practitioner is missing', async () => {
    const encounterWithoutPractitioner: WithId<Encounter> = {
      ...mockEncounter,
      participant: [],
    };

    await medplum.createResource(encounterWithoutPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([mockChargeItem]);

    const { result } = renderHook(() => useEncounterChart(encounterWithoutPractitioner, mockPatient), { wrapper });

    await waitFor(() => {
      expect(result.current.chargeItems).toHaveLength(1);
    });

    // Verify no practitioner and no claim
    expect(result.current.practitioner).toBeUndefined();
    expect(result.current.claim).toBeUndefined();
    expect(createClaimFromEncounter).not.toHaveBeenCalled();
  });

  test('does not create claim if charge items are empty', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter, mockPatient), { wrapper });

    await waitFor(() => {
      expect(result.current.practitioner).toBeDefined();
    });

    // Verify no charge items and no claim
    expect(result.current.chargeItems).toEqual([]);
    expect(result.current.claim).toBeUndefined();
    expect(createClaimFromEncounter).not.toHaveBeenCalled();
  });

  test('handles charge item fetch errors gracefully', async () => {
    const error = new Error('Failed to fetch charge items');
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockRejectedValue(error);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalled();
    });

    // Hook should still function with empty charge items
    expect(result.current.encounter).toBeDefined();
    expect(result.current.chargeItems).toEqual([]);
  });

  test('handles search errors gracefully', async () => {
    const error = new Error('Search failed');
    await medplum.createResource(mockEncounter);

    // Mock searchResources to fail
    medplum.searchResources = vi.fn().mockRejectedValue(error);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

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
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const patientRef: Reference<Patient> = { reference: 'Patient/patient-123' };

    const { result } = renderHook(() => useEncounterChart(mockEncounter, patientRef), { wrapper });

    await waitFor(() => {
      expect(result.current.encounter?.id).toBe('encounter-123');
    });
  });

  test('allows manual state updates via setters', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

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

  test('updates claim via setter', async () => {
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockPractitioner);
    vi.mocked(getChargeItemsForEncounter).mockResolvedValue([]);

    const { result } = renderHook(() => useEncounterChart(mockEncounter), { wrapper });

    await waitFor(() => {
      expect(result.current.encounter).toBeDefined();
    });

    expect(result.current.claim).toBeUndefined();

    act(() => {
      result.current.setClaim(mockClaim);
    });

    expect(result.current.claim?.id).toBe('claim-123');
  });
});
