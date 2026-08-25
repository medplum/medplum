// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isDefined } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { AppointmentProposalFormProps } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';

/** What a booking wrote, as `Appointment/$book` returned it. */
export interface AppointmentBooking {
  readonly appointment: WithId<Appointment>;
  /** The times reserved for it, one per schedule it is held on. */
  readonly slots: readonly WithId<Slot>[];
}

export interface AppointmentBookingFormProps extends Omit<AppointmentProposalFormProps, 'onBook'> {
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
 * Wraps {@link AppointmentProposalForm}: posts `Appointment/$book`, announces the
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
    async (proposal: Appointment): Promise<void> => {
      const written = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', '$book'),
        { resourceType: 'Parameters', parameter: [{ name: 'appointment', resource: proposal }] }
      );
      const booking = readBooking(written);

      // `$book` is a custom operation, so the client cannot tell what it changed.
      // Announcing it is what refreshes a host's calendar beside this form.
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

  return <AppointmentProposalForm {...formProps} onBook={book} />;
}

/**
 * Reads what `$book` wrote out of the bundle it answers with.
 * @param written - The bundle `$book` returned.
 * @returns The appointment and the times reserved for it.
 */
function readBooking(written: Bundle<WithId<Appointment> | WithId<Slot>>): AppointmentBooking {
  const resources = (written.entry ?? []).map((entry) => entry.resource).filter(isDefined);
  const appointment = resources.find((resource) => resource.resourceType === 'Appointment');
  if (!appointment) {
    // Cannot happen against a server that honoured the request, and the host is
    // owed an appointment rather than a silent success.
    throw new Error('$book returned no appointment');
  }
  return { appointment, slots: resources.filter((resource) => resource.resourceType === 'Slot') };
}
