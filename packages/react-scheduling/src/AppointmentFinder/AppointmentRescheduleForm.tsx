// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, isDefined, resolveId } from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { readAppointmentWrite } from './AppointmentFinder.writes';
import type { AppointmentProposalFormProps } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';
import { useRescheduleDefaults } from './useRescheduleDefaults';

/** What a reschedule wrote, as `Appointment/[id]/$reschedule` returned it. */
export type AppointmentReschedule = AppointmentWrite;

// TODO: support "canBypassSchedulingRules" here
export interface AppointmentRescheduleFormProps extends Omit<
  AppointmentProposalFormProps,
  | 'onSubmit'
  | 'mode'
  | 'defaultService'
  | 'defaultSelections'
  | 'defaultPatient'
  | 'ignoreAppointment'
  | 'mrnSystem'
  | 'procedureBinding'
  | 'diagnosisBinding'
  | 'canBypassSchedulingRules'
  | 'appointmentExtensions'
> {
  /** The appointment being moved. */
  readonly appointment: WithId<Appointment>;
  /**
   * Called with what the move wrote.
   *
   * The answers stay on screen and the form stops offering to move until one of them
   * changes, so a host can keep this mounted without it writing twice. A failure here
   * is logged rather than shown as a refusal: the appointment has already moved by the
   * time it runs.
   */
  readonly onRescheduled: (reschedule: AppointmentReschedule) => void | Promise<void>;
}

/**
 * The form that moves a visit already on file, to another time or another set of actors.
 *
 * Wraps {@link AppointmentProposalForm}, opened on what the appointment is held on now
 * and searching as though it were not: the time it occupies is the time it is being
 * moved off, so `$find` is told to ignore it, which is what lets the same hour in a
 * different room be found.
 *
 * Posts `Appointment/[id]/$reschedule`, announces the appointment, the times it gave up
 * and the times it took, so views reading them refresh, then reports what was written
 * through `onRescheduled`.
 *
 * Only the time and the actors are asked for. Everything else on the appointment — who
 * it is for, its status, its visit type, whatever clinical detail it carries — is left
 * exactly as it was, because that is all the operation will write. The visit type is
 * shown rather than offered: `$reschedule` refuses one the appointment is not on file
 * for, since changing what a visit *is* would leave its required codes, its
 * authorization, and anything applied at booking keyed to a type it no longer has.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentRescheduleForm(props: AppointmentRescheduleFormProps): JSX.Element {
  const { appointment, onRescheduled, defaultStart, ...formProps } = props;
  const medplum = useMedplum();
  const defaults = useRescheduleDefaults(appointment);

  const reschedule = useCallback(
    async (proposal: Appointment): Promise<void> => {
      const service = extractServiceTypeReferences(proposal.serviceType)[0];
      const schedules = getProposedSchedules(proposal);

      // Assert that the shape we received matches what we need for `$reschedule`;
      // these fields are always present if we got the results from `$find`.
      if (!proposal.start) {
        throw new Error('The chosen time does not say when it is');
      }
      if (!service) {
        throw new Error('The chosen time does not say which service type it belongs to');
      }
      if (schedules.length === 0) {
        throw new Error('The chosen time does not say which schedules to hold it on');
      }

      // Read before the request: the operation deletes these, and the appointment comes
      // back pointing at the times it took instead.
      const releasedSlotIds = (appointment.slot ?? []).map(resolveId).filter(isDefined);

      const written = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', appointment.id, '$reschedule'),
        {
          resourceType: 'Parameters',
          parameter: [
            { name: 'start', valueDateTime: proposal.start },
            { name: 'service-type-reference', valueReference: service },
            ...schedules.map((reference) => ({ name: 'schedule', valueReference: { reference } })),
          ],
        } satisfies Parameters
      );
      const result = readAppointmentWrite(written, '$reschedule');

      // `$reschedule` is a custom operation, so the client cannot tell what it changed.
      // It deletes the existing slots, creates new ones, and updates `appointment.slot`
      // with the fresh references.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'update',
        id: result.appointment.id,
        resource: result.appointment,
      });
      for (const id of releasedSlotIds) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id });
      }
      for (const slot of result.slots) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
      }

      try {
        await onRescheduled(result);
      } catch (error) {
        console.error(error);
      }
    },
    [appointment, medplum, onRescheduled]
  );

  if (defaults.loading) {
    // The form takes its defaults at mount and never again, so it is not mounted until
    // there are defaults to take.
    return <Loader size="sm" />;
  }

  return (
    <>
      {defaults.incomplete && (
        // A move writes the actors it is given, so one missing from the fields below is
        // one about to be dropped off the visit. Not a wrapper around the form either
        // way: an unasked-for element between a host and the form would lay it out.
        <Alert color="yellow" mb="sm">
          Some of what this visit is held on could not be read back. Check who is named below before moving it.
        </Alert>
      )}
      <AppointmentProposalForm
        {...formProps}
        mode="reschedule"
        defaultService={defaults.service}
        defaultSelections={defaults.selections}
        defaultStart={defaultStart ?? getOpeningDay(appointment)}
        ignoreAppointment={appointment}
        onSubmit={reschedule}
      />
    </>
  );
}

/**
 * The day the time search opens on: the day the visit is on now.
 *
 * Floored at today, since a visit can only be moved forwards — opening the calendar on
 * the month a missed visit used to be in would point away from everything on offer.
 *
 * @param appointment - The appointment being moved.
 * @returns The day to open on.
 */
function getOpeningDay(appointment: Appointment): Date {
  const now = new Date();
  const start = appointment.start ? new Date(appointment.start) : undefined;
  return start && start > now ? start : now;
}

/**
 * The Schedules a proposed time would be held on.
 *
 * Read off the proposal's contained Slots rather than off the answers that found it:
 * the proposal is what is being written, and its Slots are what `$find` laid out.
 *
 * @param proposal - A time as `$find` offered it.
 * @returns The schedule references, deduped — a schedule holds a buffer Slot either
 * side of the visit as well as the visit's own.
 */
function getProposedSchedules(proposal: Appointment): string[] {
  const slots = (proposal.contained ?? []).filter((resource) => resource.resourceType === 'Slot');
  return [...new Set(slots.map((slot) => slot.schedule.reference).filter(isDefined))];
}
