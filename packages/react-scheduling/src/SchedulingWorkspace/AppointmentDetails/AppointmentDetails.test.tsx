// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, ServiceTypeReferenceURI } from '@medplum/core';
import type { Appointment, HealthcareService, Parameters, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import { installCancelStub } from '../../stories/mockCancel';
import { installValueSetStub } from '../../stories/mockValueSet';
import { renderWithMedplum, screen, userEvent, waitFor } from '../../test-utils/render';
import { AppointmentDetails } from './AppointmentDetails';

const SERVICE: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'ultrasound-imaging',
  name: 'Ultrasound Imaging',
};

const HELD_SCHEDULE: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'schedule-dr-rivera',
  active: true,
  actor: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' }],
  serviceType: [
    { extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${SERVICE.id}` } }] },
  ],
};

const HELD_SLOT: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-rivera-tue',
  status: 'busy',
  schedule: { reference: `Schedule/${HELD_SCHEDULE.id}` },
  start: '2020-05-05T17:00:00Z',
  end: '2020-05-05T17:30:00Z',
};

const BOOKED_APPOINTMENT: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera-imaging-tue',
  status: 'booked',
  start: '2020-05-05T17:00:00Z',
  end: '2020-05-05T17:30:00Z',
  serviceType: [
    {
      text: 'Ultrasound Imaging',
      extension: [
        {
          url: ServiceTypeReferenceURI,
          valueReference: { reference: `HealthcareService/${SERVICE.id}` },
        },
      ],
    },
  ],
  comment: 'Bring prior films',
  slot: [{ reference: `Slot/${HELD_SLOT.id}` }],
  participant: [
    { status: 'accepted', actor: { reference: 'Patient/pt-cooper', display: 'Miles Cooper' } },
    { status: 'accepted', actor: { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' } },
    { status: 'accepted', actor: { reference: 'Device/ultrasound-1', display: 'Ultrasound 1' } },
  ],
};

let medplum: MockClient;
let restoreCancel: () => void;
let restoreValueSet: () => void;

beforeEach(async () => {
  medplum = new MockClient();
  await medplum.createResource(SERVICE);
  await medplum.createResource(HELD_SCHEDULE);
  await medplum.createResource(HELD_SLOT);
  await medplum.createResource(BOOKED_APPOINTMENT);
  restoreCancel = installCancelStub(medplum);
  restoreValueSet = installValueSetStub(medplum);
  return () => {
    restoreCancel();
    restoreValueSet();
  };
});

function renderDetails(appointment: WithId<Appointment>, onCancelled?: (a: WithId<Appointment>) => void): RenderResult {
  return renderWithMedplum(<AppointmentDetails appointment={appointment} onCancelled={onCancelled} />, medplum);
}

/**
 * The button on the details that turns the view over to the cancellation page.
 * @returns The button, or null while the details offer no cancellation.
 */
function cancelButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Cancel Appointment' });
}

function rescheduleButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Reschedule' });
}

/**
 * The button on the cancellation page that posts `$cancel`.
 * @returns The button, or null while that page is not open.
 */
function confirmButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Confirm Cancellation' });
}

/** Opens the cancellation page, which is the only place a reason can be chosen. */
async function openCancellation(): Promise<void> {
  await userEvent.click(cancelButton() as HTMLElement);
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

describe('AppointmentDetails', () => {
  test('describes the appointment', () => {
    renderDetails(BOOKED_APPOINTMENT);

    expect(screen.getByText('booked')).toBeInTheDocument();
    expect(screen.getByText('Miles Cooper')).toBeInTheDocument();
    expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(screen.getByText('Bring prior films')).toBeInTheDocument();
    // Everyone but the patient, in one line.
    expect(screen.getByText('Dr. Maya Rivera, Ultrasound 1')).toBeInTheDocument();
    // The day and the times it runs between, in the timezone the browser is in.
    expect(screen.getByText(/Tuesday, May 5/)).toBeInTheDocument();
  });

  test('names only the visit type under the service, not the procedure codes booked with it', () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      serviceType: [
        ...(BOOKED_APPOINTMENT.serviceType ?? []),
        { coding: [{ system: CPT, code: '76700', display: 'Ultrasound, abdominal, real time' }] },
      ],
    });

    expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
  });

  test('names every service type on an appointment not booked against a visit type', () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      serviceType: [{ text: 'Office visit' }, { text: 'Follow-up' }],
    });

    expect(screen.getByText('Office visit, Follow-up')).toBeInTheDocument();
  });

  test('leaves out what is not on file', () => {
    renderDetails({
      resourceType: 'Appointment',
      id: 'appt-bare',
      status: 'booked',
      participant: [{ status: 'accepted', actor: { reference: 'Practitioner/dr-rivera' } }],
    });

    expect(screen.queryByText('When')).not.toBeInTheDocument();
    expect(screen.queryByText('Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    // A participant with no display name is still named, by what it points at.
    expect(screen.getByText('Practitioner/dr-rivera')).toBeInTheDocument();
  });

  test('cancelling posts $cancel and reports the cancelled appointment', async () => {
    const post = vi.spyOn(medplum, 'post');
    const onCancelled = vi.fn();
    renderDetails(BOOKED_APPOINTMENT, onCancelled);

    await openCancellation();
    await chooseReason();
    await userEvent.click(confirmButton() as HTMLElement);

    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(post.mock.calls[0][0].toString()).toContain(`Appointment/${BOOKED_APPOINTMENT.id}/$cancel`);
    expect(onCancelled.mock.calls[0][0]).toMatchObject({ id: BOOKED_APPOINTMENT.id, status: 'cancelled' });

    // The appointment is cancelled on the server, and the time it held is gone.
    const stored = await medplum.readResource('Appointment', BOOKED_APPOINTMENT.id);
    expect(stored.status).toBe('cancelled');
  });

  test('announces the cancelled appointment and the times it released', async () => {
    const notify = vi.spyOn(medplum, 'notifyResourceModified');
    const onCancelled = vi.fn();
    renderDetails(BOOKED_APPOINTMENT, onCancelled);

    await openCancellation();
    await chooseReason();
    await userEvent.click(confirmButton() as HTMLElement);

    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Appointment',
        operation: 'update',
        id: BOOKED_APPOINTMENT.id,
        resource: expect.objectContaining({ status: 'cancelled' }),
      })
    );
    expect(notify).toHaveBeenCalledWith({ resourceType: 'Slot', operation: 'delete', id: HELD_SLOT.id });
  });

  test('shows the refusal when $cancel fails', async () => {
    const onCancelled = vi.fn();
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Appointment cannot be canceled'));
    renderDetails(BOOKED_APPOINTMENT, onCancelled);

    await openCancellation();
    await chooseReason();
    await userEvent.click(confirmButton() as HTMLElement);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Appointment cannot be canceled')).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
    // Still on the page that raised it, with the reason still chosen, to try again.
    expect(confirmButton()).toBeEnabled();
  });

  test('asks for nothing until the cancellation is opened', async () => {
    renderDetails(BOOKED_APPOINTMENT);

    // The details describe the visit and offer to call it off. What it is being called
    // off for is asked on the page that offer leads to, not here.
    expect(screen.queryByPlaceholderText('Search reasons')).not.toBeInTheDocument();
    expect(cancelButton()).toBeEnabled();

    await openCancellation();

    expect(screen.getByPlaceholderText('Search reasons')).toBeInTheDocument();
    expect(screen.queryByText('Bring prior films')).not.toBeInTheDocument();
  });

  test('offers no cancellation until a reason is chosen', async () => {
    renderDetails(BOOKED_APPOINTMENT);
    await openCancellation();

    expect(confirmButton()).toBeDisabled();

    await chooseReason();

    expect(confirmButton()).toBeEnabled();
  });

  test('going back leaves the appointment alone, and the reason behind', async () => {
    const post = vi.spyOn(medplum, 'post');
    renderDetails(BOOKED_APPOINTMENT);
    await openCancellation();
    await chooseReason();

    await userEvent.click(screen.getByRole('button', { name: 'Back to Appointment Details' }));

    // Nothing was posted on the way out, and the details are what is back on screen.
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('Bring prior films')).toBeInTheDocument();

    // Opening it again is the same decision being made from the start, so what was
    // chosen for the cancellation that never happened is not still chosen.
    await openCancellation();
    expect(confirmButton()).toBeDisabled();
  });

  test('sends the chosen reason to $cancel', async () => {
    const post = vi.spyOn(medplum, 'post');
    const onCancelled = vi.fn();
    renderDetails(BOOKED_APPOINTMENT, onCancelled);

    await openCancellation();
    await chooseReason('Provider: Hospitalized');
    await userEvent.click(confirmButton() as HTMLElement);

    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    const parameters = post.mock.calls[0][1] as Parameters;
    expect(parameters.parameter).toEqual([
      {
        name: 'cancelationReason',
        valueCodeableConcept: {
          coding: [
            {
              system: APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM,
              code: 'prov-hosp',
              display: 'Provider: Hospitalized',
            },
          ],
        },
      },
    ]);

    // And it is on the appointment the operation wrote.
    const stored = await medplum.readResource('Appointment', BOOKED_APPOINTMENT.id);
    expect(stored.cancelationReason?.coding?.[0].code).toBe('prov-hosp');
  });

  test('shows the reason a cancelled appointment carries', () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      status: 'cancelled',
      cancelationReason: { coding: [{ code: 'pat-fb', display: 'Patient: Feeling Better' }] },
    });

    expect(screen.getByText('Patient: Feeling Better')).toBeInTheDocument();
  });

  test('offers no cancellation for an appointment $cancel would refuse', () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'cancelled' });

    expect(cancelButton()).toHaveAttribute('disabled');
    expect(screen.getByText('This appointment is cancelled.')).toBeInTheDocument();
  });

  test('says why an appointment already seen cannot be cancelled', () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'fulfilled' });

    expect(cancelButton()).toHaveAttribute('disabled');
    expect(screen.getByText("An appointment in 'fulfilled' status cannot be cancelled.")).toBeInTheDocument();
  });

  test('offers to reschedule a visit $reschedule would accept', () => {
    renderDetails(BOOKED_APPOINTMENT);

    expect(rescheduleButton()).toBeInTheDocument();
  });

  test('offers no reschedule for a visit $reschedule would refuse', () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'cancelled' });

    expect(rescheduleButton()).not.toBeInTheDocument();
  });

  test('takes back the room the reschedule form was given when the view is left', async () => {
    // A host widens itself to lay the times beside the form; leaving the view takes the
    // form away, so the width goes back with it whether or not a search was open.
    const onToggleTimeFinder = vi.fn();
    renderWithMedplum(
      <AppointmentDetails appointment={BOOKED_APPOINTMENT} onToggleTimeFinder={onToggleTimeFinder} />,
      medplum
    );

    await userEvent.click(rescheduleButton() as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));

    expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
  });

  test('swaps the details for the form that moves the visit, and back again', async () => {
    // The two are one view: the same visit, described and then moved. A host showing
    // this in a panel of its own titles it for the details, so the form says what it is.
    renderDetails(BOOKED_APPOINTMENT);

    await userEvent.click(rescheduleButton() as HTMLElement);

    expect(screen.getByRole('heading', { name: 'Reschedule appointment' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: /visit type/i })).toHaveValue('Ultrasound Imaging');
    expect(cancelButton()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Bring prior films')).toBeInTheDocument();
    expect(cancelButton()).toBeInTheDocument();
  });
});
