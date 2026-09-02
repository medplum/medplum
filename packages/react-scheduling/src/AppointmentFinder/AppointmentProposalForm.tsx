// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Loader, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  formatDate,
  getIdentifier,
  getIdentifierByType,
  getReferenceString,
  getSchedulingTimezone,
  MRN_IDENTIFIER_TYPE,
  normalizeErrorString,
} from '@medplum/core';
import type { Appointment, HealthcareService, Location, Patient } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { CalendarDateInput, ResourceInput, ResourceName } from '@medplum/react';
import { IconCalendarSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import classes from './AppointmentFinder.module.css';
import type { SchedulingActor, SchedulingRole } from './AppointmentFinder.roles';
import { getActorRoleLabel, SCHEDULING_ROLES } from './AppointmentFinder.roles';
import type { ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import {
  getActorCombinations,
  getSelectedActorResources,
  getSelectedCandidates,
  getSelectionError,
} from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import {
  endOfDay,
  getAppointmentActors,
  getDurationMinutes,
  getFindWindowError,
  groupAppointmentsByDay,
} from './AppointmentFinder.times';
import { AppointmentOptionRow } from './AppointmentOptionRow';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';
import { isServiceKeptAtLocation } from './AppointmentServiceSelect.utils';
import { useProposedAppointments } from './useProposedAppointments';

// Excludes what a room is rather than admitting what a site is: `physicalType` is
// optional, so `physical-type=si,bu` would hide a Location that never declared one.
const LOCATION_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };

// Alphabetical, then by birth date: a short prefix — or the first click, before
// anything is typed — leaves a list only a name orders usefully, and the birth
// date is what tells the people sharing one apart.
const PATIENT_SEARCH_CRITERIA = { _count: '25', _sort: 'name,birthdate' };

// No month-wide scan exists, so every day is offered and the search answers.
const NO_MARKED_DATES: Date[] = [];

export interface AppointmentProposalFormProps {
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
   * Performs the booking with the proposal the form assembled.
   *
   * Resolving marks the form booked, so it stops offering to book until an answer
   * changes; rejecting shows the reason as the booking's refusal, every answer kept.
   */
  readonly onBook: (proposal: Appointment) => void | Promise<void>;
}

/**
 * Gathers what a visit is held on, finds a time every one of them is free, and
 * hands the proposal out to be booked.
 *
 * One field per scheduling role, each searching the schedules bookable for the
 * chosen visit type. Everything named attends, because `$find` intersects their
 * schedules — so naming a second room narrows the times rather than widening them.
 *
 * Only a time the search offered can be chosen: the field holding it accepts no
 * input, so nothing can be booked onto time nobody checked availability for.
 *
 * Writes nothing and announces nothing: `onBook` owns that. Mount this to do
 * something other than `$book` with the proposal — hold it through `$hold`, or
 * write it inside a transaction of your own. {@link AppointmentBookingForm} is the
 * one that books.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentProposalForm(props: AppointmentProposalFormProps): JSX.Element {
  const {
    defaultLocation,
    defaultService,
    defaultPatient,
    defaultStart,
    mrnSystem,
    onToggleTimeFinder,
    onChangeService,
    onBook,
  } = props;

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
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
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

  // All actor resources, keyed by their reference.
  const actorResources = useMemo(() => getSelectedActorResources(selections), [selections]);

  // Appointments bucketed by day, timezone, and actor resources.
  const days = useMemo(
    () => groupAppointmentsByDay(search.appointments, timezone, actorResources),
    [search.appointments, timezone, actorResources]
  );

  const chosenActors = getAppointmentActors(chosen, actorResources);

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

  // The two answers a written booking can still be changed by. Everything else
  // above clears the chosen time, which disables the button on its own; these
  // are what re-enable it, because changing either makes it a different visit.
  function chooseTime(next: Appointment): void {
    setChosen(next);
    setBooked(false);
  }

  function choosePatient(next: WithId<Patient> | undefined): void {
    setPatient(next);
    setBooked(false);
  }

  async function bookAppointment(): Promise<void> {
    if (!chosen || !patient) {
      return;
    }

    setBooking(true);
    setBookError(undefined);
    try {
      await onBook(buildBooking(chosen, patient));
      setBooked(true);
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

        <ChosenTime
          appointment={chosen}
          timezone={timezone}
          actors={chosenActors}
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

        <ResourceInput<WithId<Patient>>
          resourceType="Patient"
          name="patient"
          label="Patient"
          placeholder="Search patients by name"
          required
          searchCriteria={PATIENT_SEARCH_CRITERIA}
          defaultValue={defaultPatient}
          itemComponent={patientItem}
          onChange={choosePatient}
        />

        {bookError !== undefined && <Alert color="red">{normalizeErrorString(bookError)}</Alert>}
        <Button
          fullWidth
          // A booking that was written is not written again: every answer is
          // still on screen, and clicking through a second time would book the
          // same time twice. Changing one of them makes it a new request.
          disabled={!chosen || !patient || booked}
          loading={booking}
          onClick={bookAppointment}
        >
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
                onSelectAppointment={chooseTime}
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
  /** Who the chosen time is held on. */
  readonly actors: readonly SchedulingActor[];
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
  const { appointment, timezone, actors, searching, blockedBy, onToggleFinder } = props;

  return (
    <>
      {appointment?.start && (
        <TextInput
          label="Date & time"
          readOnly
          value={formatZonedDateTime(new Date(appointment.start), timezone)}
          // Mantine puts the description above the input by default.
          inputWrapperOrder={['label', 'input', 'description']}
          description={<ChosenTimeCommitment appointment={appointment} actors={actors} />}
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
  /** Who the time is held on. */
  readonly actors: readonly SchedulingActor[];
}

/**
 * What the chosen time commits to: how long the visit runs, and what holds it.
 *
 * Read off the proposal rather than the answers above, since the proposal is what
 * gets booked. Inline elements only: it renders inside a `description`, which is a
 * paragraph.
 *
 * @param props - The React props.
 * @returns The detail beneath the time.
 */
function ChosenTimeCommitment(props: ChosenTimeCommitmentProps): JSX.Element {
  const { appointment, actors } = props;
  const durationMinutes = getDurationMinutes(appointment);

  return (
    <>
      {durationMinutes > 0 && `${durationMinutes} min visit`}
      {actors.map((actor, index) => {
        const roleLabel = getActorRoleLabel(actor);
        return (
          <Fragment key={getReferenceString(actor)}>
            {(index > 0 || durationMinutes > 0) && ' · '}
            {roleLabel && `${roleLabel}: `}
            <ResourceName value={actor} link={false} inherit />
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

/**
 * Puts the patient onto the proposal that will be booked.
 *
 * @param proposal - The time that was chosen, as `$find` offered it.
 * @param patient - Who the visit is for.
 * @returns The appointment to book.
 */
function buildBooking(proposal: Appointment, patient: WithId<Patient>): Appointment {
  const patientReference = getReferenceString(patient);
  return {
    ...proposal,
    participant: [
      // A proposal knows nothing about patients, but a host may have put one on
      // the appointment it handed over, and naming them twice books them twice.
      ...proposal.participant.filter((participant) => participant.actor?.reference !== patientReference),
      { actor: createReference(patient), required: 'required', status: 'needs-action' },
    ],
  };
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
