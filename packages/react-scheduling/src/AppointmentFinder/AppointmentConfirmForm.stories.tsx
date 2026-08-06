// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Textarea } from '@mantine/core';
import type { CodeableConcept, Patient } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { CodeableConceptInput, Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import { MainClinic, UltrasoundImagingService, buildProposedAppointment } from '../stories/scheduling';
import type { AppointmentBookingDraft } from './AppointmentConfirmForm';
import { AppointmentConfirmForm } from './AppointmentConfirmForm';

export default {
  title: 'Medplum/AppointmentConfirmForm',
  component: AppointmentConfirmForm,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

/** 10:00 on the clinic's own clock, with Dr. Rivera in Exam Room A. */
const APPOINTMENT = buildProposedAppointment({
  start: '2020-05-05T14:00:00.000Z',
  actorReferences: [
    { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' },
    { reference: 'Location/exam-room-a', display: 'Exam Room A' },
  ],
});

/**
 * The form, holding what has been filled in.
 * @param props - The React props.
 * @param props.patient - A patient the host already knew about.
 * @param props.available - Whether the search offered this time.
 * @param props.additionalFields - Fields of the host's own.
 * @returns The form.
 */
function ConfirmForm(props: {
  readonly patient?: Patient;
  readonly available?: boolean;
  readonly additionalFields?: JSX.Element;
}): JSX.Element {
  const [draft, setDraft] = useState<AppointmentBookingDraft>({});
  return (
    <Document>
      <AppointmentConfirmForm
        appointment={APPOINTMENT}
        value={draft}
        onChange={setDraft}
        patient={props.patient}
        service={UltrasoundImagingService}
        location={MainClinic}
        timezone={TIMEZONE}
        available={props.available}
        additionalFields={props.additionalFields}
        onCreatePatient={() => console.log('Create a patient')}
      />
    </Document>
  );
}

/**
 * The last step on its own: the time, the actors and the site are read back
 * rather than re-asked, and the form collects what only the person booking knows.
 * @returns The story.
 */
export const Basic = (): JSX.Element => <ConfirmForm />;

/**
 * A patient the host already knew about, which replaces the search with a read-back.
 * @returns The story.
 */
export const KnownPatient = (): JSX.Element => <ConfirmForm patient={HomerSimpson} />;

/**
 * A time nobody's availability was checked for, which is what asking for a
 * specific time leaves. Booking it may double-book whoever it is held on, so the
 * form says so before it is confirmed.
 * @returns The story.
 */
export const ATimeThatWasNotOffered = (): JSX.Element => <ConfirmForm available={false} />;

/**
 * A practice that records more than a booking needs: what it will bill for, what
 * it is billing against, and notes of its own.
 *
 * The fields belong to the host, and so does the decision about where their
 * values land on the appointment. `AppointmentFinder`'s story of the same name
 * shows that second half, in the `onBook` it hands the appointment to.
 * @returns The story.
 */
export const AdditionalFields = (): JSX.Element => {
  const [note, setNote] = useState('');
  const [, setProcedure] = useState<CodeableConcept>();
  const [, setDiagnosis] = useState<CodeableConcept>();

  return (
    <ConfirmForm
      additionalFields={
        <>
          <CodeableConceptInput
            name="procedure"
            label="CPT code"
            description="What is being billed for."
            path="Appointment.extension"
            binding="http://www.ama-assn.org/go/cpt"
            onChange={setProcedure}
          />
          <CodeableConceptInput
            name="diagnosis"
            label="ICD-10 diagnosis"
            description="What it is being billed against."
            path="Appointment.reasonCode"
            binding="http://hl7.org/fhir/ValueSet/icd-10"
            onChange={setDiagnosis}
          />
          <Textarea
            label="Scheduling notes"
            description="Kept by the practice, alongside the reason for the visit."
            autosize
            minRows={2}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </>
      }
    />
  );
};
