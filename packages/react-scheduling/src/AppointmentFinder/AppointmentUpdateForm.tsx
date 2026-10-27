// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, isDefined, normalizeErrorString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { buildAppointmentUpdate, withAppointmentSite } from './AppointmentFinder.updates';
import type { AppointmentProposalFormProps, AppointmentProposalUpdate } from './AppointmentProposalForm';
import { AppointmentProposalForm } from './AppointmentProposalForm';
import type { AppointmentReschedule } from './AppointmentRescheduleForm';
import { getOpeningDay, rescheduleAppointment } from './rescheduleAppointment';
import { useRescheduleDefaults } from './useRescheduleDefaults';

/** Joins names the way a sentence listing all of them would. */
const listAll = new Intl.ListFormat('en', { type: 'conjunction' });

export interface AppointmentUpdateFormProps extends Omit<
  AppointmentProposalFormProps,
  | 'onSubmit'
  | 'onUpdate'
  | 'mode'
  | 'defaultService'
  | 'defaultSelections'
  | 'defaultPatient'
  | 'ignoreAppointment'
  | 'ignoreAppointmentSchedules'
  | 'appointmentExtensions'
  | 'allowRecurring'
> {
  /** The appointment being changed. */
  readonly appointment: WithId<Appointment>;
  /** Called with what a move wrote, as soon as it is written. */
  readonly onRescheduled?: (reschedule: AppointmentReschedule) => void | Promise<void>;
  /** Called with the appointment as written, after the patient or the visit type's codes are saved. */
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Called once everything a save changed is written, after `onRescheduled` and `onUpdated`. */
  readonly onSaved?: () => void;
}

/**
 * The form that changes a visit already on file: its time and actors, its patient, and
 * whatever its visit type asks for, saved together.
 *
 * The two halves are written the way each is written on its own. A new time goes through
 * `Appointment/[id]/$reschedule` (or, typed, through CRUD writes of the new Slots), and
 * goes first, since it is the write most likely to be refused. The details are then put
 * onto the appointment that write returned, which holds the new Slots and version.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentUpdateForm(props: AppointmentUpdateFormProps): JSX.Element {
  const { appointment, onRescheduled, onUpdated, onSaved, defaultStart, fixedTime, ...formProps } = props;
  const medplum = useMedplum();
  const defaults = useRescheduleDefaults(appointment);
  const moved = useRef<{ proposal: Appointment; appointment: WithId<Appointment> }>(undefined);

  const update = useCallback(
    async (change: AppointmentProposalUpdate): Promise<void> => {
      const { proposal, manual, detailsChanged, patient, values, requirements, site } = change;
      let current = appointment;
      if (proposal && moved.current?.proposal === proposal) {
        current = moved.current.appointment;
      } else if (proposal) {
        const result = await rescheduleAppointment(medplum, appointment, proposal, { manual });
        current = result.appointments.find((written) => written.id === appointment.id) ?? current;
        moved.current = { proposal, appointment: current };
        try {
          await onRescheduled?.(result);
        } catch (error) {
          console.error(error);
        }
      }

      if (detailsChanged) {
        let updated: WithId<Appointment>;
        try {
          const next = buildAppointmentUpdate(current, patient, values, requirements);
          updated = await medplum.updateResource(site ? withAppointmentSite(next, site) : next);
        } catch (error) {
          if (current === appointment) {
            throw error;
          }
          throw new Error(
            `The appointment was moved, but the patient and codes weren't saved. ${normalizeErrorString(error)}`,
            { cause: error }
          );
        }
        try {
          await onUpdated?.(updated);
        } catch (error) {
          console.error(error);
        }
      }
      moved.current = undefined;
      onSaved?.();
    },
    [appointment, medplum, onRescheduled, onUpdated, onSaved]
  );

  const [loaded, setLoaded] = useState(false);
  if (!defaults.loading && !loaded) {
    setLoaded(true);
  }

  if (!loaded && defaults.loading) {
    return <Loader size="sm" />;
  }

  const hasService = extractServiceTypeReferences(appointment.serviceType).length > 0;
  const readError = hasService ? defaults.error : undefined;
  const droppedNames = listAll.format(
    defaults.droppedActors.map((actor) => actor.display ?? actor.reference).filter(isDefined)
  );

  return (
    <>
      {fixedTime && (
        <Alert color="yellow" mb="sm">
          {`The time can't be changed once an appointment is ${appointment.status}.`}
        </Alert>
      )}
      {!fixedTime && !hasService && (
        <Alert color="yellow" mb="sm">
          This appointment does not have a visit type, and so its time cannot be changed.
        </Alert>
      )}
      {!fixedTime && readError !== undefined && (
        <Alert
          color="red"
          mb="sm"
          title="Part of what this appointment is booked on could not be read, and so its time cannot be changed."
        >
          {normalizeErrorString(readError)}
        </Alert>
      )}
      {!fixedTime && defaults.droppedActors.length > 0 && (
        <Alert color="yellow" mb="sm">
          The following participants are not schedulable for this visit type and will be removed from this appointment
          if you change its time: {droppedNames}
        </Alert>
      )}
      <AppointmentProposalForm
        {...formProps}
        mode="update"
        fixedTime={fixedTime || !hasService || readError !== undefined}
        defaultService={defaults.service}
        defaultSelections={defaults.selections}
        defaultStart={defaultStart ?? getOpeningDay(appointment)}
        ignoreAppointment={appointment}
        ignoreAppointmentSchedules={defaults.heldSchedules}
        onUpdate={update}
      />
    </>
  );
}
