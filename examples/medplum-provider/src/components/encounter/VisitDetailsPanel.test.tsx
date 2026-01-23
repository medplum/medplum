// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Encounter, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisitDetailsPanel } from './VisitDetailsPanel';

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  period: {
    start: '2024-01-01T10:00:00Z',
    end: '2024-01-01T11:00:00Z',
  },
  subject: { reference: 'Patient/patient-123' },
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

describe('VisitDetailsPanel', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
  });

  const setup = (props: Partial<Parameters<typeof VisitDetailsPanel>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <VisitDetailsPanel encounter={mockEncounter} onEncounterChange={vi.fn()} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders visit details title', () => {
    setup();

    expect(screen.getByText('Visit Details')).toBeInTheDocument();
  });

  test('renders practitioner input', () => {
    setup();

    expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
  });

  test('renders check in date input', () => {
    setup();

    expect(screen.getByLabelText(/Check in/i)).toBeInTheDocument();
  });

  test('renders check out date input', () => {
    setup();

    expect(screen.getByLabelText(/Check out/i)).toBeInTheDocument();
  });

  test('calls onEncounterChange when practitioner is changed', async () => {
    const onEncounterChange = vi.fn();

    const mockPractitioner1: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Test' }],
    };

    const mockPractitioner2: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-2',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    };

    await medplum.createResource(mockPractitioner1);
    await medplum.createResource(mockPractitioner2);

    // Mock search to return practitioners
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockPractitioner1, mockPractitioner2] as any);

    // Start without a practitioner selected so ResourceInput shows a searchbox
    setup({ onEncounterChange });

    await waitFor(() => {
      expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
    });

    // Find the ResourceInput searchbox (ResourceInput uses AsyncAutocomplete which renders a searchbox)
    await waitFor(
      () => {
        const searchbox = screen.queryByRole('searchbox');
        expect(searchbox).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const practitionerInput = screen.getByRole('searchbox');

    // Type to search for a practitioner using fireEvent.change (like PlanDefinitionBuilder)
    await act(async () => {
      fireEvent.change(practitionerInput, { target: { value: 'Smith' } });
    });

    // Wait for search to be called
    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Practitioner',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
      },
      { timeout: 3000 }
    );

    // Wait for the dropdown option to appear and click it (like PlanDefinitionBuilder)
    // The display string for Practitioner is typically "Dr. Smith" or just "Smith"
    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    // Verify onEncounterChange was called with updated encounter
    await waitFor(
      () => {
        expect(onEncounterChange).toHaveBeenCalled();
        const call = onEncounterChange.mock.calls[onEncounterChange.mock.calls.length - 1];
        const updatedEncounter = call[0] as Encounter;
        expect(updatedEncounter.participant).toBeDefined();
        expect(updatedEncounter.participant?.[0]?.individual?.reference).toBe('Practitioner/practitioner-2');
      },
      { timeout: 5000 }
    );
  });

  test('calls onEncounterChange when check in time is changed', async () => {
    const user = userEvent.setup();
    const onEncounterChange = vi.fn();
    setup({ onEncounterChange });

    const checkinInput = screen.getByLabelText(/Check in/i);
    await user.clear(checkinInput);
    await user.type(checkinInput, '2024-01-02T10:00:00Z');

    await waitFor(() => {
      expect(onEncounterChange).toHaveBeenCalled();
    });
  });

  test('calls onEncounterChange when check out time is changed', async () => {
    const user = userEvent.setup();
    const onEncounterChange = vi.fn();
    setup({ onEncounterChange });

    const checkoutInput = screen.getByLabelText(/Check out/i);
    await user.clear(checkoutInput);
    await user.type(checkoutInput, '2024-01-02T11:00:00Z');

    await waitFor(() => {
      expect(onEncounterChange).toHaveBeenCalled();
    });
  });

  test('displays default practitioner value', async () => {
    await medplum.createResource(mockPractitioner);
    setup({ practitioner: mockPractitioner });

    await waitFor(() => {
      expect(screen.getByText(/Practitioner/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
    });
  });

  test('displays default check in time', () => {
    setup();

    const checkinInput = screen.getByLabelText(/Check in/i);
    // DateTimeInput converts UTC to local time, so we need to format in local time
    const utcDate = new Date('2024-01-01T10:00:00Z');
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');
    const localTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
    expect(checkinInput).toHaveValue(localTimeString);
  });

  test('displays default check out time', () => {
    setup();

    const checkoutInput = screen.getByLabelText(/Check out/i);
    const utcDate = new Date('2024-01-01T11:00:00Z');
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');
    const localTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
    expect(checkoutInput).toHaveValue(localTimeString);
  });
});
