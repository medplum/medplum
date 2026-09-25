// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatCodeableConcept, isDefined, normalizeErrorString, resolveId } from '@medplum/core';
import type { Appointment, CodeableConcept, Parameters, Reference } from '@medplum/fhirtypes';
import { CodeableConceptInput, ResourceName } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import { IconArrowLeft, IconCalendarEvent } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { Fragment, useCallback, useState } from 'react';
import { formatDayHeading, formatZonedTime } from '../../AppointmentFinder/AppointmentFinder.times';
import type { AppointmentReschedule } from '../../AppointmentFinder/AppointmentRescheduleForm';
import { AppointmentRescheduleForm } from '../../AppointmentFinder/AppointmentRescheduleForm';
import { APPOINTMENT_CANCELLATION_REASON_VALUE_SET } from '../../constants';
import classes from './AppointmentDetails.module.css';
import { getPatientParticipant, partitionServiceTypes } from './AppointmentDetails.utils';
import { AppointmentDetailsForm } from './AppointmentDetailsForm';

/** The statuses `Appointment/:id/$cancel` accepts. It refuses any other with a 400. */
const CANCELABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set(['pending', 'booked']);

/**
 * The statuses `Appointment/:id/$reschedule` accepts. It refuses any other with a 400.
 *
 * The same statuses a cancellation accepts today, but a guard of its own: what can be
 * called off and what can be moved are separate questions to the server.
 */
const RESCHEDULABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set(['pending', 'booked']);

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

export interface AppointmentCancelFormProps {
  readonly appointment: WithId<Appointment>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Overrides the value set the cancellation reason is coded against. */
  readonly cancellationReasonValueSet?: string;
}

export interface AppointmentDetailsProps {
  readonly appointment: WithId<Appointment>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /**
   * Called with what a move wrote, after the view has gone back to the details.
   *
   * The appointment shown is the one the host handed over, so a host keeping this
   * mounted hands over the moved one — from its own data, or from this callback.
   */
  readonly onRescheduled?: (reschedule: AppointmentReschedule) => void | Promise<void>;
  /**
   * Called when the reschedule form's time search opens or closes.
   *
   * The times render beside that form rather than under it, so a host showing this in a
   * drawer or a panel has to widen it to fit them — under the width they need they wrap,
   * and the times land below the form instead.
   *
   * Leaving the reschedule view reports the search closed whether or not it was open:
   * the form goes with the view, and so does the room it asked for.
   */
  readonly onToggleTimeFinder?: (open: boolean) => void;
  /** Overrides the value set the cancellation reason is coded against. */
  readonly cancellationReasonValueSet?: string;
  /** The ValueSet the procedure code field binds to. Defaults to the full CPT value set. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to the full ICD-10-CM value set. */
  readonly diagnosisBinding?: string;
  /** Called with the appointment as written, after the patient or the visit type's codes are saved. */
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
}

export function AppointmentCancelForm(props: AppointmentCancelFormProps): JSX.Element {
  const { appointment, onCancelled, cancellationReasonValueSet } = props;
  const medplum = useMedplum();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>();
  const [reason, setReason] = useState<CodeableConcept>();

  const cancel = useCallback(async (): Promise<void> => {
    if (!reason) {
      return;
    }
    setCancelling(true);
    setCancelError(undefined);
    try {
      const cancelled = await medplum.post<WithId<Appointment>>(
        medplum.fhirUrl('Appointment', appointment.id, '$cancel'),
        {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'cancelationReason',
              valueCodeableConcept: reason,
            },
          ],
        } satisfies Parameters
      );

      // `$cancel` is a custom operation, so the MedplumClient cannot tell what it changed.
      // Announce changes to the Appointment so other UI can reflect this update.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'update',
        id: cancelled.id,
        resource: cancelled,
      });
      // The operation deleted the Slots the appointment was holding. Read off the
      // appointment as it stood before.
      for (const slot of appointment.slot ?? []) {
        const id = resolveId(slot);
        if (id) {
          medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id });
        }
      }

      try {
        await onCancelled?.(cancelled);
      } catch (error) {
        console.error(error);
      }
    } catch (err: unknown) {
      setCancelError(err);
    } finally {
      setCancelling(false);
    }
  }, [appointment, medplum, onCancelled, reason]);

  return (
    <>
      <Title order={5}>Cancel this appointment</Title>
      {cancelError !== undefined && (
        <Alert color="red" title="Could not cancel this appointment">
          {normalizeErrorString(cancelError)}
        </Alert>
      )}
      <CodeableConceptInput
        name="cancelationReason"
        path="Appointment.cancelationReason"
        binding={cancellationReasonValueSet ?? APPOINTMENT_CANCELLATION_REASON_VALUE_SET}
        label="Cancellation reason"
        placeholder="Search reasons"
        maxValues={1}
        creatable={true}
        withHelpText={false}
        required
        onChange={setReason}
      />
      <Button color="red" loading={cancelling} disabled={!reason} onClick={cancel}>
        Confirm Cancellation
      </Button>
    </>
  );
}

/**
 * Shows a detail view of a single appointment
 *
 * Has sub-views for rescheduling and cancelling the appointment.
 *
 * @param props - The React props
 * @param props.appointment - The Appointment resource to detail
 * @param props.cancellationReasonValueSet - The value set to offer cancellation reasons from,
 * in place of the default binding
 * @param props.onCancelled - A callback that can be invoked after a successful $cancel
 * @param props.onRescheduled - A callback that can be invoked after a successful $reschedule
 * @param props.onUpdated - A callback that can be invoked after the editable details are saved
 * @param props.procedureBinding - The value set the procedure code field binds to
 * @param props.diagnosisBinding - The value set the diagnosis code field binds to
 * @param props.onToggleTimeFinder - A callback told when the reschedule form's time search
 * opens or closes, for a host that has to widen to fit it
 * @returns The details component
 */
export function AppointmentDetails(props: AppointmentDetailsProps): JSX.Element {
  const { appointment, onCancelled, onToggleTimeFinder, onRescheduled, onUpdated, procedureBinding, diagnosisBinding } =
    props;
  const patient = getPatientParticipant(appointment)?.actor;
  const otherActors = getOtherActors(appointment);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const patientLine = (
    <Detail label="Patient" value={patient && <ResourceName value={patient} link={false} inherit />} />
  );
  const whenLine = <Detail label="When" value={formatWhen(appointment)} />;

  const innerOnCancelled = useCallback(
    (appointment: WithId<Appointment>) => {
      setCancelling(false);
      return onCancelled?.(appointment);
    },
    [setCancelling, onCancelled]
  );

  function stopRescheduling(): void {
    setRescheduling(false);
    // The form is going, and with it any times it had open beside itself.
    onToggleTimeFinder?.(false);
  }

  function finishRescheduling(reschedule: AppointmentReschedule): void | Promise<void> {
    // Back to the details, which are read off the appointment the host hands over: the
    // one just written, once whatever is watching the appointment has caught up.
    stopRescheduling();
    return onRescheduled?.(reschedule);
  }

  if (cancelling) {
    return (
      <Stack gap="sm" className={classes.details}>
        {patientLine}
        {whenLine}
        <AppointmentCancelForm
          appointment={appointment}
          onCancelled={innerOnCancelled}
          cancellationReasonValueSet={props.cancellationReasonValueSet}
        />
        <Stack gap="sm" className={classes.actions}>
          <Button onClick={() => setCancelling(false)} variant="outline">
            Back to Appointment Details
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (rescheduling) {
    return (
      <Stack gap="sm" className={classes.details}>
        <Group justify="space-between" wrap="nowrap">
          {/* Its own heading: a host showing this in a panel titled for the details has
              no way of knowing the view underneath it changed. */}
          <Title order={5}>Reschedule appointment</Title>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} stroke={1.8} />}
            onClick={stopRescheduling}
          >
            Back
          </Button>
        </Group>
        <AppointmentRescheduleForm
          appointment={appointment}
          onToggleTimeFinder={onToggleTimeFinder}
          onRescheduled={finishRescheduling}
        />
      </Stack>
    );
  }

  const cancelable = CANCELABLE_STATUSES.has(appointment.status);
  const { visitTypes } = partitionServiceTypes(appointment);

  // Both pages fill the pane the same way, so what can be done to the visit sits at the
  // foot of either.
  return (
    <Stack gap="sm" className={classes.details}>
      <Badge color={STATUS_COLORS[appointment.status]}>{appointment.status}</Badge>
      {whenLine}
      <Detail label="Service" value={formatService(appointment, visitTypes)} />
      <Detail
        label="With"
        value={
          otherActors.length > 0
            ? otherActors.map((actor, index) => (
                <Fragment key={actor.reference ?? `actor-${index}`}>
                  {index > 0 && ', '}
                  <ResourceName value={actor} link={false} inherit />
                </Fragment>
              ))
            : undefined
        }
      />
      <Detail label="Notes" value={appointment.comment ?? appointment.description} />
      <Detail label="Cancellation reason" value={formatCodeableConcept(appointment.cancelationReason) || undefined} />
      <AppointmentDetailsForm
        appointment={appointment}
        procedureBinding={procedureBinding}
        diagnosisBinding={diagnosisBinding}
        onUpdated={onUpdated}
      />
      <Stack gap="sm" className={classes.actions}>
        <Divider />
        {RESCHEDULABLE_STATUSES.has(appointment.status) && (
          <Button
            variant="outline"
            leftSection={<IconCalendarEvent size={16} stroke={1.8} />}
            onClick={() => setRescheduling(true)}
          >
            Reschedule
          </Button>
        )}
        <Button onClick={() => setCancelling(true)} disabled={!cancelable} variant="outline">
          Cancel Appointment
        </Button>
        {!cancelable && (
          <Text size="sm" c="dimmed">
            {appointment.status === 'cancelled'
              ? 'This appointment is cancelled.'
              : `An appointment in '${appointment.status}' status cannot be cancelled.`}
          </Text>
        )}
      </Stack>
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
 * @param visitTypes - The `serviceType` entries naming the visit type.
 * @returns The service or appointment type, or undefined when neither is on file.
 */
function formatService(appointment: Appointment, visitTypes: CodeableConcept[]): string | undefined {
  const service = visitTypes.map(formatCodeableConcept).filter(Boolean).join(', ');
  return service || formatCodeableConcept(appointment.appointmentType) || undefined;
}
