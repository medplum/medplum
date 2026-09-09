// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { RenderResult } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { renderWithMedplum, screen } from '../../test-utils/render';
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

beforeEach(async () => {
  medplum = new MockClient();
  await medplum.createResource(HELD_SLOT);
  await medplum.createResource(BOOKED_APPOINTMENT);
});

function renderDetails(appointment: WithId<Appointment>): RenderResult {
  return renderWithMedplum(<AppointmentDetails appointment={appointment} />, medplum);
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
});
