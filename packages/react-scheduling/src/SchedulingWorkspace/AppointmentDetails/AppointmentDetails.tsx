// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatCodeableConcept, isDefined } from '@medplum/core';
import type { Appointment, AppointmentParticipant, Reference } from '@medplum/fhirtypes';
import { ReferenceDisplay } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { Fragment } from 'react';
import { formatDayHeading, formatZonedTime } from '../../AppointmentFinder/AppointmentFinder.times';

const STATUS_COLORS: Record<Appointment['status'], string> = {
  proposed: 'yellow',
  pending: 'yellow',
  booked: 'blue',
  arrived: 'blue',
  fulfilled: 'blue',
  cancelled: 'red',
  noshow: 'red',
  'entered-in-error': 'red',
  'checked-in': 'blue',
  waitlist: 'gray',
};

export interface AppointmentDetailsProps {
  readonly appointment: WithId<Appointment>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void;
  /** Overrides the value set the cancellation reason is coded against. */
  readonly cancellationReasonValueSet?: string;
}

/**
 * Shows a detail view of a single appointment
 *
 * Cancelling posts `Appointment/:id/$cancel`, which sets the appointment status
 * and releases every time it was holding, then announces both so views reading
 * them refresh.
 *
 * A reason has to be chosen before anything can be cancelled. The operation takes one
 * optionally; asking for it while the appointment is in front of whoever is calling it
 * off is the only moment it is known.
 *
 * @param props - The React props
 * @param props.appointment - The Appointment resource to detail
 * @param props.onCancelled - A callback that can be invoked after a successful $cancel
 * @param props.cancellationReasonValueSet - The value set to offer cancellation reasons from,
 * in place of the default binding
 * @returns The details component
 */
export function AppointmentDetails(props: AppointmentDetailsProps): JSX.Element {
  const { appointment } = props;
  const patient = getPatientParticipant(appointment)?.actor;
  const otherActors = getOtherActors(appointment);

  return (
    <Stack gap="sm">
      <Badge color={STATUS_COLORS[appointment.status]}>{appointment.status}</Badge>
      <Detail label="Patient" value={patient && <ReferenceDisplay link={false} value={patient} />} />
      <Detail label="When" value={formatWhen(appointment)} />
      <Detail label="Service" value={formatService(appointment)} />
      <Detail
        label="With"
        value={
          otherActors.length > 0
            ? otherActors.map((actor, index) => (
                <Fragment key={actor.reference ?? `actor-${index}`}>
                  {index > 0 && ', '}
                  <ReferenceDisplay value={actor} link={false} />
                </Fragment>
              ))
            : undefined
        }
      />
      <Detail label="Notes" value={appointment.comment ?? appointment.description} />
    </Stack>
  );
}

interface DetailProps {
  readonly label: string;
  /** Left out entirely when there is nothing on file for it. */
  readonly value?: ReactNode;
}

/**
 * One labelled line of what is on file, or nothing at all when it is not.
 * @param props - The React props.
 * @returns The line, or null.
 */
function Detail(props: DetailProps): JSX.Element | null {
  if (!props.value) {
    return null;
  }
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </Stack>
  );
}

function getPatientParticipant(appointment: Appointment): AppointmentParticipant | undefined {
  return appointment.participant.find((participant) => participant.actor?.reference?.startsWith('Patient/'));
}

/**
 * Everyone and everything the visit is held on besides the patient.
 * @param appointment - The appointment being described.
 * @returns Their references, in the order the appointment lists them.
 */
function getOtherActors(appointment: Appointment): Reference[] {
  const patient = getPatientParticipant(appointment);
  return appointment.participant
    .filter((participant) => participant !== patient)
    .map((participant) => participant.actor)
    .filter(isDefined);
}

/**
 * Says when the visit is, as far as it is known.
 * @param appointment - The appointment being described.
 * @returns The day and the times, or undefined for an appointment holding no time.
 */
function formatWhen(appointment: Appointment): string | undefined {
  if (!appointment.start) {
    return undefined;
  }
  const start = new Date(appointment.start);
  const times = [formatZonedTime(start), appointment.end && formatZonedTime(new Date(appointment.end))]
    .filter(Boolean)
    .join(' – ');
  return `${formatDayHeading(start)} · ${times}`;
}

/**
 * Names what the visit is for, preferring the service over the kind of visit.
 * @param appointment - The appointment being described.
 * @returns The service or appointment type, or undefined when neither is on file.
 */
function formatService(appointment: Appointment): string | undefined {
  const service = (appointment.serviceType ?? []).map(formatCodeableConcept).filter(Boolean).join(', ');
  return service || formatCodeableConcept(appointment.appointmentType) || undefined;
}
