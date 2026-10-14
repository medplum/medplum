// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { formatZonedDateTimeInput } from '../AppointmentFinder/AppointmentFinder.times';
import { DrRiveraPractitioner, DrRiveraSchedule, SchedulingFixtures } from '../stories/scheduling';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';
import { formatWhen } from './SchedulingWorkspace.utils';

// The calendar opens on today, so everything is dated into the week on screen.
const TODAY_AT = (hours: number, minutes = 0): string =>
  new Date(new Date().setHours(hours, minutes, 0, 0)).toISOString();

const BLOCKED_SLOT: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-rivera-lunch',
  status: 'busy-unavailable',
  start: TODAY_AT(12),
  end: TODAY_AT(13),
  schedule: createReference(DrRiveraSchedule),
  comment: 'Lunch',
};

const APPOINTMENT: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera',
  status: 'booked',
  start: TODAY_AT(10),
  end: TODAY_AT(11),
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-cooper', display: 'Miles Cooper' } },
    { status: 'accepted', actor: createReference(DrRiveraPractitioner) },
  ],
};

let medplum: MockClient;

beforeEach(async () => {
  medplum = new MockClient();
  for (const resource of [...SchedulingFixtures, BLOCKED_SLOT, APPOINTMENT]) {
    await medplum.createResource(resource);
  }
});

function slotDetails(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Blocked time details' });
}

/**
 * Replaces what a field holds with the given text.
 * @param field - The field to type into.
 * @param text - What it should hold.
 */
async function retype(field: HTMLElement, text: string): Promise<void> {
  await userEvent.clear(field);
  if (text) {
    await userEvent.type(field, text);
  }
}

function appointmentDetails(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Appointment details' });
}

describe('SchedulingWorkspace blocked time details', () => {
  test('clicking blocked time opens its details, in the pane appointments use', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    expect(pane.getByText('busy-unavailable')).toBeInTheDocument();
    expect(await pane.findByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(pane.getByText(formatWhen(BLOCKED_SLOT) as string)).toBeInTheDocument();
    expect(pane.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Blocked').closest('.slot')).toHaveClass('selected');

    // An appointment takes the pane over, and the selection with it, and blocked time takes it back.
    await userEvent.click(screen.getByText('Miles Cooper'));
    expect(appointmentDetails()).toBeInTheDocument();
    expect(slotDetails()).not.toBeInTheDocument();
    expect(screen.getByText('Miles Cooper').closest('.appointment')).toHaveClass('selected');
    expect(screen.getByText('Blocked').closest('.slot')).not.toHaveClass('selected');
    await userEvent.click(screen.getByText('Blocked'));
    expect(slotDetails()).toBeInTheDocument();
    expect(appointmentDetails()).not.toBeInTheDocument();

    // Paging away closes it, and paging back does not open it again.
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(slotDetails()).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Blocked');
    expect(slotDetails()).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Blocked'));
    await userEvent.click(screen.getByRole('button', { name: 'Close blocked time details' }));
    await waitFor(() => expect(slotDetails()).not.toBeInTheDocument());
    expect(screen.getByText('Blocked').closest('.slot')).not.toHaveClass('selected');
  });

  test('editing moves blocked time and changes its notes', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    const save = (): HTMLElement => pane.getByRole('button', { name: 'Save Changes' });
    // Editing waits until no appointment is found holding the slot.
    await waitFor(() => expect(pane.getByRole('button', { name: 'Edit' })).toBeEnabled());

    // Cancelling leaves the slot as it was.
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    expect(save()).toBeDisabled();
    await userEvent.click(pane.getByRole('button', { name: 'Cancel' }));
    expect(pane.queryByLabelText('Starts')).not.toBeInTheDocument();
    expect(pane.getByText(formatWhen(BLOCKED_SLOT) as string)).toBeInTheDocument();

    // It cannot end before it starts.
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    await retype(pane.getByLabelText('Ends'), formatZonedDateTimeInput(new Date(TODAY_AT(11))));
    expect(pane.getByText('Must end after it starts.')).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await retype(pane.getByLabelText('Ends'), formatZonedDateTimeInput(new Date(TODAY_AT(13, 30))));
    await retype(pane.getByLabelText('Notes'), 'Long lunch');
    await userEvent.click(save());

    const moved = { start: BLOCKED_SLOT.start, end: TODAY_AT(13, 30) };
    expect(await pane.findByText(formatWhen(moved) as string)).toBeInTheDocument();
    expect(pane.getByText('Long lunch')).toBeInTheDocument();
    const stored = await medplum.readResource('Slot', BLOCKED_SLOT.id);
    expect(new Date(stored.end).getTime()).toBe(new Date(moved.end).getTime());
    expect(stored.comment).toBe('Long lunch');

    // Clearing the notes leaves the comment off.
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    await retype(pane.getByLabelText('Notes'), '');
    await userEvent.click(save());
    await waitFor(() => expect(pane.queryByText('Long lunch')).not.toBeInTheDocument());
    expect(pane.queryByText('Notes')).not.toBeInTheDocument();
    expect((await medplum.readResource('Slot', BLOCKED_SLOT.id)).comment).toBeUndefined();

    // A change made elsewhere since the slot was loaded is refused rather than overwritten.
    const current = await medplum.repo.readResource<Slot>('Slot', BLOCKED_SLOT.id);
    await medplum.repo.updateResource<Slot>({ ...current, comment: 'Staff meeting' });
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    await retype(pane.getByLabelText('Notes'), 'Dentist');
    await userEvent.click(save());
    expect(await pane.findByText('This blocked time changed since you opened it')).toBeInTheDocument();
    expect((await medplum.repo.readResource<Slot>('Slot', BLOCKED_SLOT.id)).comment).toBe('Staff meeting');

    // Reloading shows the newer version, which can then be edited.
    await userEvent.click(pane.getByRole('button', { name: 'Reload' }));
    expect(await pane.findByText('Staff meeting')).toBeInTheDocument();
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    await retype(pane.getByLabelText('Notes'), 'Dentist');
    await userEvent.click(save());
    expect(await pane.findByText('Dentist')).toBeInTheDocument();
    expect((await medplum.readResource('Slot', BLOCKED_SLOT.id)).comment).toBe('Dentist');

    // Reloading one deleted elsewhere takes it off the calendar.
    const latest = await medplum.repo.readResource<Slot>('Slot', BLOCKED_SLOT.id);
    await medplum.repo.updateResource<Slot>({ ...latest, comment: 'Out sick' });
    await userEvent.click(pane.getByRole('button', { name: 'Edit' }));
    await retype(pane.getByLabelText('Notes'), 'Dentist again');
    await userEvent.click(save());
    await pane.findByText('This blocked time changed since you opened it');
    await medplum.repo.deleteResource('Slot', BLOCKED_SLOT.id);
    await userEvent.click(pane.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(slotDetails()).not.toBeInTheDocument());
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  test('deleting blocked time takes it off the calendar, once confirmed', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    await waitFor(() => expect(pane.getByRole('button', { name: 'Delete' })).toBeEnabled());

    // Backing out deletes nothing.
    await userEvent.click(pane.getByRole('button', { name: 'Delete' }));
    await userEvent.click(pane.getByRole('button', { name: 'Back' }));
    expect(pane.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(await medplum.readResource('Slot', BLOCKED_SLOT.id)).toBeDefined();

    // A refusal is shown, and the pane stays open to try again.
    vi.spyOn(medplum, 'deleteResource').mockRejectedValueOnce(new Error('Forbidden'));
    await userEvent.click(pane.getByRole('button', { name: 'Delete' }));
    await userEvent.click(pane.getByRole('button', { name: 'Confirm Delete' }));
    expect(await pane.findByText('Forbidden')).toBeInTheDocument();
    await userEvent.click(pane.getByRole('button', { name: 'Back' }));
    expect(pane.queryByText('Forbidden')).not.toBeInTheDocument();

    await userEvent.click(pane.getByRole('button', { name: 'Delete' }));
    await userEvent.click(pane.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(slotDetails()).not.toBeInTheDocument());
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    await expect(medplum.readResource('Slot', BLOCKED_SLOT.id)).rejects.toThrow();
  });

  test('blocked time an appointment holds is left to the appointment', async () => {
    // As `$book` holds a buffer: a Slot of its own, apart from the visit's time.
    await medplum.updateResource<Appointment>({ ...APPOINTMENT, slot: [createReference(BLOCKED_SLOT)] });
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    expect(
      await pane.findByText('This time is held by an appointment. Reschedule or cancel the appointment to change it.')
    ).toBeInTheDocument();
    expect(pane.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(pane.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(pane.getByText('Lunch')).toBeInTheDocument();
  });

  test('blocked time a finished appointment holds offers no reschedule or cancel', async () => {
    await medplum.updateResource<Appointment>({
      ...APPOINTMENT,
      status: 'fulfilled',
      slot: [createReference(BLOCKED_SLOT)],
    });
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    expect(await pane.findByText('This time is held by an appointment.')).toBeInTheDocument();
    expect(pane.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(pane.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('blocked time stays locked when the check for an appointment fails', async () => {
    vi.spyOn(medplum, 'searchOne').mockRejectedValue(new Error('Forbidden'));
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await userEvent.click(await screen.findByText('Blocked'));
    const pane = within(slotDetails() as HTMLElement);
    expect(await pane.findByText('Forbidden')).toBeInTheDocument();
    expect(pane.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(pane.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
