// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { DrAliceSmithSchedule, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AvailabilityManager } from './AvailabilityManager';

describe('AvailabilityManager', () => {
  let medplum: MockClient;

  // Anchor test data to today so the Slots fall inside the calendar's initial visible range.
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  const createSlot = (overrides: Partial<Slot> = {}): WithId<Slot> => ({
    resourceType: 'Slot',
    id: 'test-slot-1',
    status: 'busy',
    schedule: createReference(DrAliceSmithSchedule),
    start: new Date(baseDate.getTime()).toISOString(),
    end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // The hook searches for Slots by schedule + range; default to none unless a test overrides.
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  const setup = async (): Promise<ReturnType<typeof render>> => {
    const result = render(<AvailabilityManager schedule={DrAliceSmithSchedule} />, {
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
    // Wait for the calendar (and its toolbar) to mount.
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
    return result;
  };

  describe('Initial rendering', () => {
    test('renders the panel, help text, and calendar', async () => {
      await setup();

      expect(screen.getByText('Availability Manager')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Blocked Time' })).toBeInTheDocument();
      expect(screen.getByText(/Click and drag across the calendar/i)).toBeInTheDocument();
      expect(screen.getByTestId('calendar')).toBeInTheDocument();
    });

    test('searches for Slots on this schedule within the visible range', async () => {
      await setup();

      await waitFor(() => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Slot',
          expect.arrayContaining([['schedule', `Schedule/${DrAliceSmithSchedule.id}`]])
        );
      });
    });

    test('renders loaded Slots on the calendar', async () => {
      medplum.searchResources = vi.fn().mockResolvedValue([createSlot({ status: 'busy' })]);
      await setup();

      expect(await screen.findByText('Blocked')).toBeInTheDocument();
    });
  });

  describe('Add Blocked Time', () => {
    test('opens the create drawer when clicked', async () => {
      await setup();

      expect(screen.queryByText('Create Slot')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Add Blocked Time' }));

      // Drawer form fields become visible (the drawer mounts via a transition).
      expect(await screen.findByLabelText(/Start/)).toBeInTheDocument();
      expect(screen.getByLabelText(/End/)).toBeInTheDocument();
      // "Create Slot" appears as both the drawer title and the submit button.
      expect(screen.getByRole('button', { name: 'Create Slot' })).toBeInTheDocument();
    });

    test('creates a new Slot and shows a success notification', async () => {
      const createResource = vi.spyOn(medplum, 'createResource').mockResolvedValue(createSlot());
      await setup();

      await userEvent.click(screen.getByRole('button', { name: 'Add Blocked Time' }));
      await screen.findByLabelText(/Start/);

      // Fill in the required start/end times before submitting.
      const startInput = screen.getByLabelText(/Start/);
      const endInput = screen.getByLabelText(/End/);
      await userEvent.type(startInput, '2026-08-01T09:00');
      await userEvent.type(endInput, '2026-08-01T09:30');

      await userEvent.click(screen.getByRole('button', { name: 'Create Slot' }));

      await waitFor(() => {
        expect(createResource).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Slot', status: 'busy' }));
      });
      expect(await screen.findByText('Slot created')).toBeInTheDocument();

      // Drawer closes on success.
      await waitFor(() => {
        expect(screen.queryByText('Create Slot')).not.toBeInTheDocument();
      });
    });

    test('keeps the drawer open and shows an error notification when the save fails', async () => {
      const createResource = vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Network error'));
      await setup();

      await userEvent.click(screen.getByRole('button', { name: 'Add Blocked Time' }));
      await screen.findByLabelText(/Start/);

      const startInput = screen.getByLabelText(/Start/);
      const endInput = screen.getByLabelText(/End/);
      await userEvent.type(startInput, '2026-08-01T09:00');
      await userEvent.type(endInput, '2026-08-01T09:30');

      await userEvent.click(screen.getByRole('button', { name: 'Create Slot' }));

      await waitFor(() => {
        expect(createResource).toHaveBeenCalled();
      });
      expect(await screen.findByText('Network error')).toBeInTheDocument();
      // Drawer stays open so the user can retry.
      expect(screen.getByRole('button', { name: 'Create Slot' })).toBeInTheDocument();
    });
  });

  describe('Editing an existing Slot', () => {
    test('updates the Slot and shows a success notification', async () => {
      const slot = createSlot({ status: 'busy' });
      medplum.searchResources = vi.fn().mockResolvedValue([slot]);
      const updateResource = vi.spyOn(medplum, 'updateResource').mockResolvedValue(slot);
      await setup();

      await userEvent.click(await screen.findByText('Blocked'));
      await userEvent.click(await screen.findByRole('button', { name: 'Update Slot' }));

      await waitFor(() => {
        expect(updateResource).toHaveBeenCalledWith(expect.objectContaining({ id: slot.id }));
      });
      expect(await screen.findByText('Slot updated')).toBeInTheDocument();
    });
  });

  describe('Drawer dismissal', () => {
    test('closes the drawer without saving when dismissed', async () => {
      const createResource = vi.spyOn(medplum, 'createResource');
      await setup();

      await userEvent.click(screen.getByRole('button', { name: 'Add Blocked Time' }));
      expect(await screen.findByLabelText(/Start/)).toBeInTheDocument();

      // Dismiss the drawer with Escape.
      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Start/)).not.toBeInTheDocument();
      });
      expect(createResource).not.toHaveBeenCalled();
    });
  });
});
