// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, isDefined, normalizeErrorString, resolveId } from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { readAppointmentWrite } from './AppointmentFinder.writes';
import type { AppointmentProposalFormProps, BookOptions } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';
import { useRescheduleDefaults } from './useRescheduleDefaults';
import { canWriteManualReschedule, getProposedSchedules, writeElevatedReschedule } from './writeElevatedReschedule';

/** Joins names the way a sentence listing all of them would. */
const listAll = new Intl.ListFormat('en', { type: 'conjunction' });

/** The updated appointment and the slots reserved by a reschedule. */
export type AppointmentReschedule = AppointmentWrite;

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
  | 'appointmentExtensions'
  | 'allowRecurring'
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
 * Searched times use `Appointment/[id]/$reschedule`. Manually entered times create the new
 * Slots, move the appointment onto them, then delete the old Slots, keeping the existing length.
 * Announces the appointment, the times it gave up and the times it took, so views reading
 * them refresh, then reports what was written through `onRescheduled`.
 *
 * Only the time and the actors are asked for. Everything else on the appointment — who
 * it is for, its status, its visit type, whatever clinical detail it carries — is left
 * exactly as it was, because that is all the operation will write. The visit type is
 * shown rather than offered: `$reschedule` takes none, reading the one the appointment
 * is on file for instead, since changing what a visit *is* would leave its required
 * codes, its authorization, and anything applied at booking keyed to a type it no
 * longer has.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentRescheduleForm(props: AppointmentRescheduleFormProps): JSX.Element {
  const { appointment, onRescheduled, defaultStart, canBypassSchedulingRules, ...formProps } = props;
  const medplum = useMedplum();
  const defaults = useRescheduleDefaults(appointment);
  const canOverride = canWriteManualReschedule(medplum);

  const reschedule = useCallback(
    async (proposal: Appointment, options: BookOptions): Promise<void> => {
      const schedules = getProposedSchedules(proposal);

      // Always present, whether the time came from `$find` or was typed.
      if (!proposal.start) {
        throw new Error('The chosen time does not say when it is');
      }
      if (schedules.length === 0) {
        throw new Error('The chosen time does not say which schedules to hold it on');
      }

      let result: AppointmentReschedule;
      if (options.manual) {
        // Written through CRUD methods, which announce their own changes.
        result = await writeElevatedReschedule(medplum, appointment, proposal);
      } else {
        // Read before the request: the operation deletes these, and the appointment comes
        // back pointing at the times it took instead.
        const releasedSlotIds = (appointment.slot ?? []).map(resolveId).filter(isDefined);
        result = readAppointmentWrite(
          await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
            medplum.fhirUrl('Appointment', appointment.id, '$reschedule'),
            {
              resourceType: 'Parameters',
              parameter: [
                { name: 'start', valueDateTime: proposal.start },
                ...schedules.map((reference) => ({ name: 'schedule', valueReference: { reference } })),
              ],
            } satisfies Parameters
          ),
          '$reschedule'
        );

        // `$reschedule` is a custom operation, so the client cannot tell what it changed: the
        // old slots were deleted, new ones created, and `appointment.slot` repointed.
        for (const moved of result.appointments) {
          medplum.notifyResourceModified({
            resourceType: 'Appointment',
            operation: 'update',
            id: moved.id,
            resource: moved,
          });
        }
        for (const id of releasedSlotIds) {
          medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id });
        }
        for (const slot of result.slots) {
          medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
        }
      }

      try {
        await onRescheduled(result);
      } catch (error) {
        console.error(error);
      }
    },
    [appointment, medplum, onRescheduled]
  );

  const serviceRefs = extractServiceTypeReferences(appointment.serviceType);
  if (serviceRefs.length === 0) {
    return <Alert color="red">This appointment does not have a visit type, and so cannot be rescheduled.</Alert>;
  }

  if (defaults.loading) {
    // The form takes its defaults at mount and never again, so it is not mounted until
    // there are defaults to take.
    return <Loader size="sm" />;
  }

  if (defaults.error) {
    // If we failed to read the HealthcareService, or one of the Slots or Schedules currently
    // linked to the Appointment, the `$reschedule` operation will fail. Put up a blocking error.
    return (
      <Alert
        color="red"
        title="Part of what this appointment is booked on could not be read, and so it cannot be rescheduled."
      >
        {normalizeErrorString(defaults.error)}
      </Alert>
    );
  }

  const droppedNames = listAll.format(
    defaults.droppedActors.map((actor) => actor.display ?? actor.reference).filter(isDefined)
  );

  return (
    <>
      {defaults.droppedActors.length > 0 && (
        <Alert color="yellow" mb="sm">
          The following participants are not schedulable for this visit type and will be removed from this appointment
          if you continue: {droppedNames}
        </Alert>
      )}
      {canBypassSchedulingRules && !canOverride && (
        <Alert color="yellow" mb="sm">
          Scheduling rule overrides need permission to create and delete Slots and to update Appointments. You can still
          choose a time from the search.
        </Alert>
      )}
      <AppointmentProposalForm
        {...formProps}
        mode="reschedule"
        canBypassSchedulingRules={canBypassSchedulingRules && canOverride}
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
