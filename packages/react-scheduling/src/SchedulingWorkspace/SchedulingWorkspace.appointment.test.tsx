// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { DrRiveraPractitioner, SchedulingFixtures } from '../stories/scheduling';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';

// The calendar opens on today, so the visit is dated into the week on screen rather than
// into a fixed one the grid would have to be paged to.
const TODAY_AT_TEN = new Date(new Date().setHours(10, 0, 0, 0));

/**
 * A visit on Dr. Rivera's calendar alone.
 */
const APPOINTMENT: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera-imaging',
  status: 'booked',
  start: TODAY_AT_TEN.toISOString(),
  end: new Date(TODAY_AT_TEN.getTime() + 30 * 60 * 1000).toISOString(),
  serviceType: [{ text: 'Ultrasound Imaging' }],
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-cooper', display: 'Miles Cooper' } },
    { status: 'accepted', actor: createReference(DrRiveraPractitioner) },
  ],
};

let medplum: MockClient;

beforeEach(async () => {
  medplum = new MockClient();
  for (const resource of [...SchedulingFixtures, APPOINTMENT]) {
    await medplum.createResource(resource);
  }
});

/**
 * The visit as the calendar draws it, once the workspace has loaded it.
 * @returns The event element.
 */
async function appointmentEvent(): Promise<HTMLElement> {
  return waitFor(() => screen.getByText('Miles Cooper'));
}

/** Clicks the visit on the calendar, the way a user opens its details. */
async function clickAppointment(): Promise<void> {
  await userEvent.click(await appointmentEvent());
}

/**
 * The details, as far as they are open.
 * @returns The dialog they are shown in, or null while they are closed.
 */
function details(): HTMLElement | null {
  return screen.queryByRole('dialog');
}

describe('SchedulingWorkspace appointment details', () => {
  test('shows no details until an appointment is clicked', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await appointmentEvent();

    expect(details()).not.toBeInTheDocument();
  });

  test('clicking an appointment opens its details', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();

    const open = within(details() as HTMLElement);
    expect(open.getByText('Miles Cooper')).toBeInTheDocument();
    expect(open.getByText('booked')).toBeInTheDocument();
    expect(open.getByText('Ultrasound Imaging')).toBeInTheDocument();
  });

  test('closing the details leaves the appointment on the calendar', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();
    await userEvent.click(screen.getByRole('button', { name: 'Close appointment details' }));

    await waitFor(() => expect(details()).not.toBeInTheDocument());
    expect(await appointmentEvent()).toBeInTheDocument();
  });

  test('clicking an appointment does not start a booking', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();

    // An event click is not a selection gesture on the grid behind it.
    expect(screen.queryByRole('heading', { name: /book appointment/i })).not.toBeInTheDocument();
  });
});
