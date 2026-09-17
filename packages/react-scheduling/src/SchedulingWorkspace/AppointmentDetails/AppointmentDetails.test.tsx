// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Parameters, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import { installCancelStub } from '../../stories/mockCancel';
import { installValueSetStub } from '../../stories/mockValueSet';
import { renderWithMedplum, screen, userEvent, waitFor } from '../../test-utils/render';
import { AppointmentDetails } from './AppointmentDetails';

const HELD_SLOT: WithId<Slot> = {
  resourceType: 'Slot',
  id: 'slot-rivera-tue',
  status: 'busy',
  schedule: { reference: 'Schedule/schedule-dr-rivera' },
  start: '2020-05-05T17:00:00Z',
  end: '2020-05-05T17:30:00Z',
};

const BOOKED_APPOINTMENT: WithId<Appointment> = {
  resourceType: 'Appointment',
  id: 'appt-rivera-imaging-tue',
  status: 'booked',
  start: '2020-05-05T17:00:00Z',
  end: '2020-05-05T17:30:00Z',
  serviceType: [{ text: 'Ultrasound Imaging' }],
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

    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);

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

    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);

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

    await chooseReason();
    await userEvent.click(cancelButton() as HTMLElement);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Appointment cannot be canceled')).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
    // Still offering to try again.
    expect(cancelButton()).toBeInTheDocument();
  });

  test('offers no cancellation until a reason is chosen', async () => {
    renderDetails(BOOKED_APPOINTMENT);

    expect(cancelButton()).toBeDisabled();

    await chooseReason();

    expect(cancelButton()).toBeEnabled();
  });

  test('sends the chosen reason to $cancel', async () => {
    const post = vi.spyOn(medplum, 'post');
    const onCancelled = vi.fn();
    renderDetails(BOOKED_APPOINTMENT, onCancelled);

    await chooseReason('Provider: Hospitalized');
    await userEvent.click(cancelButton() as HTMLElement);

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

    expect(cancelButton()).not.toBeInTheDocument();
    expect(screen.getByText('This appointment is cancelled.')).toBeInTheDocument();
  });

  test('says why an appointment already seen cannot be cancelled', () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'fulfilled' });

    expect(cancelButton()).not.toBeInTheDocument();
    expect(screen.getByText("An appointment in 'fulfilled' status cannot be cancelled.")).toBeInTheDocument();
  });
});
