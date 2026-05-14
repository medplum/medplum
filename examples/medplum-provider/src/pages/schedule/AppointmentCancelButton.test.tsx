// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showErrorNotification } from '../../utils/notifications';
import { AppointmentCancelButton } from './AppointmentCancelButton';

vi.mock('../../utils/notifications');

describe('AppointmentCancelButton', () => {
  let medplum: MockClient;

  const appointment: WithId<Appointment> = {
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start: '2024-01-15T10:00:00Z',
    end: '2024-01-15T10:30:00Z',
    participant: [{ actor: { reference: 'Practitioner/practitioner-1' }, status: 'accepted' }],
  };

  const cancelledAppointment: WithId<Appointment> = { ...appointment, status: 'cancelled' };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type SetupOptions = {
    onCancel?: (appointment: WithId<Appointment>) => void;
  };

  const setup = async (options: SetupOptions = {}): Promise<void> => {
    const { onCancel } = options;
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <AppointmentCancelButton appointment={appointment} onCancel={onCancel} />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('renders Cancel Visit button', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /Cancel Visit/i })).toBeInTheDocument();
  });

  test('calls $cancel endpoint when button is clicked', async () => {
    const user = userEvent.setup();
    medplum.post = vi.fn().mockResolvedValue(cancelledAppointment);

    await setup();
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
    });

    const postUrl = (medplum.post as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(postUrl.toString()).toContain('Appointment/appointment-1/$cancel');
  });

  test('invalidates Appointment and Slot searches on success', async () => {
    const user = userEvent.setup();
    medplum.post = vi.fn().mockResolvedValue(cancelledAppointment);
    medplum.invalidateSearches = vi.fn();

    await setup();
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(medplum.invalidateSearches).toHaveBeenCalledWith('Appointment');
      expect(medplum.invalidateSearches).toHaveBeenCalledWith('Slot');
    });
  });

  test('calls onCancel with the updated appointment on success', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    medplum.post = vi.fn().mockResolvedValue(cancelledAppointment);

    await setup({ onCancel });
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledWith(cancelledAppointment);
    });
  });

  test('does not throw when onCancel is not provided', async () => {
    const user = userEvent.setup();
    medplum.post = vi.fn().mockResolvedValue(cancelledAppointment);

    await setup(); // no onCancel
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
    });
    // No error thrown
  });

  test('shows error notification when $cancel fails', async () => {
    const user = userEvent.setup();
    const cancelError = new Error('Cancel failed');
    medplum.post = vi.fn().mockRejectedValue(cancelError);

    await setup();
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(cancelError);
    });
  });

  test('does not call onCancel when $cancel fails', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    medplum.post = vi.fn().mockRejectedValue(new Error('Cancel failed'));

    await setup({ onCancel });
    await user.click(screen.getByRole('button', { name: /Cancel Visit/i }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalled();
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('button is in loading state while request is in flight', async () => {
    const user = userEvent.setup();
    let resolvePost: (value: WithId<Appointment>) => void;
    const promise = new Promise<WithId<Appointment>>((res) => {
      resolvePost = res;
    });
    medplum.post = vi.fn().mockReturnValue(promise);

    await setup();

    const button = screen.getByRole('button', { name: /Cancel Visit/i });
    await user.click(button);

    // Button should enter loading state (Mantine adds aria-disabled + data-loading)
    await waitFor(() => {
      expect(button).toHaveAttribute('data-loading');
    });

    // Resolve and confirm loading clears
    await act(async () => resolvePost(cancelledAppointment));
    await waitFor(() => {
      expect(button).not.toHaveAttribute('data-loading');
    });
  });
});
