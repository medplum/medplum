// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Divider, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  formatCodeableConcept,
  getAppointmentSite,
  getExtension,
  getExtensionValue,
  getPrimaryProvider,
  normalizeErrorString,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  resolveId,
  SchedulingExternalUrlURI,
  SchedulingMedicalNecessityURI,
} from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Parameters, Reference, Slot } from '@medplum/fhirtypes';
import { CodeableConceptInput, ResourceName } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconCalendarCancel, IconCalendarCheck, IconEdit, IconExternalLink } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useState } from 'react';
import { getNonPatientActors, getPatientParticipant } from '../../actors';
import type { AppointmentWrite } from '../../AppointmentFinder/AppointmentFinder.writes';
import { readAppointmentWrite } from '../../AppointmentFinder/AppointmentFinder.writes';
import type { AppointmentReschedule } from '../../AppointmentFinder/AppointmentRescheduleForm';
import { AppointmentUpdateForm } from '../../AppointmentFinder/AppointmentUpdateForm';
import { AppointmentStatusBadge } from '../../AppointmentStatusBadge';
import { APPOINTMENT_CANCELLATION_REASON_VALUE_SET } from '../../constants';
import { getMedicalRecordNumber } from '../../patients';
import { ServiceTypeDisplay } from '../../ServiceTypeDisplay';
import { partitionServiceTypes } from '../../serviceTypes';
import { Detail } from '../Detail';
import { PaneHeader } from '../PaneHeader';
import {
  EDIT_WINDOW_HOURS,
  formatWhen,
  isCancelable,
  isPastEditWindow,
  isReschedulable,
} from '../SchedulingWorkspace.utils';
import classes from './AppointmentDetails.module.css';

export interface AppointmentCancelFormProps {
  readonly appointment: WithId<Appointment>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Overrides the value set the cancellation reason is coded against. */
  readonly cancellationReasonValueSet?: string;
}

export interface AppointmentDetailsProps {
  /**
   * Allows users to override scheduling rules when rescheduling or reassigning
   * an appointment, including its length. The host controls access.
   */
  readonly canBypassSchedulingRules?: boolean;
  readonly appointment: WithId<Appointment>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Called with what `$confirm` wrote: the appointment, now `booked`, and the Slots it holds. */
  readonly onConfirmed?: (confirmation: AppointmentWrite) => void | Promise<void>;
  /**
   * Called with what a move wrote, as soon as it is written. A save that also changes
   * the details calls this first, then `onUpdated`.
   *
   * The appointment shown is the one the host handed over, so a host keeping this
   * mounted hands over the moved one — from its own data, or from this callback.
   */
  readonly onRescheduled?: (reschedule: AppointmentReschedule) => void | Promise<void>;
  /**
   * Called when the update form's time search opens or closes.
   *
   * The times render beside that form rather than under it, so a host showing this in a
   * drawer or a panel has to widen it to fit them — under the width they need they wrap,
   * and the times land below the form instead.
   *
   * Leaving the update view reports the search closed whether or not it was open:
   * the form goes with the view, and so does the room it asked for.
   */
  readonly onToggleTimeFinder?: (open: boolean) => void;
  /** Overrides the value set the cancellation reason is coded against. */
  readonly cancellationReasonValueSet?: string;
  /** The ValueSet the procedure code field binds to. Defaults to the full CPT value set. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to the full ICD-10-CM value set. */
  readonly diagnosisBinding?: string;
  /** See {@link AppointmentProposalFormProps.mrnSystem}. */
  readonly mrnSystem?: string;
  /** Called with the appointment as written, after the patient or the visit type's codes are saved. */
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /**
   * Renders a header naming the view on show, with a button calling this to close it, for a
   * host showing this in a panel of its own.
   */
  readonly onClose?: () => void;
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
 * Has sub-views for updating and cancelling the appointment. One past its edit window
 * (see `isPastEditWindow`) is shown read-only, though a view already open can still finish.
 *
 * @param props - The React props
 * @param props.appointment - The Appointment resource to detail
 * @param props.cancellationReasonValueSet - The value set to offer cancellation reasons from,
 * in place of the default binding
 * @param props.onCancelled - A callback that can be invoked after a successful $cancel
 * @param props.onConfirmed - A callback that can be invoked after a successful $confirm
 * @param props.onRescheduled - A callback that can be invoked after a successful $reschedule
 * @param props.onUpdated - A callback that can be invoked after the editable details are saved
 * @param props.procedureBinding - The value set the procedure code field binds to
 * @param props.diagnosisBinding - The value set the diagnosis code field binds to
 * @param props.mrnSystem - The system a project issues medical record numbers under
 * @param props.onToggleTimeFinder - A callback told when the update form's time search
 * opens or closes, for a host that has to widen to fit it
 * @param props.onClose - A callback that renders a header with a close button, for a host
 * showing this in a panel of its own
 * @returns The details component
 */
export function AppointmentDetails(props: AppointmentDetailsProps): JSX.Element {
  const {
    appointment,
    onCancelled,
    onConfirmed,
    onToggleTimeFinder,
    onRescheduled,
    onUpdated,
    procedureBinding,
    diagnosisBinding,
    mrnSystem,
    onClose,
  } = props;
  const patient = getPatientParticipant(appointment)?.actor;
  const patientResource = useResource(patient);
  const [cancelling, setCancelling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const medplum = useMedplum();
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>();

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

  const confirm = useCallback(async (): Promise<void> => {
    setConfirming(true);
    setConfirmError(undefined);
    try {
      const confirmation = readAppointmentWrite(
        await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
          medplum.fhirUrl('Appointment', appointment.id, '$confirm'),
          { resourceType: 'Parameters' } satisfies Parameters
        ),
        '$confirm'
      );

      // `$confirm` is a custom operation, so the MedplumClient cannot tell what it changed:
      // the appointment was booked, and the Slots it holds firmed up from `busy-tentative`.
      for (const resource of [...confirmation.appointments, ...confirmation.slots]) {
        medplum.notifyResourceModified({
          resourceType: resource.resourceType,
          operation: 'update',
          id: resource.id,
          resource,
        });
      }

      try {
        await onConfirmed?.(confirmation);
      } catch (error) {
        console.error(error);
      }
    } catch (err: unknown) {
      setConfirmError(err);
    } finally {
      setConfirming(false);
    }
  }, [appointment.id, medplum, onConfirmed]);

  const header = (title: string): JSX.Element =>
    onClose ? (
      <PaneHeader title={title} closeLabel="Close appointment details" onClose={onClose} />
    ) : (
      <Title order={5}>{title}</Title>
    );

  function stopUpdating(): void {
    setUpdating(false);
    // The form is going, and with it any times it had open beside itself.
    onToggleTimeFinder?.(false);
  }

  const cancelable = isCancelable(appointment);
  const locked = isPastEditWindow(appointment);
  const editable = !locked && appointment.status !== 'cancelled';
  const confirmable = !locked && appointment.status === 'pending';
  const { visitType, procedures } = partitionServiceTypes(appointment);
  const medicalNecessity = getExtensionValue(appointment, SchedulingMedicalNecessityURI);
  const externalUrl = getExternalUrl(appointment);
  const hasActions = confirmable || !!externalUrl || locked || editable || cancelable;
  const site = getAppointmentSite(appointment);
  const { primary, providers, rooms, devices, others } = partitionActors(appointment);
  const mrn = patientResource?.resourceType === 'Patient' && getMedicalRecordNumber(patientResource, mrnSystem);

  const detailsList = (
    <>
      <Detail label="Status" value={<AppointmentStatusBadge status={appointment.status} />} />
      {patientLine}
      <Detail label="MRN" value={mrn} />
      {whenLine}
      <Detail label="Repeats" value={formatSeries(appointment)} />
      <Detail label="Service" value={visitType && <ServiceTypeDisplay appointment={appointment} />} />
      <Detail label="Primary provider" value={primary && <ResourceName value={primary} link={false} inherit />} />
      <Detail label={primary ? 'Other providers' : 'Providers'} value={listActors(providers)} />
      <Detail label="Rooms" value={listActors(rooms)} />
      <Detail label="Devices" value={listActors(devices)} />
      <Detail label="With" value={listActors(others)} />
      <Detail label="Service facility" value={site && <ResourceName value={site} link={false} inherit />} />
      <Detail label="Notes" value={appointment.comment ?? appointment.description} />
      <Detail label="Cancellation reason" value={formatCodeableConcept(appointment.cancelationReason) || undefined} />
      <Detail label="Procedure codes" value={procedures.map((concept) => formatCodeableConcept(concept)).join(', ')} />
      <Detail
        label="Diagnosis codes"
        value={appointment.reasonCode?.map((concept) => formatCodeableConcept(concept)).join(', ')}
      />
      <Detail
        label="Medical necessity"
        value={typeof medicalNecessity === 'boolean' && (medicalNecessity ? 'Confirmed' : 'Not confirmed')}
      />
    </>
  );

  if (cancelling) {
    return (
      <Stack gap="sm" className={classes.details}>
        {header('Cancel Appointment')}
        <AppointmentCancelForm
          appointment={appointment}
          onCancelled={innerOnCancelled}
          cancellationReasonValueSet={props.cancellationReasonValueSet}
        />
        <Divider />
        <Text size="sm" fw={500}>
          Appointment Details
        </Text>
        {detailsList}
        <Stack gap="sm" className={classes.actions}>
          <Divider />
          <Button onClick={() => setCancelling(false)} variant="default">
            Back to Appointment Details
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (updating) {
    return (
      <Stack gap="sm" className={classes.details}>
        {header('Update Appointment')}
        <AppointmentUpdateForm
          appointment={appointment}
          fixedTime={!isReschedulable(appointment)}
          onToggleTimeFinder={onToggleTimeFinder}
          onRescheduled={onRescheduled}
          onUpdated={onUpdated}
          onSaved={stopUpdating}
          onBack={stopUpdating}
          backLabel="Back to Appointment Details"
          canBypassSchedulingRules={props.canBypassSchedulingRules}
          procedureBinding={procedureBinding}
          diagnosisBinding={diagnosisBinding}
          mrnSystem={mrnSystem}
        />
      </Stack>
    );
  }

  // Both pages fill the pane the same way, so what can be done to the visit sits at the
  // foot of either.
  return (
    <Stack gap="sm" className={classes.details}>
      {onClose && header('Appointment Details')}
      {detailsList}
      {hasActions && (
        <Stack gap="sm" className={classes.actions}>
          <Divider />
          {/* `$confirm` also accepts `proposed`, but only what `$hold` left `pending` is offered. */}
          {confirmable && (
            <>
              {confirmError !== undefined && (
                <Alert color="red" title="Could not confirm this appointment">
                  {normalizeErrorString(confirmError)}
                </Alert>
              )}
              <Button loading={confirming} leftSection={<IconCalendarCheck size={16} stroke={1.8} />} onClick={confirm}>
                Confirm
              </Button>
            </>
          )}
          {externalUrl && (
            <Button
              component="a"
              href={externalUrl}
              rel="noreferrer"
              variant="outline"
              rightSection={<IconExternalLink size={16} stroke={1.8} />}
            >
              View details
            </Button>
          )}
          {locked && (
            <Text size="sm" c="dimmed">
              {`Appointments that ended more than ${EDIT_WINDOW_HOURS} hours ago can't be changed.`}
            </Text>
          )}
          {editable && (
            <Button
              variant="outline"
              leftSection={<IconEdit size={16} stroke={1.8} />}
              onClick={() => setUpdating(true)}
            >
              Edit or Reschedule Appointment
            </Button>
          )}
          {cancelable && (
            <Button
              variant="outline"
              color="red"
              leftSection={<IconCalendarCancel size={16} stroke={1.8} />}
              onClick={() => setCancelling(true)}
            >
              Cancel Appointment
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Sorts who the visit is held on into its primary provider, its other providers, its rooms
 * and devices, and anything else.
 * @param appointment - The appointment being described.
 * @returns The primary provider when one is marked, and the rest in the order the appointment lists them.
 */
function partitionActors(appointment: Appointment): {
  primary?: Reference;
  providers: Reference[];
  rooms: Reference[];
  devices: Reference[];
  others: Reference[];
} {
  const marked = getPrimaryProvider(appointment);
  const primary = marked?.reference ? marked : undefined;
  const providers: Reference[] = [];
  const rooms: Reference[] = [];
  const devices: Reference[] = [];
  const others: Reference[] = [];
  for (const actor of getNonPatientActors(appointment)) {
    if (primary && actor.reference === primary.reference) {
      continue;
    }
    switch (actor.reference?.split('/')[0]) {
      case 'Practitioner':
      case 'PractitionerRole':
        providers.push(actor);
        break;
      case 'Location':
        rooms.push(actor);
        break;
      case 'Device':
        devices.push(actor);
        break;
      default:
        others.push(actor);
    }
  }
  return { primary, providers, rooms, devices, others };
}

function listActors(actors: Reference[]): JSX.Element[] | undefined {
  if (actors.length === 0) {
    return undefined;
  }
  return actors.map((actor, index) => (
    <Fragment key={actor.reference ?? `actor-${index}`}>
      {index > 0 && ', '}
      <ResourceName value={actor} link={false} inherit />
    </Fragment>
  ));
}

/**
 * Reads the link to this visit in an external system.
 * @param appointment - The appointment being described.
 * @returns The link, or undefined when there is none or it is not `https`.
 */
function getExternalUrl(appointment: Appointment): string | undefined {
  const value = getExtensionValue(appointment, SchedulingExternalUrlURI);
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return undefined;
  }
  return new URL(value).protocol === 'https:' ? value : undefined;
}

/**
 * Says where the visit falls in a recurring series, for one `$book` wrote as part of one.
 * @param appointment - The appointment being described.
 * @returns Its place in the series, or undefined for a visit that does not repeat.
 */
function formatSeries(appointment: Appointment): string | undefined {
  const position = getExtension(appointment, RecurrenceIdExtensionURI)?.valuePositiveInt;
  if (position === undefined) {
    return undefined;
  }
  // Only the first occurrence keeps the template, so only it says how many there are.
  const count = getExtension(appointment, RecurrenceTemplateExtensionURI, 'occurrenceCount')?.valuePositiveInt;
  return count ? `Weekly · visit ${position} of ${count}` : `Weekly · visit ${position}`;
}
