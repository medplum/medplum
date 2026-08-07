// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { AppointmentPatientSelect } from './AppointmentPatientSelect';

export default {
  title: 'Medplum/AppointmentPatientSelect',
  component: AppointmentPatientSelect,
} as Meta;

const HOMER = HomerSimpson as WithId<Patient>;

/**
 * Search for "Simpson".
 *
 * Each match is offered with their birth date and medical record number, which
 * are the two things the person booking has to check against — a birth date
 * against the caller, an MRN against whatever else is open on the desk. Matches
 * are listed oldest first.
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [patient, setPatient] = useState<WithId<Patient>>();
  return (
    <Document>
      <AppointmentPatientSelect patient={patient} onChange={setPatient} />
      <Text size="sm" c="dimmed" mt="md">
        {patient ? `Chose ${patient.id}` : 'Nobody chosen yet'}
      </Text>
    </Document>
  );
};

/**
 * A patient carried in from elsewhere, such as the chart the booking started from.
 * @returns The story.
 */
export const AlreadyChosen = (): JSX.Element => {
  const [patient, setPatient] = useState<WithId<Patient> | undefined>(HOMER);
  return (
    <Document>
      <AppointmentPatientSelect patient={patient} onChange={setPatient} />
    </Document>
  );
};

export const WithError = (): JSX.Element => {
  const [patient, setPatient] = useState<WithId<Patient>>();
  return (
    <Document>
      <AppointmentPatientSelect patient={patient} onChange={setPatient} error="Choose a patient" />
    </Document>
  );
};

export const Disabled = (): JSX.Element => (
  <Document>
    <AppointmentPatientSelect patient={HOMER} onChange={() => undefined} disabled />
  </Document>
);
