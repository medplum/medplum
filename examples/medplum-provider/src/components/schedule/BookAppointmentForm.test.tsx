// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../../utils/notifications';
import { BookAppointmentForm } from './BookAppointmentForm';

vi.mock('../../utils/notifications');

describe('BookAppointmentForm', () => {
  let medplum: MockClient;

  const slot: Slot = {
    resourceType: 'Slot',
    id: 'slot-1',
    start: '2026-02-20T13:00:00Z',
    end: '2026-02-20T13:30:00Z',
    schedule: { reference: 'Schedule/schedule-1' },
    status: 'free',
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type SetupOptions = {
    onSuccess?: (result: { appointments: Appointment[]; slots: Slot[] }) => void;
  };

  const setup = async (options: SetupOptions = {}): Promise<void> => {
    const { onSuccess } = options;
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <BookAppointmentForm slot={slot} onSuccess={onSuccess} />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('renders patient input and submit button', async () => {
    await setup();

    expect(screen.getByLabelText('Patient *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Appointment' })).toBeInTheDocument();
  });

  test('displays the slot time period', async () => {
    await setup();

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  test('does not call $book when no patient is selected', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    medplum.post = vi.fn();

    await setup({ onSuccess });

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    expect(medplum.post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('calls $book with correct parameters when patient is selected', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const mockBookResponse: Bundle<Appointment | Slot> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Appointment',
            id: 'appointment-1',
            status: 'booked',
            start: slot.start,
            end: slot.end,
            participant: [],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            id: 'slot-1',
            status: 'busy',
            start: slot.start,
            end: slot.end,
            schedule: { reference: 'Schedule/schedule-1' },
          },
        },
      ],
    };

    medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

    await setup({ onSuccess });

    // Select a patient via the ResourceInput autocomplete
    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    // Submit the form
    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    // Verify the $book call
    expect(medplum.post).toHaveBeenCalledWith(
      new URL('https://example.com/fhir/R4/Appointment/$book'),
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([
          { name: 'slot', resource: slot },
          {
            name: 'patient-reference',
            valueReference: expect.objectContaining({ reference: `Patient/${HomerSimpson.id}` }),
          },
        ]),
      })
    );
  });

  test('calls onSuccess with appointments and slots from the response', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const bookedAppointment: Appointment = {
      resourceType: 'Appointment',
      id: 'appointment-1',
      status: 'booked',
      start: slot.start,
      end: slot.end,
      participant: [],
    };

    const busySlot: Slot = {
      resourceType: 'Slot',
      id: 'slot-1',
      status: 'busy',
      start: slot.start,
      end: slot.end,
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const bufferAfterSlot: Slot = {
      resourceType: 'Slot',
      id: 'slot-2',
      status: 'busy-unavailable',
      start: slot.end,
      end: '2026-02-01T13:45:00Z',
      schedule: { reference: 'Schedule/schedule-1' },
    };

    const mockBookResponse: Bundle<Appointment | Slot> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: bookedAppointment }, { resource: busySlot }, { resource: bufferAfterSlot }],
    };

    medplum.post = vi.fn().mockResolvedValue(mockBookResponse);

    await setup({ onSuccess });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        appointments: [bookedAppointment],
        slots: [busySlot, bufferAfterSlot],
      });
    });
  });

  test('shows error notification when $book fails', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const bookError = new Error('Network error');

    medplum.post = vi.fn().mockRejectedValue(bookError);

    await setup({ onSuccess });

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(bookError);
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('shows loading state while booking is in-flight', async () => {
    const user = userEvent.setup();

    // Use a promise we control to keep the booking in-flight
    let resolveBook: (value: Bundle) => void;
    medplum.post = vi.fn().mockImplementation(
      () =>
        new Promise<Bundle>((resolve) => {
          resolveBook = resolve;
        })
    );

    await setup();

    const patientInput = screen.getByRole('searchbox');
    await user.type(patientInput, 'Homer');

    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Homer Simpson'));

    await user.click(screen.getByRole('button', { name: 'Create Appointment' }));

    // While the request is in-flight, the submit button should be disabled with a loading indicator
    const button = screen.getByRole('button', { name: 'Create Appointment' });
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-loading', 'true');
    });

    // Resolve the booking to clean up
    await act(async () => {
      resolveBook({ resourceType: 'Bundle', type: 'collection', entry: [] });
    });

    // After completion, the button should no longer be loading
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Appointment' })).not.toBeDisabled();
    });
  });
});
