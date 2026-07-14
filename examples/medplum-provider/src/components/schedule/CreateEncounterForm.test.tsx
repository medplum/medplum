// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { Appointment, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { CreateEncounterForm } from './CreateEncounterForm';

vi.mock('../../utils/notifications');
vi.mock('../../utils/encounter', () => ({
  createEncounter: vi.fn(),
  encounterUrl: vi.fn().mockReturnValue('/Patient/patient-1/Encounter/enc-1'),
}));

describe('CreateEncounterForm', () => {
  let medplum: MockClient;

  const patientRef: Reference<Patient> = { reference: 'Patient/patient-1' };
  const practitionerRef: Reference<Practitioner> = { reference: 'Practitioner/practitioner-1' };
  const appointment: WithId<Appointment> = {
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start: '2024-01-15T10:00:00Z',
    end: '2024-01-15T10:30:00Z',
    participant: [
      { actor: patientRef, status: 'accepted' },
      { actor: practitionerRef, status: 'accepted' },
    ],
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    // Prevent notifications from leaking across test cases
    notifications.clean();
  });

  const setup = (appointment: WithId<Appointment>): ReturnType<typeof render> => {
    return render(<CreateEncounterForm appointment={appointment} />, {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              {children}
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      ),
    });
  };

  test('renders form with required fields', async () => {
    setup(appointment);

    expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
    expect(screen.getByLabelText(/Encounter Class/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Care template/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  test('Apply button is disabled when class is not selected', async () => {
    setup(appointment);

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('Apply button is enabled once class is selected without a care template', async () => {
    const user = userEvent.setup();
    setup(appointment);

    const classInput = screen.getByLabelText(/Encounter Class/i);
    await user.type(classInput, 'Test');
    await waitFor(() => {
      expect(screen.getByText('Test Display')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Test Display'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });
  });

  test('calls createEncounter without a care template selected', async () => {
    const user = userEvent.setup();
    vi.mocked(createEncounter).mockResolvedValue({
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: {},
    });

    setup(appointment);

    const classInput = screen.getByLabelText(/Encounter Class/i);
    await user.type(classInput, 'Test');
    await waitFor(() => {
      expect(screen.getByText('Test Display')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Test Display'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(createEncounter).toHaveBeenCalledWith(
        medplum,
        expect.anything(),
        patientRef,
        undefined,
        appointment,
        practitionerRef
      );
    });
  });

  test('shows alert when no practitioner is in appointment.participants', async () => {
    const practitionerless = {
      ...appointment,
      participant: appointment.participant.filter((p) => !isReference(p.actor, 'Practitioner')),
    };
    setup(practitionerless);

    expect(screen.getByText('No Practitioner to create Encounter.')).toBeInTheDocument();
    expect(screen.queryByText('Set Up Encounter')).not.toBeInTheDocument();
  });

  test('shows alert when multiple practitioners are in appointment.participants', async () => {
    const practitionerful = {
      ...appointment,
      participant: [
        ...appointment.participant,
        {
          actor: { reference: 'Practitioner/practitioner-2' },
          status: 'accepted',
        },
      ],
    } satisfies Appointment;
    setup(practitionerful);

    expect(screen.getByText('Too many Practitioners to create Encounter.')).toBeInTheDocument();
    expect(screen.queryByText('Set Up Encounter')).not.toBeInTheDocument();
  });

  test('shows alert when multiple patients are in appointment.participants', async () => {
    const patientful = {
      ...appointment,
      participant: [
        ...appointment.participant,
        {
          actor: { reference: 'Patient/patient-2' },
          status: 'accepted',
        },
      ],
    } satisfies Appointment;
    setup(patientful);

    expect(screen.getByText('Too many Patients to create Encounter.')).toBeInTheDocument();
    expect(screen.queryByText('Set Up Encounter')).not.toBeInTheDocument();
  });

  test('when required fields are not filled', async () => {
    setup(appointment);

    const form = screen.getByText('Set Up Encounter').closest('form');
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });

    // it shows a warning
    await waitFor(() => {
      expect(screen.getByText('Please fill out required fields.')).toBeInTheDocument();
    });

    // it did not invoke `createEncounter`
    expect(createEncounter).not.toHaveBeenCalled();
  });

  test('shows error notification on createEncounter failure', async () => {
    const user = userEvent.setup();

    await medplum.createResource({
      resourceType: 'PlanDefinition',
      name: 'Test Plan',
      title: 'Test Plan',
      status: 'active',
    });

    const encounterError = new Error('Failed to create encounter');
    vi.mocked(createEncounter).mockRejectedValue(encounterError);

    setup(appointment);

    // Fill in Encounter Class — MockClient's ValueSet expansion returns 'Test Display'
    const classInput = screen.getByLabelText(/Encounter Class/i);
    await user.type(classInput, 'Test');
    await waitFor(() => {
      expect(screen.getByText('Test Display')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Test Display'));

    // Fill in Care template
    const templateInput = screen.getByLabelText(/Care template/i);
    await user.type(templateInput, 'Test Plan');
    await waitFor(() => {
      expect(screen.getByText('Test Plan')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Test Plan'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(encounterError);
    });
  });
});
