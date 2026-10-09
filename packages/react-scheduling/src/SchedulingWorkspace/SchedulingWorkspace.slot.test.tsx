// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { DrRiveraPractitioner, DrRiveraSchedule, SchedulingFixtures } from '../stories/scheduling';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';
import { formatWhen } from './SchedulingWorkspace.utils';

// The calendar opens on today, so everything is dated into the week on screen.
const TODAY_AT = (hours: number): string => new Date(new Date().setHours(hours, 0, 0, 0)).toISOString();

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

    // An appointment takes the pane over, and blocked time takes it back.
    await userEvent.click(screen.getByText('Miles Cooper'));
    expect(appointmentDetails()).toBeInTheDocument();
    expect(slotDetails()).not.toBeInTheDocument();
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
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });
});
