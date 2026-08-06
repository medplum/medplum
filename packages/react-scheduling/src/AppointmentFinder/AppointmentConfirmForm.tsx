// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { isDefined } from '@medplum/core';
import type { Appointment, HealthcareService, Location, Patient, Reference } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { IconCalendarEvent, IconClock, IconMapPin, IconStethoscope, IconUser } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { ActorName } from './ActorName';
import classes from './AppointmentFinder.module.css';
import { formatDayHeading, formatZonedTime, getActorRoleLabel, getDurationMinutes } from './AppointmentFinder.utils';
import { AppointmentPatientSelect } from './AppointmentPatientSelect';

/** What the person booking adds to a time the search proposed. */
export interface AppointmentBookingDraft {
  readonly patient?: WithId<Patient>;
  /** Why the visit is happening, recorded for the practice. */
  readonly comment?: string;
  /** What the patient is told to do before the visit. */
  readonly patientInstruction?: string;
}

export interface AppointmentConfirmFormProps {
  /** The proposed appointment being confirmed. */
  readonly appointment: Appointment;
  readonly value: AppointmentBookingDraft;
  readonly onChange: (value: AppointmentBookingDraft) => void;
  /** A patient the caller already knows about, which replaces the search. */
  readonly patient?: Patient | Reference<Patient>;
  readonly service?: HealthcareService | Reference<HealthcareService>;
  readonly location?: Location | Reference<Location>;
  /** IANA timezone the time is read in. Defaults to the browser's. */
  readonly timezone?: string;
  /** Whether the search offered this time. Defaults to true. */
  readonly available?: boolean;
  /**
   * Offers a way to create a patient who is not on file yet. The host navigates
   * wherever it keeps that form; passing the new patient back in through
   * `patient` returns the user to this step. Keep the finder mounted while they
   * are away — unmounting it loses the search behind them.
   */
  readonly onCreatePatient?: () => void;
  /**
   * The `Identifier.system` MRNs are issued under, for a project that does not
   * type them. See `AppointmentPatientSelect`.
   */
  readonly mrnSystem?: string;
  /**
   * Fields of the host's own, shown under the ones here.
   *
   * The fields this form asks for are the ones every booking needs. A practice
   * that also records billing codes, a referring provider or a prior
   * authorization puts those here, holds their values in its own state, and
   * writes them onto the appointment it is handed on the way to `$book` — which
   * is where the choice of how to record them belongs, since FHIR leaves most of
   * them more than one home. `Appointment.serviceType` is not one of the homes
   * available: scheduling reads the service out of it, so anything else written
   * there changes what is being booked.
   *
   * These do not appear in the read-back beside the form, which stays a summary
   * of the appointment itself.
   */
  readonly additionalFields?: ReactNode;
  readonly disabled?: boolean;
}

/**
 * Confirms a chosen time and collects what only the person booking knows.
 *
 * The time, the actors, and the site are read back rather than re-asked: by this
 * point they have been chosen, and the risk is booking the right visit at the
 * wrong time for the wrong person. Nothing is written here — the assembled
 * appointment goes back to the caller, which decides between `$book` and
 * `$hold`.
 *
 * @param props - The React props.
 * @returns The confirmation form and a read-back of the appointment.
 */
export function AppointmentConfirmForm(props: AppointmentConfirmFormProps): JSX.Element {
  const { appointment, value, onChange, patient, timezone, available = true, disabled } = props;

  const start = appointment.start ? new Date(appointment.start) : undefined;
  const durationMinutes = getDurationMinutes(appointment);
  const actors = (appointment.participant ?? [])
    .map((participant) => participant.actor)
    .filter(isDefined)
    .filter((actor) => getActorRoleLabel(actor));

  return (
    <Stack>
      <Title order={4}>Confirm and book</Title>

      {!available && (
        <Alert color="yellow" title="This time was not offered">
          Nobody's availability was checked for it, so booking it may double-book whoever it is held on.
        </Alert>
      )}

      <div className={classes.confirmLayout}>
        <Paper withBorder p="md">
          <Stack>
            {patient ? (
              <div>
                <Text size="sm" fw={500}>
                  Patient
                </Text>
                <Text size="sm">
                  <ResourceName value={patient} />
                </Text>
              </div>
            ) : (
              <Stack gap={4}>
                <AppointmentPatientField
                  value={value}
                  onChange={onChange}
                  disabled={disabled}
                  onCreatePatient={props.onCreatePatient}
                  mrnSystem={props.mrnSystem}
                />
              </Stack>
            )}

            <Textarea
              label="Reason for visit"
              description="Kept for the practice."
              autosize
              minRows={2}
              disabled={disabled}
              value={value.comment ?? ''}
              onChange={(event) => onChange({ ...value, comment: event.currentTarget.value })}
            />

            <Textarea
              label="Patient instructions"
              description="Sent on to the patient with the appointment."
              autosize
              minRows={2}
              disabled={disabled}
              value={value.patientInstruction ?? ''}
              onChange={(event) => onChange({ ...value, patientInstruction: event.currentTarget.value })}
            />

            {props.additionalFields}
          </Stack>
        </Paper>

        <Stack gap="sm" data-testid="appointment-summary">
          {start && (
            <SummaryRow icon={<IconCalendarEvent size={16} stroke={1.6} />}>
              <Text size="sm" fw={500}>
                {formatDayHeading(start)} at {formatZonedTime(start, timezone)}
              </Text>
            </SummaryRow>
          )}
          {durationMinutes > 0 && (
            <SummaryRow icon={<IconClock size={16} stroke={1.6} />}>
              <Text size="sm">{durationMinutes} minutes</Text>
            </SummaryRow>
          )}
          {(patient ?? value.patient) && (
            <SummaryRow icon={<IconUser size={16} stroke={1.6} />}>
              <Text size="sm">
                <ResourceName value={patient ?? value.patient} />
              </Text>
            </SummaryRow>
          )}
          {props.service && (
            <SummaryRow icon={<IconStethoscope size={16} stroke={1.6} />}>
              <Text size="sm">
                <ResourceName value={props.service} />
              </Text>
            </SummaryRow>
          )}
          {props.location && (
            <SummaryRow icon={<IconMapPin size={16} stroke={1.6} />}>
              <Text size="sm">
                <ResourceName value={props.location} />
              </Text>
            </SummaryRow>
          )}
          {actors.map((actor) => (
            <SummaryRow key={actor.reference ?? actor.display}>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase">
                  {getActorRoleLabel(actor)}
                </Text>
                <Text size="sm">
                  <ActorName actor={actor} />
                </Text>
              </Stack>
            </SummaryRow>
          ))}
          {timezone && (
            <Text size="xs" c="dimmed">
              Times are in {timezone}.
            </Text>
          )}
        </Stack>
      </div>
    </Stack>
  );
}

/**
 * The patient search, with a way out to creating one.
 * @param props - The React props.
 * @param props.value - The current draft.
 * @param props.onChange - Reports a changed draft.
 * @param props.onCreatePatient - Called to create a patient who is not on file.
 * @param props.mrnSystem - The system MRNs are issued under, when they are not typed.
 * @param props.disabled - Whether the field is disabled.
 * @returns The field.
 */
function AppointmentPatientField(props: {
  readonly value: AppointmentBookingDraft;
  readonly onChange: (value: AppointmentBookingDraft) => void;
  readonly onCreatePatient?: () => void;
  readonly mrnSystem?: string;
  readonly disabled?: boolean;
}): JSX.Element {
  return (
    <>
      <AppointmentPatientSelect
        patient={props.value.patient}
        disabled={props.disabled}
        mrnSystem={props.mrnSystem}
        onChange={(patient) => props.onChange({ ...props.value, patient })}
      />
      {props.onCreatePatient && (
        <Anchor component="button" type="button" size="xs" w="fit-content" onClick={props.onCreatePatient}>
          New patient
        </Anchor>
      )}
    </>
  );
}

/**
 * One line of the read-back.
 *
 * The glyph slot is held open even for lines without one, so that the actors
 * line up under the details above them.
 *
 * @param props - The React props.
 * @param props.icon - A leading glyph, left out for continuation lines.
 * @param props.children - The line's content.
 * @returns The line.
 */
function SummaryRow(props: { readonly icon?: ReactNode; readonly children: ReactNode }): JSX.Element {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <div className={classes.summaryIcon}>{props.icon}</div>
      <div style={{ minWidth: 0 }}>{props.children}</div>
    </Group>
  );
}

/**
 * Reports why an appointment cannot be booked yet, if it cannot.
 * @param value - The draft collected on this step.
 * @param fixedPatient - A patient the caller supplied instead.
 * @returns A message to show the user, or undefined when booking can go ahead.
 */
export function getBookingError(
  value: AppointmentBookingDraft,
  fixedPatient: Patient | Reference<Patient> | undefined
): string | undefined {
  if (!fixedPatient && !value.patient) {
    return 'Choose a patient';
  }
  return undefined;
}
