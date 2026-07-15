// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
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

  type SetupOptions = {
    patientRef: Reference<Patient>;
    practitionerRef: Reference<Practitioner> | undefined;
  };

  const setup = (options: SetupOptions): ReturnType<typeof render> => {
    return render(
      <CreateEncounterForm
        appointment={appointment}
        patientRef={options.patientRef}
        practitionerRef={options.practitionerRef}
      />,
      {
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
      }
    );
  };

  test('renders form with required fields', async () => {
    setup({ patientRef, practitionerRef });

    expect(screen.getByText('Set Up Encounter')).toBeInTheDocument();
    expect(screen.getByLabelText(/Encounter Class/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Care template/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  test('Apply button is disabled when class and care template are not selected', async () => {
    setup({ patientRef, practitionerRef });

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('shows warning when practitioner is not set', async () => {
    setup({ patientRef, practitionerRef: undefined });

    const form = screen.getByText('Set Up Encounter').closest('form');
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });

    await waitFor(() => {
      expect(screen.getByText('Appointment has no Practitioner participant')).toBeInTheDocument();
    });
    expect(createEncounter).not.toHaveBeenCalled();
  });

  test('shows warning when required fields are not filled', async () => {
    setup({ patientRef, practitionerRef });

    const form = screen.getByText('Set Up Encounter').closest('form');
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });

    await waitFor(() => {
      expect(screen.getByText('Please fill out required fields.')).toBeInTheDocument();
    });
  });

  test('does not call createEncounter when required fields are not filled', async () => {
    setup({ patientRef, practitionerRef });

    const form = screen.getByText('Set Up Encounter').closest('form');
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });

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

    setup({ patientRef, practitionerRef });

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
