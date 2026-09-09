// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASON_VALUE_SET } from '../constants';
import { installCancelStub } from '../stories/mockCancel';
import { installValueSetStub } from '../stories/mockValueSet';
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
let restoreCancel: () => void;
let restoreValueSet: () => void;

beforeEach(async () => {
  medplum = new MockClient();
  for (const resource of [...SchedulingFixtures, APPOINTMENT]) {
    await medplum.createResource(resource);
  }
  restoreCancel = installCancelStub(medplum);
  restoreValueSet = installValueSetStub(medplum);
  return () => {
    restoreCancel();
    restoreValueSet();
  };
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

function cancelButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Cancel Appointment' });
}

/**
 * Chooses a reason for the cancellation, which nothing can be cancelled without.
 *
 * Typed rather than picked off the open list: the field asks the server for ten matches at
 * a time, so a reason far down the code system is only offered once it is searched for.
 *
 * @param label - The reason to choose, as the expansion displays it.
 */
async function chooseReason(label = 'Patient: Feeling Better'): Promise<void> {
  await userEvent.type(screen.getByPlaceholderText('Search reasons'), label);
  await userEvent.click(await screen.findByRole('option', { name: label }));
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

  test('cancelling from the details runs the appointment through $cancel', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();
    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);

    await waitFor(async () => {
      const stored = await medplum.readResource('Appointment', APPOINTMENT.id);
      expect(stored.status).toBe('cancelled');
    });
  });

  test('cancelling redraws the details and the calendar from what came back', async () => {
    // Answered the way a server answers: the appointment comes back cancelled and the
    // client is told nothing else. The cancel stub would instead cancel *through* the
    // client, whose own write announces itself — and that would refresh both views here
    // whether or not the details announced anything, which is the thing under test.
    vi.spyOn(medplum, 'post').mockResolvedValue({ ...APPOINTMENT, status: 'cancelled' });
    const { container } = renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();
    expect(container.querySelector('.appointment.booked')).toBeInTheDocument();

    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);

    // The details stay open on what is now a cancelled visit, with nothing left to press.
    await waitFor(() => expect(within(details() as HTMLElement).getByText('cancelled')).toBeInTheDocument());
    expect(cancelButton()).not.toBeInTheDocument();
    expect(within(details() as HTMLElement).getByText('This appointment is cancelled.')).toBeInTheDocument();

    // And the grid is drawn again from the same announcement, without re-fetching.
    await waitFor(() => expect(container.querySelector('.appointment.cancelled')).toBeInTheDocument());
    expect(container.querySelector('.appointment.booked')).not.toBeInTheDocument();
  });

  test('a refusal does not outlive the details it was raised in', async () => {
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Appointment cannot be canceled'));
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();
    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Close appointment details' }));
    await waitFor(() => expect(details()).not.toBeInTheDocument());
    await clickAppointment();

    // Closed is unmounted, so what the details say now is only about the appointment
    // being opened — and the reason chosen for the cancellation that failed is gone with
    // it, leaving nothing to cancel against.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(cancelButton()).toBeDisabled();
  });

  test('cancellation reasons come from the default binding', async () => {
    const expand = vi.spyOn(medplum, 'valueSetExpand');
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();
    await chooseReason();

    expect(expand).toHaveBeenCalledWith(
      expect.objectContaining({ url: APPOINTMENT_CANCELLATION_REASON_VALUE_SET }),
      expect.anything()
    );
  });

  test('a supplied value set is what cancellation reasons are searched in', async () => {
    const expand = vi.spyOn(medplum, 'valueSetExpand');
    renderWithMedplum(
      <SchedulingWorkspace appointmentCancellationReasonValueSet="http://example.com/ValueSet/our-reasons" />,
      medplum
    );

    await clickAppointment();
    await userEvent.type(screen.getByPlaceholderText('Search reasons'), 'Ran');

    await waitFor(() =>
      expect(expand).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://example.com/ValueSet/our-reasons' }),
        expect.anything()
      )
    );
    // And the binding it replaced is not asked for at all.
    expect(expand).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: APPOINTMENT_CANCELLATION_REASON_VALUE_SET }),
      expect.anything()
    );
  });

  test('clicking an appointment does not start a booking', async () => {
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await clickAppointment();

    // An event click is not a selection gesture on the grid behind it.
    expect(screen.queryByRole('heading', { name: /book appointment/i })).not.toBeInTheDocument();
  });
});
