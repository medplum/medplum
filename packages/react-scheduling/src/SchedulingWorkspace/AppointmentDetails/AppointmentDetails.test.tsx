// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  CPT,
  createReference,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_PROCEDURE_CODE,
  SCHEDULING_ELIGIBILITY_SYSTEM,
  SCHEDULING_REQUIREMENT_CODES,
  SchedulingExternalUrlURI,
  SchedulingMedicalNecessityURI,
  ServiceTypeReferenceURI,
  setPrimaryProvider,
  toAppointmentSiteReference,
} from '@medplum/core';
import type { Appointment, CodeableConcept, HealthcareService, Parameters, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM } from '../../constants';
import { installCancelStub } from '../../stories/mockCancel';
import { installConfirmStub } from '../../stories/mockConfirm';
import { installValueSetStub } from '../../stories/mockValueSet';
import {
  AuthorizationValueSets,
  DIAGNOSIS_VALUE_SET,
  DiagnosisCodes,
  DrOkaforPractitioner,
  DrRiveraPractitioner,
  ElderJordanPatient,
  ExamRoomA,
  MainClinic,
  MilesCooperPatient,
  PatientFixtures,
  PROCEDURE_VALUE_SET,
  ProcedureCodes,
  Ultrasound1Device,
} from '../../stories/scheduling';
import { installAutocompleteTimers, removePill, settleAutocomplete } from '../../test-utils/asyncAutocomplete';
import {
  addRow,
  choosePatient,
  codePill,
  confirmMedicalNecessity,
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

const PROCEDURE_SERVICE: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'imaging-with-procedures',
  name: 'Imaging With Procedures',
  eligibility: [{ code: { coding: [{ system: SCHEDULING_ELIGIBILITY_SYSTEM, code: REQUIRES_PROCEDURE_CODE }] } }],
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

const TENTATIVE_SLOT: WithId<Slot> = { ...HELD_SLOT, id: 'slot-rivera-tue-tentative', status: 'busy-tentative' };

/** Held through `$hold`, on time it has not yet firmed up. */
const PENDING_APPOINTMENT: WithId<Appointment> = {
  ...BOOKED_APPOINTMENT,
  id: 'appt-rivera-imaging-tue-pending',
  status: 'pending',
  slot: [{ reference: `Slot/${TENTATIVE_SLOT.id}` }],
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
let restoreConfirm: () => void;
let restoreValueSet: () => void;

beforeEach(async () => {
  // At the visits themselves, well inside the 12 hours they stay open to changes.
  vi.setSystemTime(new Date(BOOKED_APPOINTMENT.start as string));
  medplum = new MockClient();
  await medplum.createResource(SERVICE);
  await medplum.createResource(AUTHORIZED_SERVICE);
  await medplum.createResource(DIAGNOSIS_SERVICE);
  await medplum.createResource(PROCEDURE_SERVICE);
  await medplum.createResource(MilesCooperPatient);
  await medplum.createResource(DrRiveraPractitioner);
  await medplum.createResource(Ultrasound1Device);
  for (const patient of PatientFixtures) {
    await medplum.createResource(patient);
  }
  await medplum.createResource(HELD_SCHEDULE);
  await medplum.createResource(HELD_SLOT);
  await medplum.createResource(BOOKED_APPOINTMENT);
  await medplum.createResource(TENTATIVE_SLOT);
  await medplum.createResource(PENDING_APPOINTMENT);
  restoreCancel = installCancelStub(medplum);
  restoreConfirm = installConfirmStub(medplum);
  restoreValueSet = installValueSetStub(medplum);
  return () => {
    restoreCancel();
    restoreConfirm();
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

/**
 * The link out to the visit in the external system.
 * @returns The link, or null when there is none.
 */
function externalLink(): HTMLElement | null {
  return screen.queryByRole('link', { name: 'View details' });
}

/**
 * What the foot of the details offers, in order.
 * @returns The labels of its buttons and links.
 */
function actionLabels(): (string | null)[] {
  const divider = screen.getByRole('separator');
  const actions = divider.parentElement as HTMLElement;
  return [...actions.querySelectorAll('a, button')].map((action) => action.textContent);
}

function updateButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Edit or Reschedule Appointment' });
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
  test('shows saved requirements as details until the update form is opened', async () => {
    renderDetails(AUTHORIZED_APPOINTMENT);
    await screen.findByText('Miles Cooper');
    expect(screen.getByText(ProcedureCodes[0].display as string)).toBeInTheDocument();
    expect(screen.getByText(DiagnosisCodes[0].display as string)).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Appointment' })).not.toBeInTheDocument();
    fireEvent.click(updateButton() as HTMLElement);
    expect(await screen.findByRole('button', { name: 'Update Appointment' })).toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
  });

  test('offers one button for changing the visit, beside the cancellation', async () => {
    renderDetails(BOOKED_APPOINTMENT);
    await screen.findByText('Miles Cooper');

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(actionLabels()).toEqual(['Edit or Reschedule Appointment', 'Cancel Appointment']);
  });

  test('describes the appointment', async () => {
    renderDetails(BOOKED_APPOINTMENT);

    expect(screen.getByText('booked')).toBeInTheDocument();
    expect(await screen.findByText('Miles Cooper')).toBeInTheDocument();
    expect(screen.getByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(screen.getByText('Bring prior films')).toBeInTheDocument();
    // Everyone but the patient, named from their own resources rather than the references' displays.
    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(await screen.findByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
    // The day and the times it runs between, in the timezone the browser is in.
    expect(screen.getByText(/Tuesday, May 5/)).toBeInTheDocument();
  });

  test('names only the visit type under the service, not the procedure codes booked with it', async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      serviceType: [
        ...(BOOKED_APPOINTMENT.serviceType ?? []),
        { coding: [{ system: CPT, code: '76700', display: 'Ultrasound, abdominal, real time' }] },
      ],
    });

    expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
  });

  test('uses only the first visit type referring to a HealthcareService', async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      serviceType: [
        // Carries the extension, but what it refers to is not a HealthcareService.
        {
          text: 'Misfiled visit type',
          extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: 'Practitioner/dr-rivera' } }],
        },
        ...(BOOKED_APPOINTMENT.serviceType ?? []),
        {
          text: 'Ignored visit type',
          extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference: 'HealthcareService/other' } }],
        },
        { text: 'Abdominal ultrasound' },
      ],
    });

    expect(await screen.findByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(screen.queryByText(/Ignored visit type/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Misfiled visit type/)).not.toBeInTheDocument();
    expect(screen.getByText('Abdominal ultrasound')).toBeInTheDocument();
  });

  test('shows unreferenced service types as procedures when there is no visit type', async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      appointmentType: undefined,
      serviceType: [{ text: 'Office visit' }, { text: 'Follow-up' }],
    });
    await screen.findByText('Miles Cooper');

    expect(screen.getByText('Office visit, Follow-up')).toBeInTheDocument();
    expect(screen.getByText('Procedure codes')).toBeInTheDocument();
    expect(screen.queryByText('Service')).not.toBeInTheDocument();
  });

  test('leaves out what is not on file', async () => {
    renderDetails({
      resourceType: 'Appointment',
      id: 'appt-bare',
      status: 'booked',
      participant: [{ status: 'accepted', actor: { reference: 'Practitioner/dr-unknown' } }],
    });

    expect(screen.queryByText('When')).not.toBeInTheDocument();
    expect(screen.queryByText('Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Repeats')).not.toBeInTheDocument();
    expect(screen.queryByText('Service facility')).not.toBeInTheDocument();
    expect(screen.queryByText('MRN')).not.toBeInTheDocument();
    // With no primary marked, every provider is listed alike.
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.queryByText('Primary provider')).not.toBeInTheDocument();
    // A participant whose resource can't be read says so.
    expect(await screen.findByText('[Not found]')).toBeInTheDocument();
  });

  test('names the service facility the visit is held at by the Location it points at', async () => {
    await medplum.createResource(MainClinic);
    renderDetails({
      ...BOOKED_APPOINTMENT,
      supportingInformation: [
        // Another Location, not stamped as the site.
        { reference: 'Location/exam-room-a' },
        { ...toAppointmentSiteReference(MainClinic), display: 'Stale display' },
      ],
    });

    expect(await screen.findByText('Uro Associates - Main Clinic')).toBeInTheDocument();
    expect(screen.getByText('Service facility')).toBeInTheDocument();
    expect(screen.queryByText('Stale display')).not.toBeInTheDocument();
  });

  test("shows the patient's medical record number", async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      participant: [{ status: 'accepted', actor: createReference(ElderJordanPatient) }],
    });

    expect(await screen.findByText('MRN-0041')).toBeInTheDocument();
    expect(screen.getByText('MRN')).toBeInTheDocument();
  });

  test('names the primary provider apart from the other providers, rooms, and devices', async () => {
    await medplum.createResource(DrOkaforPractitioner);
    await medplum.createResource(ExamRoomA);
    const primary = createReference(DrOkaforPractitioner);
    renderDetails({
      ...BOOKED_APPOINTMENT,
      participant: setPrimaryProvider(
        [
          ...BOOKED_APPOINTMENT.participant,
          { status: 'accepted', actor: primary },
          { status: 'accepted', actor: createReference(ExamRoomA) },
        ],
        primary
      ),
    });

    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.getByText('Primary provider').parentElement).toHaveTextContent('Dr. Tunde Okafor');
    expect(screen.getByText('Other providers').parentElement).toHaveTextContent('Dr. Maya Rivera');
    expect(screen.getByText('Rooms').parentElement).toHaveTextContent('Exam Room A');
    expect(screen.getByText('Devices').parentElement).toHaveTextContent('Ultrasound 1 (Main Campus)');
    expect(screen.queryByText('With')).not.toBeInTheDocument();
  });

  test('names a participant stored without a display by the resource it points at', async () => {
    await medplum.createResource({
      resourceType: 'Practitioner',
      id: 'dr-okafor',
      name: [{ given: ['Tunde'], family: 'Okafor' }],
    });
    renderDetails({
      ...BOOKED_APPOINTMENT,
      participant: [
        ...BOOKED_APPOINTMENT.participant.slice(0, 1),
        { status: 'accepted', actor: { reference: 'Practitioner/dr-okafor' } },
      ],
    });

    expect(await screen.findByText('Tunde Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Practitioner/dr-okafor')).not.toBeInTheDocument();
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
    expect(cancelButton()).toBeInTheDocument();

    await openCancellation();

    expect(screen.getByRole('heading', { name: 'Cancel Appointment' })).toBeInTheDocument();
    // The reason first, and the visit being called off described under it.
    const reason = screen.getByPlaceholderText('Search reasons');
    const notes = screen.getByText('Bring prior films');
    expect(reason.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancelButton()).not.toBeInTheDocument();
    // The way back sits at the foot, after the details.
    const back = screen.getByRole('button', { name: 'Back to Appointment Details' });
    expect(notes.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('separator')).toHaveLength(2);
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

  test('confirming a pending appointment books it through $confirm', async () => {
    const notify = vi.spyOn(medplum, 'notifyResourceModified');
    const onConfirmed = vi.fn();
    renderWithMedplum(<AppointmentDetails appointment={PENDING_APPOINTMENT} onConfirmed={onConfirmed} />, medplum);
    await screen.findByText('Miles Cooper');

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(onConfirmed.mock.calls[0][0]).toMatchObject({
      appointments: [{ id: PENDING_APPOINTMENT.id, status: 'booked' }],
      slots: [{ id: TENTATIVE_SLOT.id, status: 'busy' }],
    });

    // The operation firmed up the time as well as the visit, and the client is told of both.
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Appointment',
        operation: 'update',
        id: PENDING_APPOINTMENT.id,
        resource: expect.objectContaining({ status: 'booked' }),
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Slot',
        operation: 'update',
        id: TENTATIVE_SLOT.id,
        resource: expect.objectContaining({ status: 'busy' }),
      })
    );
  });

  test('shows the refusal when $confirm fails', async () => {
    const onConfirmed = vi.fn();
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Schedule is inactive'));
    renderWithMedplum(<AppointmentDetails appointment={PENDING_APPOINTMENT} onConfirmed={onConfirmed} />, medplum);
    await screen.findByText('Miles Cooper');

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Schedule is inactive')).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  test('says where a visit falls in the series it was booked in', async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      extension: [
        {
          url: RecurrenceTemplateExtensionURI,
          extension: [{ url: 'occurrenceCount', valuePositiveInt: 4 }],
        },
        { url: RecurrenceIdExtensionURI, valuePositiveInt: 1 },
      ],
    });
    await screen.findByText('Miles Cooper');

    expect(screen.getByText('Repeats')).toBeInTheDocument();
    expect(screen.getByText('Weekly · visit 1 of 4')).toBeInTheDocument();
  });

  test('says where a later visit falls, without the count only the first keeps', async () => {
    // `$book` leaves the series' template on its first occurrence alone.
    renderDetails({ ...BOOKED_APPOINTMENT, extension: [{ url: RecurrenceIdExtensionURI, valuePositiveInt: 3 }] });
    await screen.findByText('Miles Cooper');

    expect(screen.getByText('Weekly · visit 3')).toBeInTheDocument();
  });

  test('shows the reason a cancelled appointment carries', async () => {
    renderDetails({
      ...BOOKED_APPOINTMENT,
      status: 'cancelled',
      cancelationReason: { coding: [{ code: 'pat-fb', display: 'Patient: Feeling Better' }] },
    });
    await screen.findByText('Miles Cooper');

    expect(screen.getByText('Patient: Feeling Better')).toBeInTheDocument();
  });

  test.each(['cancelled', 'fulfilled'] as const)('offers no cancellation for a %s appointment', async (status) => {
    renderDetails({ ...BOOKED_APPOINTMENT, status });
    await screen.findByText('Miles Cooper');

    expect(cancelButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be cancelled|is cancelled\./)).not.toBeInTheDocument();
  });

  test('links to the visit in the external system', async () => {
    const url = 'https://foomedical.com/appointments?date=05%2F05%2F2020&mrn=123';
    renderDetails({ ...BOOKED_APPOINTMENT, extension: [{ url: SchedulingExternalUrlURI, valueUrl: url }] });
    await screen.findByText('Miles Cooper');

    expect(actionLabels()).toEqual(['View details', 'Edit or Reschedule Appointment', 'Cancel Appointment']);
    const link = externalLink();
    expect(link).toHaveAttribute('href', url);
    expect(link).not.toHaveAttribute('target');
  });

  test('keeps the link for an appointment that cannot be cancelled', async () => {
    const url = 'https://foomedical.com/appointments?mrn=123';
    renderDetails({
      ...BOOKED_APPOINTMENT,
      status: 'fulfilled',
      extension: [{ url: SchedulingExternalUrlURI, valueUrl: url }],
    });
    await screen.findByText('Miles Cooper');

    expect(actionLabels()).toEqual(['View details', 'Edit or Reschedule Appointment']);
  });

  test.each(['javascript:alert(1)', 'http://foomedical.com/appointments', 'not a url'])(
    'offers no external link to %s',
    async (url) => {
      renderDetails({ ...BOOKED_APPOINTMENT, extension: [{ url: SchedulingExternalUrlURI, valueUrl: url }] });
      await screen.findByText('Miles Cooper');

      expect(externalLink()).not.toBeInTheDocument();
    }
  );

  test('offers nothing to change on a cancelled visit', async () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'cancelled' });
    await screen.findByText('Miles Cooper');

    expect(updateButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  test('offers to change a visit $reschedule would accept', async () => {
    renderDetails(BOOKED_APPOINTMENT);
    await screen.findByText('Miles Cooper');

    expect(updateButton()).toBeInTheDocument();
  });

  test('shows the time of a visit $reschedule would refuse without offering to move it', async () => {
    renderDetails({ ...BOOKED_APPOINTMENT, status: 'arrived' });
    await userEvent.click(updateButton() as HTMLElement);

    const time = await screen.findByRole('textbox', { name: /date & time/i });
    expect(time).toBeDisabled();
    expect(screen.getByText("The time can't be changed once an appointment is arrived.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /find a time/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Appointment' })).toBeDisabled();
  });

  test('takes back the room the update form was given when the view is left', async () => {
    // A host widens itself to lay the times beside the form; leaving the view takes the
    // form away, so the width goes back with it whether or not a search was open.
    const onToggleTimeFinder = vi.fn();
    renderWithMedplum(
      <AppointmentDetails appointment={BOOKED_APPOINTMENT} onToggleTimeFinder={onToggleTimeFinder} />,
      medplum
    );

    await userEvent.click(updateButton() as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Appointment Details' }));

    expect(onToggleTimeFinder).toHaveBeenLastCalledWith(false);
  });

  test('swaps the details for the form that changes the visit, and back again', async () => {
    // The two are one view: the same visit, described and then changed. A host showing
    // this in a panel of its own titles it for the details, so the form says what it is.
    renderDetails(BOOKED_APPOINTMENT);

    await userEvent.click(updateButton() as HTMLElement);

    expect(screen.getByRole('heading', { name: 'Update Appointment' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: /visit type/i })).toHaveValue('Ultrasound Imaging');
    expect(cancelButton()).not.toBeInTheDocument();
    // The only way back is the one under the form.
    expect(screen.getAllByRole('button', { name: /back/i })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Back to Appointment Details' }));

    expect(screen.getByText('Bring prior films')).toBeInTheDocument();
    expect(cancelButton()).toBeInTheDocument();
  });
});

describe('AppointmentDetails more than 12 hours after it ended', () => {
  const LATER = new Date('2020-05-06T06:00:00Z');

  test('offers nothing but the link to the visit', async () => {
    vi.setSystemTime(LATER);
    const url = 'https://foomedical.com/appointments?mrn=123';
    renderDetails({ ...PENDING_APPOINTMENT, extension: [{ url: SchedulingExternalUrlURI, valueUrl: url }] });
    await screen.findByText('Miles Cooper');

    expect(screen.getByText("Appointments that ended more than 12 hours ago can't be changed.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(updateButton()).not.toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
    expect(externalLink()).toHaveAttribute('href', url);
  });

  test('lets an update opened before the cutoff finish', async () => {
    const details = (): JSX.Element => <AppointmentDetails appointment={BOOKED_APPOINTMENT} />;
    const { rerender } = renderWithMedplum(details(), medplum);
    await userEvent.click(updateButton() as HTMLElement);

    vi.setSystemTime(LATER);
    rerender(details());

    expect(screen.getByRole('heading', { name: 'Update Appointment' })).toBeInTheDocument();
  });
});

describe('AppointmentDetails editing', () => {
  installAutocompleteTimers();

  async function renderEditable(
    appointment: WithId<Appointment>,
    onUpdated?: (a: WithId<Appointment>) => void
  ): Promise<void> {
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
    fireEvent.click(updateButton() as HTMLElement);
    // The form is not mounted until what the visit is held on has been read.
    await screen.findByRole('button', { name: 'Update Appointment' });
  }

  function saveButton(): HTMLElement {
    return screen.getByRole('button', { name: 'Update Appointment' });
  }

  async function clickSave(): Promise<void> {
    await act(async () => {
      fireEvent.click(saveButton());
    });
    await settleAutocomplete();
  }

  test('asks for the patient, filled with the one on file', async () => {
    await renderEditable(BOOKED_APPOINTMENT);

    await screen.findByText('Miles Cooper');
    expect(hasPill('Miles Cooper')).toBe(true);
  });

  test('asks for a patient on an appointment without one', async () => {
    await renderEditable({
      ...BOOKED_APPOINTMENT,
      participant: BOOKED_APPOINTMENT.participant.filter((p) => !p.actor?.reference?.startsWith('Patient/')),
    });

    expect(field(/patient/i)).toBeInTheDocument();
    expect(screen.getByText('Select a patient.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test('asks for no codes a visit type never asked for', async () => {
    await renderEditable(BOOKED_APPOINTMENT);
    await screen.findByText('Miles Cooper');

    expect(screen.queryByRole('searchbox', { name: /procedure code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: /diagnosis code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /medical necessity/i })).not.toBeInTheDocument();
  });

  test('asks for what the visit type asked for, filled with what is on file', async () => {
    await renderEditable(AUTHORIZED_APPOINTMENT);

    expect(await screen.findByRole('searchbox', { name: /procedure code/i })).toBeInTheDocument();
    expect(hasPill(codePill(ProcedureCodes[0]))).toBe(true);
    expect(hasPill(codePill(DiagnosisCodes[0]))).toBe(true);
    expect(medicalNecessityBox()).toBeChecked();
    // The visit type alone: the procedure code is not appended to it.
    expect(screen.getByRole('textbox', { name: /visit type/i })).toHaveValue('Infusion Therapy');
  });

  test('asks only for what the visit type asked for', async () => {
    await renderEditable({
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
    await renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    expect(saveButton()).toBeDisabled();

    await removePill(codePill(ProcedureCodes[0]));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Add at least one procedure code.')).toBeInTheDocument();

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('Before you can save')).not.toBeInTheDocument();
  });

  test('saves the codes, keeping the visit type they were booked under', async () => {
    const onUpdated = vi.fn();
    await medplum.createResource(AUTHORIZED_APPOINTMENT);
    await renderEditable(AUTHORIZED_APPOINTMENT, onUpdated);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    await addRow('procedure');
    await enterCode(/procedure 2/i, ProcedureCodes[1]);
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
    expect(screen.queryByRole('button', { name: 'Update Appointment' })).not.toBeInTheDocument();
    expect(updateButton()).toBeInTheDocument();
  });

  test('keeps every coding and the text of a code it was not asked to change', async () => {
    const procedure = {
      text: 'Infusion, as ordered',
      coding: [ProcedureCodes[0], { system: 'http://example.com/local', code: 'INF-1' }],
    };
    const diagnosis = { coding: [DiagnosisCodes[0], { system: 'http://example.com/local', code: 'ANEMIA' }] };
    const appointment: WithId<Appointment> = {
      ...AUTHORIZED_APPOINTMENT,
      serviceType: [AUTHORIZED_APPOINTMENT.serviceType?.[0] as CodeableConcept, procedure],
      reasonCode: [diagnosis],
    };
    await medplum.createResource(appointment);
    await renderEditable(appointment);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    expect(hasPill('INF-1')).toBe(true);
    expect(saveButton()).toBeDisabled();
    await addRow('diagnosis');
    await enterCode(/diagnosis 2/i, DiagnosisCodes[1]);
    await clickSave();

    const stored = await medplum.readResource('Appointment', appointment.id);
    expect(stored.serviceType?.[1]).toEqual(procedure);
    expect(stored.reasonCode).toEqual([diagnosis, { coding: [DiagnosisCodes[1]] }]);
  });

  test('edits one coding of a procedure without touching the other procedures', async () => {
    const appointment: WithId<Appointment> = {
      ...AUTHORIZED_APPOINTMENT,
      serviceType: [
        AUTHORIZED_APPOINTMENT.serviceType?.[0] as CodeableConcept,
        { coding: [ProcedureCodes[0], { system: 'http://example.com/local', code: 'INF-1' }] },
        { coding: [ProcedureCodes[1]] },
      ],
    };
    await medplum.createResource(appointment);
    await renderEditable(appointment);
    await screen.findByRole('searchbox', { name: /procedure 1/i });

    await removePill('INF-1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove procedure 2' }));
    });
    await clickSave();

    const stored = await medplum.readResource('Appointment', appointment.id);
    expect(stored.serviceType?.slice(1)).toEqual([{ coding: [ProcedureCodes[0]] }]);
  });

  test('saves a different patient in place of the one on file', async () => {
    await medplum.createResource(AUTHORIZED_APPOINTMENT);
    await renderEditable(AUTHORIZED_APPOINTMENT);
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

  test('confirms medical necessity on a visit on file without it, replacing the attestation rather than adding one', async () => {
    const otherExtension = { url: 'http://example.com/StructureDefinition/unrelated', valueString: 'kept' };
    const unconfirmed: WithId<Appointment> = {
      ...AUTHORIZED_APPOINTMENT,
      extension: [otherExtension, { url: SchedulingMedicalNecessityURI, valueBoolean: false }],
    };
    await medplum.createResource(unconfirmed);
    await renderEditable(unconfirmed);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    expect(medicalNecessityBox()).not.toBeChecked();
    // Required, as at booking.
    expect(saveButton()).toBeDisabled();

    await confirmMedicalNecessity();
    expect(saveButton()).toBeEnabled();
    await clickSave();

    const stored = await medplum.readResource('Appointment', unconfirmed.id);
    expect(stored.extension).toEqual([otherExtension, { url: SchedulingMedicalNecessityURI, valueBoolean: true }]);
  });

  test('offers no save once medical necessity is unticked', async () => {
    await renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });
    await enterCode(/procedure code/i, ProcedureCodes[1]);
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('Before you can save')).not.toBeInTheDocument();

    await confirmMedicalNecessity();

    expect(medicalNecessityBox()).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Confirm medical necessity.')).toBeInTheDocument();
  });

  test('adds a patient to an appointment that had none', async () => {
    const withoutPatient: WithId<Appointment> = {
      ...BOOKED_APPOINTMENT,
      id: 'appt-no-patient',
      participant: BOOKED_APPOINTMENT.participant.filter((p) => !p.actor?.reference?.startsWith('Patient/')),
    };
    await medplum.createResource(withoutPatient);
    await renderEditable(withoutPatient);

    await choosePatient('Jordan', patientDetail(ElderJordanPatient, 'MRN-0041'));
    await clickSave();

    const stored = await medplum.readResource('Appointment', withoutPatient.id);
    expect(stored.participant).toEqual([
      ...withoutPatient.participant,
      {
        actor: { reference: `Patient/${ElderJordanPatient.id}`, display: 'Jordan Reyes' },
        required: 'required',
        status: 'needs-action',
      },
    ]);
  });

  test('writes only what the visit type asks for', async () => {
    // Not this visit type's to change: it asks for no diagnosis codes.
    const reasonCode = [{ text: 'Follow-up on prior imaging' }];
    const appointment: WithId<Appointment> = {
      ...BOOKED_APPOINTMENT,
      id: 'appt-procedures-only',
      serviceType: [
        {
          text: 'Imaging With Procedures',
          extension: [
            {
              url: ServiceTypeReferenceURI,
              valueReference: { reference: `HealthcareService/${PROCEDURE_SERVICE.id}` },
            },
          ],
        },
      ],
      reasonCode,
    };
    await medplum.createResource(appointment);
    await renderEditable(appointment);

    await screen.findByRole('searchbox', { name: /procedure code/i });
    expect(screen.queryByRole('searchbox', { name: /diagnosis code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /medical necessity/i })).not.toBeInTheDocument();

    await enterCode(/procedure code/i, ProcedureCodes[0]);
    await clickSave();

    const stored = await medplum.readResource('Appointment', appointment.id);
    expect(stored.serviceType).toEqual([appointment.serviceType?.[0], { coding: [ProcedureCodes[0]] }]);
    expect(stored.reasonCode).toEqual(reasonCode);
    expect(stored.extension).toBeUndefined();
  });

  test('asks for everything the visit type requires on a visit that has none of it on file', async () => {
    const bare: WithId<Appointment> = {
      ...AUTHORIZED_APPOINTMENT,
      id: 'appt-infusion-bare',
      serviceType: AUTHORIZED_APPOINTMENT.serviceType?.slice(0, 1),
      reasonCode: undefined,
      extension: undefined,
    };
    await medplum.createResource(bare);
    await renderEditable(bare);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    expect(hasPill(codePill(ProcedureCodes[0]))).toBe(false);
    expect(medicalNecessityBox()).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Confirm medical necessity.')).toBeInTheDocument();

    expect(screen.getByText('Add at least one diagnosis code.')).toBeInTheDocument();
    await enterCode(/procedure code/i, ProcedureCodes[0]);
    await enterCode(/diagnosis code/i, DiagnosisCodes[0]);
    expect(screen.queryByText('Add at least one diagnosis code.')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await confirmMedicalNecessity();
    await clickSave();

    const stored = await medplum.readResource('Appointment', bare.id);
    expect(stored.serviceType).toEqual(AUTHORIZED_APPOINTMENT.serviceType);
    expect(stored.reasonCode).toEqual(AUTHORIZED_APPOINTMENT.reasonCode);
    expect(stored.extension).toEqual(AUTHORIZED_APPOINTMENT.extension);
  });

  test('discards unsaved changes when the form is left', async () => {
    const update = vi.spyOn(medplum, 'updateResource');
    await renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });
    await enterCode(/procedure code/i, ProcedureCodes[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Appointment Details' }));
    expect(screen.queryByRole('button', { name: 'Update Appointment' })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(updateButton() as HTMLElement);
    await screen.findByRole('searchbox', { name: /procedure code/i });
    expect(hasPill(codePill(ProcedureCodes[1]))).toBe(false);
    expect(saveButton()).toBeDisabled();
  });

  test('saves the details alone with one update and no $reschedule', async () => {
    const post = vi.spyOn(medplum, 'post');
    const update = vi.spyOn(medplum, 'updateResource');
    const onUpdated = vi.fn();
    await medplum.createResource(AUTHORIZED_APPOINTMENT);
    await renderEditable(AUTHORIZED_APPOINTMENT, onUpdated);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    await clickSave();

    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.filter(([url]) => String(url).includes('$reschedule'))).toHaveLength(0);
  });

  test('shows a refused save and keeps what was entered', async () => {
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Precondition failed'));
    await renderEditable(AUTHORIZED_APPOINTMENT);
    await screen.findByRole('searchbox', { name: /procedure code/i });

    await enterCode(/procedure code/i, ProcedureCodes[1]);
    await clickSave();

    expect(await screen.findByText('Precondition failed')).toBeInTheDocument();
    expect(hasPill(codePill(ProcedureCodes[1]))).toBe(true);
    expect(saveButton()).toBeEnabled();
  });
});
