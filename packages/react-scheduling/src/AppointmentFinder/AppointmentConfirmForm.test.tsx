// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import {
  MainClinic,
  SchedulingFixtures,
  UltrasoundImagingService,
  buildProposedAppointment,
} from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AppointmentBookingDraft, AppointmentConfirmFormProps } from './AppointmentConfirmForm';
import { AppointmentConfirmForm, getBookingError } from './AppointmentConfirmForm';

const EASTERN = 'America/New_York';
const medplum = new MockClient();

const APPOINTMENT = buildProposedAppointment({
  start: '2026-07-27T16:30:00.000Z',
  actorReferences: [
    { reference: 'PractitionerRole/role-dr-chen', display: 'Dr. Wei Chen' },
    { reference: 'Location/or-3', display: 'Operating Room 3' },
  ],
});

function Harness(props: Partial<AppointmentConfirmFormProps>): JSX.Element {
  const [value, setValue] = useState<AppointmentBookingDraft>({});
  return (
    <AppointmentConfirmForm appointment={APPOINTMENT} timezone={EASTERN} value={value} onChange={setValue} {...props} />
  );
}

function setup(props: Partial<AppointmentConfirmFormProps>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<Harness {...props} />, wrapper);
}

describe('AppointmentConfirmForm', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
  });

  test('Reads back the time in the scheduling timezone', () => {
    setup({});

    // 16:30 UTC is 12:30 on the clinic's Eastern clock.
    expect(screen.getByText('Monday, July 27 at 12:30 PM')).toBeInTheDocument();
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('Times are in America/New_York.')).toBeInTheDocument();
  });

  test('Names each actor with the role it fills', () => {
    setup({});

    const summary = screen.getByTestId('appointment-summary');
    expect(summary).toHaveTextContent('Provider');
    expect(summary).toHaveTextContent('Room');
  });

  test('Names a provider booked through a role by their own name, not the role', () => {
    setup({});

    // The actor is a PractitionerRole, so formatting the resource would read
    // "Doctor" and every surgeon would be named the same.
    expect(screen.getByTestId('appointment-summary')).toHaveTextContent('Dr. Wei Chen');
  });

  test('Reads back the service and the site when the caller names them', () => {
    setup({ service: UltrasoundImagingService, location: MainClinic });

    const summary = screen.getByTestId('appointment-summary');
    expect(summary).toHaveTextContent('Ultrasound Imaging');
    expect(summary).toHaveTextContent('Uro Associates - Main Clinic');
  });

  test('Asks for a patient, unless the caller already knows who it is', () => {
    setup({});
    expect(screen.getByPlaceholderText('Search by name')).toBeInTheDocument();
  });

  test('Does not ask for a patient the caller supplied', async () => {
    setup({
      patient: { resourceType: 'Patient', id: 'homer', name: [{ given: ['Homer'], family: 'Simpson' }] },
    });

    expect(screen.queryByPlaceholderText('Search by name')).not.toBeInTheDocument();
    expect((await screen.findAllByText('Homer Simpson')).length).toBeGreaterThan(0);
  });

  test('Records the reason and the instructions', async () => {
    setup({});

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Reason for visit/ }), {
        target: { value: 'Follow-up scan' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Patient instructions/ }), {
        target: { value: 'Drink water beforehand' },
      });
    });

    expect(screen.getByRole('textbox', { name: /Reason for visit/ })).toHaveValue('Follow-up scan');
    expect(screen.getByRole('textbox', { name: /Patient instructions/ })).toHaveValue('Drink water beforehand');
  });

  test('Warns about a time nobody offered', () => {
    setup({ available: false });

    expect(screen.getByText('This time was not offered')).toBeInTheDocument();
    expect(screen.getByText(/may double-book/)).toBeInTheDocument();
  });

  test('Says nothing about availability for a time that was offered', () => {
    setup({});
    expect(screen.queryByText('This time was not offered')).not.toBeInTheDocument();
  });

  test('Offers a way out to creating a patient only when the caller has one', async () => {
    const onCreatePatient = vi.fn();
    setup({ onCreatePatient });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New patient' }));
    });

    expect(onCreatePatient).toHaveBeenCalled();
  });

  test('Leaves out the way to create a patient when the caller cannot', () => {
    setup({});
    expect(screen.queryByRole('button', { name: 'New patient' })).not.toBeInTheDocument();
  });

  test('Shows the host’s own fields under the ones it asks for itself', () => {
    setup({
      additionalFields: (
        <label>
          CPT code
          <input name="cpt" />
        </label>
      ),
    });

    expect(screen.getByRole('textbox', { name: 'CPT code' })).toBeInTheDocument();
    // In the form, not in the read-back, which stays a summary of the appointment.
    expect(screen.getByTestId('appointment-summary')).not.toHaveTextContent('CPT code');
  });

  test('Asks nothing extra when the host has nothing to add', () => {
    setup({});
    expect(screen.queryByRole('textbox', { name: 'CPT code' })).not.toBeInTheDocument();
  });
});

describe('getBookingError', () => {
  test('Insists on a patient', () => {
    expect(getBookingError({}, undefined)).toBe('Choose a patient');
  });

  test('Accepts a patient from either the draft or the caller', () => {
    expect(getBookingError({}, { reference: 'Patient/homer' })).toBeUndefined();
    expect(getBookingError({ patient: { resourceType: 'Patient', id: 'homer' } }, undefined)).toBeUndefined();
  });
});
