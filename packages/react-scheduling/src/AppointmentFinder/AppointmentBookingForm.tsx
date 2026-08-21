// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Loader, Stack, Text, Textarea, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  formatDate,
  getIdentifier,
  getIdentifierByType,
  getReferenceString,
  getSchedulingTimezone,
  isDefined,
  MRN_IDENTIFIER_TYPE,
  normalizeErrorString,
} from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Location, Patient, Slot } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { CalendarDateInput, ReferenceDisplay, ResourceInput } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import { IconCalendarSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import classes from './AppointmentFinder.module.css';
import type { SchedulingRole } from './AppointmentFinder.roles';
import { getActorRoleLabel, SCHEDULING_ROLES } from './AppointmentFinder.roles';
import type { ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import { getActorCombinations, getSelectedCandidates, getSelectionError } from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import { endOfDay, getDurationMinutes, getFindWindowError, groupAppointmentsByDay } from './AppointmentFinder.times';
import { AppointmentOptionRow } from './AppointmentOptionRow';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';
import { isServiceKeptAtLocation } from './AppointmentServiceSelect.utils';
import { useProposedAppointments } from './useProposedAppointments';

// Excludes what a room is rather than admitting what a site is: `physicalType` is
// optional, so `physical-type=si,bu` would hide a Location that never declared one.
const LOCATION_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };

// Birth date rather than name: the list is already narrowed by the name that was
// typed, so what orders it usefully is the thing that tells those people apart.
const PATIENT_SEARCH_CRITERIA = { _count: '25', _sort: 'birthdate' };

// No month-wide scan exists, so every day is offered and the search answers.
const NO_MARKED_DATES: Date[] = [];

/** What a booking wrote, as `Appointment/$book` returned it. */
export interface AppointmentBooking {
  readonly appointment: WithId<Appointment>;
  /** The times reserved for it, one per schedule it is held on. */
  readonly slots: readonly WithId<Slot>[];
}

export interface AppointmentBookingFormProps {
  /** Pre-fills where the visit is, for a host that already knows. */
  readonly defaultLocation?: WithId<Location>;
  /** Pre-fills the visit type, for a deep link or a reschedule. */
  readonly defaultService?: WithId<HealthcareService>;
  /** Pre-fills who the visit is for, for a host launching from a patient's chart. */
  readonly defaultPatient?: WithId<Patient>;
  /**
   * The day the time search opens on. Defaults to today.
   *
   * A day, not a time: only a time `$find` offered can be chosen.
   */
  readonly defaultStart?: Date;
  /**
   * The `Identifier.system` a project issues medical record numbers under.
   *
   * Only needed where identifiers carry no `type`. Which identifier is the
   * medical record number is a project's own convention, and there is nothing on
   * an untyped one to recognise it by.
   */
  readonly mrnSystem?: string;
  /**
   * Called when the time search opens or closes.
   *
   * The times render beside the form, not under it, so a host in a side panel has
   * to widen it to fit them.
   */
  readonly onToggleTimeFinder?: (open: boolean) => void;
  /** Called with the visit type as it changes. */
  readonly onChangeService?: (service: WithId<HealthcareService> | undefined) => void;
  /**
   * Takes the booking over, instead of the form writing it.
   *
   * For a host doing something other than `$book` with the proposal — holding it
   * through `$hold`, or writing it inside a transaction of its own. The form
   * writes nothing and announces nothing in that case, so a host taking this over
   * owns invalidating its own caches.
   */
  readonly onBook?: (proposal: Appointment) => void | Promise<void>;
  /** Called with what the booking wrote. Not called when `onBook` took it over. */
  readonly onBooked: (booking: AppointmentBooking) => void | Promise<void>;
}

/**
 * Gathers what a visit is held on, finds a time every one of them is free, and
 * books it.
 *
 * One field per scheduling role, each searching the schedules bookable for the
 * chosen visit type. Everything named attends, because `$find` intersects their
 * schedules — so naming a second room narrows the times rather than widening them.
 *
 * Only a time the search offered can be chosen: the field holding it accepts no
 * input, so nothing can be booked onto time nobody checked availability for.
 *
 * The booking itself is the form's, not the host's: it posts `Appointment/$book`
 * and announces what came back, so a host embedding this needs no scheduling API
 * code of its own. `onBook` is there for the host that wants it anyway.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentBookingForm(props: AppointmentBookingFormProps): JSX.Element {
  const {
    defaultLocation,
    defaultService,
    defaultPatient,
    defaultStart,
    mrnSystem,
    onToggleTimeFinder,
    onChangeService,
    onBook,
    onBooked,
  } = props;

  const medplum = useMedplum();

  const [location, setLocation] = useState<WithId<Location> | undefined>(defaultLocation);
  const [service, setService] = useState<WithId<HealthcareService> | undefined>(defaultService);
  const [selections, setSelections] = useState<ActorSelections>({});
  const [range, setRange] = useState<DateRange>(() => oneDay(defaultStart ?? new Date()));
  const [month, setMonth] = useState<Date | undefined>(defaultStart);
  const [finding, setFinding] = useState(false);
  const [chosen, setChosen] = useState<Appointment | undefined>(undefined);
  // The fields ignore `defaultValue` after mount, so remounting is the only way to
  // clear their pills. Counters, so a field is never remounted out from under a pick.
  const [roleFieldsKey, setRoleFieldsKey] = useState(0);
  const [serviceFieldKey, setServiceFieldKey] = useState(0);
  const [patient, setPatient] = useState<WithId<Patient> | undefined>(defaultPatient);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [patientInstruction, setPatientInstruction] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<unknown>(undefined);

  const selectionError = getSelectionError(selections);
  const windowError = getFindWindowError(range);

  // Derived, not a flag: closing is never its own rule, so losing the last provider
  // closes the search however it was lost.
  const searching = finding && !selectionError;

  // Nothing is searched until the time search is open, so the answers above cost no
  // request per keystroke.
  const combinations = useMemo(
    () => (searching && !windowError ? getActorCombinations(selections) : []),
    [searching, windowError, selections]
  );

  const search = useProposedAppointments({ service, combinations, range });

  // The first actor's schedule answers for all of them: every actor in one search
  // shares the scheduling parameters, or `$find` rejects the request.
  const timezone = useMemo(() => {
    const [first] = getSelectedCandidates(selections);
    return service ? getSchedulingTimezone(service, first?.schedule, first?.actorResource) : undefined;
  }, [service, selections]);

  const days = useMemo(() => groupAppointmentsByDay(search.appointments, timezone), [search.appointments, timezone]);

  // The ref holds what the host was last told, so mounting reports nothing and a
  // search that closed on its own is reported like one closed by hand.
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current !== searching) {
      reported.current = searching;
      onToggleTimeFinder?.(searching);
    }
  }, [searching, onToggleTimeFinder]);

  const patientItem = useCallback(
    (option: AsyncAutocompleteOption<WithId<Patient>>) => (
      <AppointmentOptionRow label={option.label} detail={formatPatientDetail(option.resource, mrnSystem)} />
    ),
    [mrnSystem]
  );

  function toggleFinder(): void {
    setFinding(!finding);
  }

  const chooseResources = useCallback((update: (selections: ActorSelections) => ActorSelections): void => {
    setSelections(update);
    // A chosen time is a proposal carrying the Slots it was found for. Booked after
    // a resource changes it would hold whoever is named inside the proposal, and
    // `$book` cannot catch that: the proposal is internally consistent.
    setChosen(undefined);
  }, []);

  function chooseService(next: WithId<HealthcareService> | undefined): void {
    setService(next);
    onChangeService?.(next);
    clearResources();
  }

  function chooseLocation(next: WithId<Location> | undefined): void {
    setLocation(next);
    clearResources();
    if (service && !isServiceKeptAtLocation(service, next)) {
      setService(undefined);
      onChangeService?.(undefined);
      setServiceFieldKey((key) => key + 1);
    }
  }

  /**
   * Clears every named resource, deliberately: a resource can be schedulable for more
   * than one visit type, so some would survive a narrower check. Both the site and the
   * visit type change which actors are offered, and re-asking is easier to explain than
   * a partial clear.
   */
  function clearResources(): void {
    setSelections({});
    setChosen(undefined);
    setRoleFieldsKey((key) => key + 1);
  }

  function chooseDay(date: Date): void {
    setRange(oneDay(date));
    setChosen(undefined);
  }

  async function bookAppointment(): Promise<void> {
    if (!chosen || !patient) {
      return;
    }

    setBooking(true);
    setBookError(undefined);
    try {
      const proposal = buildBooking(chosen, patient, { reason, comment, patientInstruction });

      if (onBook) {
        await onBook(proposal);
        return;
      }

      const written = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', '$book'),
        { resourceType: 'Parameters', parameter: [{ name: 'appointment', resource: proposal }] }
      );
      const booked = readBooking(written);

      // `$book` is a custom operation, so the client cannot tell what it changed.
      // Announcing it is what refreshes a host's calendar beside this form.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'create',
        id: booked.appointment.id,
        resource: booked.appointment,
      });
      for (const slot of booked.slots) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
      }

      await onBooked(booked);
    } catch (error) {
      // Left on screen with every answer still filled in: a refusal is usually
      // somebody else taking the time, and the next attempt is one field away.
      setBookError(error);
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className={classes.layout}>
      {/* Not a `form` element: this mounts inside a host's own surface, which may
          already be one, and a form cannot be nested in a form. */}
      <Stack className={classes.form} gap="sm">
        <ResourceInput<WithId<Location>>
          resourceType="Location"
          name="location"
          label="Location"
          placeholder="Any location"
          searchCriteria={LOCATION_SEARCH_CRITERIA}
          defaultValue={defaultLocation}
          onChange={chooseLocation}
        />
        <AppointmentServiceSelect
          key={serviceFieldKey}
          location={location}
          // From state, not the prop: `defaultService` on a remount would put back
          // the visit type the remount was clearing.
          defaultValue={service}
          onChange={chooseService}
        />

        {SCHEDULING_ROLES.map((role) => (
          <RoleField
            key={`${role}-${roleFieldsKey}`}
            role={role}
            service={service}
            location={location}
            disabled={!service}
            onChange={chooseResources}
          />
        ))}

        <ResourceInput<WithId<Patient>>
          resourceType="Patient"
          name="patient"
          label="Patient"
          placeholder="Search patients by name"
          required
          searchCriteria={PATIENT_SEARCH_CRITERIA}
          defaultValue={defaultPatient}
          itemComponent={patientItem}
          onChange={setPatient}
        />
        <TextInput
          label="Reason for visit"
          placeholder="What the visit is for"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />

        <ChosenTime
          appointment={chosen}
          timezone={timezone}
          searching={searching}
          blockedBy={service ? selectionError : 'Choose a visit type'}
          onToggleFinder={toggleFinder}
        />

        {searching && (
          <Stack gap={4}>
            <CalendarDateInput
              availableDates={NO_MARKED_DATES}
              allowUnavailableDates
              earliestDate={new Date()}
              month={month}
              selected={range.start}
              onChangeMonth={setMonth}
              onClick={chooseDay}
            />
            {windowError && <Alert color="yellow">{windowError}</Alert>}
          </Stack>
        )}

        {/* Below the booking decision: they are the longest fields on the form and
            the least likely to change what can be booked. */}
        <Textarea
          label="Notes or comments"
          description="Kept internally, for the practice."
          autosize
          minRows={2}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
        />
        <Textarea
          label="Patient instructions"
          description="Shown to the patient."
          autosize
          minRows={2}
          value={patientInstruction}
          onChange={(event) => setPatientInstruction(event.currentTarget.value)}
        />

        {bookError !== undefined && <Alert color="red">{normalizeErrorString(bookError)}</Alert>}
        <Button fullWidth disabled={!chosen || !patient} loading={booking} onClick={bookAppointment}>
          Book appointment
        </Button>
      </Stack>

      {searching && (
        <Stack className={classes.results} gap="lg">
          {search.loading && <Loader size="sm" />}
          {search.error && <Alert color="red">{normalizeErrorString(search.error)}</Alert>}
          {!search.loading &&
            !search.error &&
            days.map((day) => (
              <AppointmentDayTimes
                key={day.key}
                date={day.date}
                groups={day.groups}
                timezone={timezone}
                selected={chosen}
                onSelectAppointment={setChosen}
              />
            ))}
          {!search.loading && !search.error && !windowError && days.length === 0 && (
            <Text c="dimmed" ta="center">
              No times are available for this selection.
            </Text>
          )}
        </Stack>
      )}
    </div>
  );
}

interface ChosenTimeProps {
  readonly appointment: Appointment | undefined;
  /** IANA timezone the visit is held in. */
  readonly timezone: string | undefined;
  readonly searching: boolean;
  /** What is still owed before a time can be searched for, if anything. */
  readonly blockedBy: string | undefined;
  readonly onToggleFinder: () => void;
}

/**
 * The chosen time, and under it the action that found it.
 *
 * An input rather than plain text: overrides are not implemented, but when they are, a
 * permitted user gets this same field in this same place, editable and with a warning.
 *
 * @param props - The React props.
 * @returns The chosen time, once there is one, and the action.
 */
function ChosenTime(props: ChosenTimeProps): JSX.Element {
  const { appointment, timezone, searching, blockedBy, onToggleFinder } = props;

  return (
    <>
      {appointment?.start && (
        <TextInput
          label="Date & time"
          readOnly
          value={formatZonedDateTime(new Date(appointment.start), timezone)}
          // Mantine puts the description above the input by default.
          inputWrapperOrder={['label', 'input', 'description']}
          description={<ChosenTimeCommitment appointment={appointment} />}
        />
      )}

      <Stack gap={4}>
        <Button
          variant="outline"
          fullWidth
          leftSection={<IconCalendarSearch size={16} stroke={1.8} />}
          disabled={!!blockedBy}
          onClick={onToggleFinder}
        >
          {getFinderLabel(searching, !!appointment)}
        </Button>
        {blockedBy && (
          <Text size="xs" c="dimmed">
            {blockedBy} first.
          </Text>
        )}
      </Stack>
    </>
  );
}

interface ChosenTimeCommitmentProps {
  readonly appointment: Appointment;
}

/**
 * What the chosen time commits to: how long the visit runs, and what holds it.
 *
 * Read off the proposal rather than the answers above, since the proposal is what
 * `$book` is handed. Inline elements only: it renders inside a `description`, which
 * is a paragraph.
 *
 * @param props - The React props.
 * @returns The detail beneath the time.
 */
function ChosenTimeCommitment(props: ChosenTimeCommitmentProps): JSX.Element {
  const { appointment } = props;
  const actors = (appointment.participant ?? []).map((participant) => participant.actor).filter(isDefined);
  const durationMinutes = getDurationMinutes(appointment);

  return (
    <>
      {durationMinutes > 0 && `${durationMinutes} min visit`}
      {actors.map((actor, index) => {
        const roleLabel = getActorRoleLabel(actor);
        return (
          <Fragment key={getReferenceString(actor) ?? actor.display}>
            {(index > 0 || durationMinutes > 0) && ' · '}
            {roleLabel && `${roleLabel}: `}
            <ReferenceDisplay value={actor} link={false} />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Names what the action does next.
 * @param searching - Whether the time search is open.
 * @param chosen - Whether a time has been picked.
 * @returns The button's label.
 */
function getFinderLabel(searching: boolean, chosen: boolean): string {
  if (searching) {
    return 'Close time finder';
  }
  return chosen ? 'Change time' : 'Find a time';
}

interface RoleFieldProps {
  readonly role: SchedulingRole;
  readonly service: WithId<HealthcareService> | undefined;
  readonly location: WithId<Location> | undefined;
  readonly disabled?: boolean;
  readonly onChange: (update: (selections: ActorSelections) => ActorSelections) => void;
}

/**
 * One role's field, writing its own key of the selections.
 *
 * A component of its own so the callback it hands down is stable per role: the
 * field searches on a changed callback, and an inline one would be new on every
 * keystroke anywhere in the form.
 *
 * @param props - The React props.
 * @returns The field for that role.
 */
function RoleField(props: RoleFieldProps): JSX.Element {
  const { role, service, location, disabled, onChange } = props;

  const handleChange = useCallback(
    (candidates: readonly ScheduleCandidate[]) => onChange((selections) => ({ ...selections, [role]: candidates })),
    [onChange, role]
  );

  return (
    <AppointmentActorSelect
      role={role}
      service={service}
      location={location}
      disabled={disabled}
      onChange={handleChange}
    />
  );
}

/** The free text written onto a booking, as typed. */
interface AppointmentNotes {
  readonly reason: string;
  readonly comment: string;
  readonly patientInstruction: string;
}

/**
 * Puts the patient and the free text onto the proposal that will be booked.
 *
 * @param proposal - The time that was chosen, as `$find` offered it.
 * @param patient - Who the visit is for.
 * @param notes - What was typed about it.
 * @returns The appointment to book.
 */
function buildBooking(proposal: Appointment, patient: WithId<Patient>, notes: AppointmentNotes): Appointment {
  const patientReference = getReferenceString(patient);
  const booking: Appointment = {
    ...proposal,
    participant: [
      // A proposal knows nothing about patients, but a host may have put one on
      // the appointment it handed over, and naming them twice books them twice.
      ...proposal.participant.filter((participant) => participant.actor?.reference !== patientReference),
      { actor: createReference(patient), required: 'required', status: 'needs-action' },
    ],
  };

  // A field nobody filled in is left off rather than written empty: an empty
  // string is a note saying nothing, which reads as a note on the chart.
  const description = notes.reason.trim();
  if (description) {
    booking.description = description;
  }
  const comment = notes.comment.trim();
  if (comment) {
    booking.comment = comment;
  }
  const patientInstruction = notes.patientInstruction.trim();
  if (patientInstruction) {
    booking.patientInstruction = patientInstruction;
  }

  return booking;
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

/**
 * What tells one patient apart from another of the same name.
 * @param patient - The patient on offer.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @returns The line under their name, or undefined when nothing is on file.
 */
function formatPatientDetail(patient: WithId<Patient>, mrnSystem: string | undefined): string | undefined {
  const mrn = getMedicalRecordNumber(patient, mrnSystem);
  return [formatDate(patient.birthDate), mrn && `MRN ${mrn}`].filter(Boolean).join(' · ') || undefined;
}

/**
 * Reads a patient's medical record number.
 *
 * A typed identifier answers it whoever issued it, which is the case that needs
 * no configuration. `mrnSystem` is for the project whose identifiers carry no
 * type, where nothing but the system says which one this is.
 *
 * @param patient - The patient to read.
 * @param mrnSystem - The system a project issues medical record numbers under.
 * @returns The medical record number, or undefined for a patient with none.
 */
function getMedicalRecordNumber(patient: WithId<Patient>, mrnSystem: string | undefined): string | undefined {
  return (
    getIdentifierByType(patient, MRN_IDENTIFIER_TYPE) ?? (mrnSystem ? getIdentifier(patient, mrnSystem) : undefined)
  );
}

/**
 * Returns the range covering the bookable part of one day.
 *
 * `$find` treats `start` as a hard floor, so a day already under way starts from now
 * rather than midnight: the calendar hands back local midnight, and asking from there
 * would offer times that have already passed.
 *
 * @param date - Any instant during the day.
 * @returns The day from now at the earliest, both ends closed, as `$find` requires.
 */
function oneDay(date: Date): DateRange {
  const now = new Date();
  const start = date > now ? date : now;
  return { start, end: endOfDay(start) };
}

/**
 * Writes an instant as the day and time it falls on at the site, not on the
 * booker's own clock.
 *
 * @param value - The chosen start time.
 * @param timezone - IANA timezone the visit is scheduled in.
 * @returns The time to display.
 */
function formatZonedDateTime(value: Date, timezone: string | undefined): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
