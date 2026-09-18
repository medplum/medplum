// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { readAppointmentWrite } from './AppointmentFinder.writes';
import type { AppointmentProposalFormProps, BookOptions } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';
import { writeElevatedBooking } from './buildElevatedBooking';

/** What a booking wrote, as `Appointment/$book` returned it. */
export type AppointmentBooking = AppointmentWrite;

export interface AppointmentBookingFormProps extends Omit<AppointmentProposalFormProps, 'onSubmit' | 'mode'> {
  /**
   * Called with what the booking wrote.
   *
   * The answers stay on screen and the form stops offering to book until one of
   * them changes, so a host can keep this mounted without it writing twice. A
   * failure here is logged rather than shown as a refusal: the appointment exists
   * by the time it runs.
   */
  readonly onBooked: (booking: AppointmentBooking) => void | Promise<void>;
}

/**
 * The booking form, writing the booking itself.
 *
 * Wraps {@link AppointmentProposalForm}: writes the booking, announces the
 * appointment and every time it reserved so views reading them refresh, then
 * reports what was written through `onBooked` — the only required prop.
 *
 * A host doing something else with the proposal mounts the proposal form instead.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentBookingForm(props: AppointmentBookingFormProps): JSX.Element {
  const { onBooked, ...formProps } = props;
  const medplum = useMedplum();

  const book = useCallback(
    async (proposal: Appointment, options: BookOptions): Promise<void> => {
      // A typed time would be refused by `$book`: nothing checked it.
      const written = options.manual
        ? await writeElevatedBooking(medplum, proposal)
        : await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(medplum.fhirUrl('Appointment', '$book'), {
            resourceType: 'Parameters',
            parameter: [{ name: 'appointment', resource: proposal }],
          });
      const booking = readAppointmentWrite(written, options.manual ? 'manual booking' : '$book');

      // Neither path above notifies the client what it changed.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'create',
        id: booking.appointment.id,
        resource: booking.appointment,
      });
      for (const slot of booking.slots) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
      }

      try {
        await onBooked(booking);
      } catch (error) {
        // Not rethrown: the form would paint it as the booking's refusal, and a red
        // refusal over an appointment that exists reads as a time still free.
        console.error(error);
      }
    },
    [medplum, onBooked]
  );

  return <AppointmentProposalForm {...formProps} onSubmit={book} />;
}
