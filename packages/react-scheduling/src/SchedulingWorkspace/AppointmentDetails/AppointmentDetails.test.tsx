// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  CPT,
  REQUIRES_DIAGNOSIS_CODE,
  SCHEDULING_ELIGIBILITY_SYSTEM,
  SCHEDULING_REQUIREMENT_CODES,
  SchedulingMedicalNecessityURI,
  ServiceTypeReferenceURI,
} from '@medplum/core';
import type { Appointment, HealthcareService, Parameters, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import { installCancelStub } from '../../stories/mockCancel';
import { installValueSetStub } from '../../stories/mockValueSet';
import {
  AuthorizationValueSets,
  DIAGNOSIS_VALUE_SET,
  DiagnosisCodes,
  ElderJordanPatient,
  MilesCooperPatient,
  PatientFixtures,
  PROCEDURE_VALUE_SET,
  ProcedureCodes,
} from '../../stories/scheduling';
import { installAutocompleteTimers, removePill, settleAutocomplete } from '../../test-utils/asyncAutocomplete';
import {
  choosePatient,
  codePill,
  enterCode,
  field,
  hasPill,
  medicalNecessityBox,
  patientDetail,
} from '../../test-utils/bookingForm';
import { act, fireEvent, renderWithMedplum, screen, userEvent, waitFor } from '../../test-utils/render';
import { AppointmentDetails } from './AppointmentDetails';

const SERVICE: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'ultrasound-imaging',
  name: 'Ultrasound Imaging',
};

const AUTHORIZED_SERVICE: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'infusion-therapy',
  name: 'Infusion Therapy',
  eligibility: SCHEDULING_REQUIREMENT_CODES.map((code) => ({
    code: { coding: [{ system: SCHEDULING_ELIGIBILITY_SYSTEM, code }] },
  })),
};

const DIAGNOSIS_SERVICE: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'iron-infusion',
  name: 'Iron Infusion',
  eligibility: [{ code: { coding: [{ system: SCHEDULING_ELIGIBILITY_SYSTEM, code: REQUIRES_DIAGNOSIS_CODE }] } }],
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

const AUTHORIZED_APPOINTMENT: WithId<Appointment> = {
  ...BOOKED_APPOINTMENT,
  id: 'appt-rivera-infusion-tue',
  serviceType: [
    {
      text: 'Infusion Therapy',
      extension: [
        { url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${AUTHORIZED_SERVICE.id}` } },
      ],
    },
    { coding: [ProcedureCodes[0]] },
  ],
  reasonCode: [{ coding: [DiagnosisCodes[0]] }],
  extension: [{ url: SchedulingMedicalNecessityURI, valueBoolean: true }],
};

let medplum: MockClient;
let restoreCancel: () => void;
let restoreValueSet: () => void;

beforeEach(async () => {
  medplum = new MockClient();
  await medplum.createResource(SERVICE);
  await medplum.createResource(AUTHORIZED_SERVICE);
  await medplum.createResource(DIAGNOSIS_SERVICE);
  await medplum.createResource(MilesCooperPatient);
  for (const patient of PatientFixtures) {
    await medplum.createResource(patient);
  }
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
  test('describes the appointment', async () => {
    renderDetails(BOOKED_APPOINTMENT);

    expect(screen.getByText('booked')).toBeInTheDocument();
    expect(await screen.findByText('Miles Cooper')).toBeInTheDocument();
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

describe('AppointmentDetails editing', () => {
  installAutocompleteTimers();

  function renderEditable(appointment: WithId<Appointment>, onUpdated?: (a: WithId<Appointment>) => void): void {
    installValueSetStub(medplum, AuthorizationValueSets);
    renderWithMedplum(
      <AppointmentDetails
        appointment={appointment}
        procedureBinding={PROCEDURE_VALUE_SET}
        diagnosisBinding={DIAGNOSIS_VALUE_SET}
        onUpdated={onUpdated}
      />,
      medplum
    );
  }

  function saveButton(): HTMLElement {
    return screen.getByRole('button', { name: 'Save Changes' });
  }

  async function clickSave(): Promise<void> {
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await settleAutocomplete();
  }

  test('asks for the patient, filled with the one on file', async () => {
    renderEditable(BOOKED_APPOINTMENT);

    await screen.findByText('Miles Cooper');
    expect(hasPill('Miles Cooper')).toBe(true);
  });

  test('asks for a patient on an appointment without one', async () => {
    renderEditable({
      ...BOOKED_APPOINTMENT,
      participant: BOOKED_APPOINTMENT.participant.filter((p) => !p.actor?.reference?.startsWith('Patient/')),
    });

    expect(field(/patient/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test('asks for no codes a visit type never asked for', async () => {
    renderEditable(BOOKED_APPOINTMENT);
    await screen.findByText('Miles Cooper');

    expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: /diagnosis code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /medical necessity/i })).not.toBeInTheDocument();
  });

  test('asks for what the visit type asked for, filled with what is on file', async () => {
    renderEditable(AUTHORIZED_APPOINTMENT);

    expect(await screen.findByRole('searchbox', { name: /procedure code/i })).toBeInTheDocument();
    expect(hasPill(codePill(ProcedureCodes[0]))).toBe(true);
    expect(hasPill(codePill(DiagnosisCodes[0]))).toBe(true);
    expect(medicalNecessityBox()).toBeChecked();
    // Exact match: the procedure code is not appended to the Service line.
    expect(screen.getByText('Infusion Therapy')).toBeInTheDocument();
  });

  test('asks only for what the visit type asked for', async () => {
    renderEditable({
      ...BOOKED_APPOINTMENT,
      serviceType: [
        {
          text: 'Iron Infusion',
          extension: [
            {
              url: ServiceTypeReferenceURI,
              valueReference: { reference: `HealthcareService/${DIAGNOSIS_SERVICE.id}` },
            },
          ],
        },
      ],
    });

    expect(await screen.findByRole('searchbox', { name: /diagnosis code/i })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /medical necessity/i })).not.toBeInTheDocument();
  });

  test('offers no save until something changes, nor while a required field is empty', async () => {
    renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    expect(saveButton()).toBeDisabled();

    await removePill(codePill(ProcedureCodes[0]));
    expect(saveButton()).toBeDisabled();

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    expect(saveButton()).toBeEnabled();
  });

  test('saves the codes, keeping the visit type they were booked under', async () => {
    const onUpdated = vi.fn();
    await medplum.createResource(AUTHORIZED_APPOINTMENT);
    renderEditable(AUTHORIZED_APPOINTMENT, onUpdated);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    await removePill(codePill(DiagnosisCodes[0]));
    await enterCode(/diagnosis code/i, DiagnosisCodes[1]);
    await clickSave();

    expect(onUpdated).toHaveBeenCalled();
    const stored = await medplum.readResource('Appointment', AUTHORIZED_APPOINTMENT.id);
    expect(stored.serviceType).toEqual([
      AUTHORIZED_APPOINTMENT.serviceType?.[0],
      { coding: [ProcedureCodes[0]] },
      { coding: [ProcedureCodes[1]] },
    ]);
    expect(stored.reasonCode).toEqual([{ coding: [DiagnosisCodes[1]] }]);
    expect(stored.extension).toEqual([{ url: SchedulingMedicalNecessityURI, valueBoolean: true }]);
    expect(saveButton()).toBeDisabled();
  });

  test('saves a different patient in place of the one on file', async () => {
    await medplum.createResource(AUTHORIZED_APPOINTMENT);
    renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByText('Miles Cooper');

    await removePill('Miles Cooper');
    await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
    await clickSave();

    const stored = await medplum.readResource('Appointment', AUTHORIZED_APPOINTMENT.id);
    expect(stored.participant).toEqual([
      {
        actor: { reference: `Patient/${ElderJordanPatient.id}`, display: 'Jordan Reyes' },
        required: 'required',
        status: 'needs-action',
      },
      ...AUTHORIZED_APPOINTMENT.participant.slice(1),
    ]);
  });

  test('shows a refused save and keeps what was entered', async () => {
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Precondition failed'));
    renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    await clickSave();

    expect(await screen.findByText('Precondition failed')).toBeInTheDocument();
    expect(hasPill(codePill(ProcedureCodes[1]))).toBe(true);
    expect(saveButton()).toBeEnabled();
  });
});
