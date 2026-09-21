// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Checkbox, Group, Loader, NumberInput, Pill, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { SchedulingRequirement, WithId } from '@medplum/core';
import {
  createReference,
  formatDate,
  getIdentifier,
  getIdentifierByType,
  getReferenceString,
  getSchedulingRequirements,
  getSchedulingTimezone,
  MRN_IDENTIFIER_TYPE,
  normalizeErrorString,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
  REQUIRES_PROCEDURE_CODE,
  SchedulingMedicalNecessityURI,
} from '@medplum/core';
import type {
  Appointment,
  Extension,
  HealthcareService,
  Location,
  Patient,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { CalendarDateInput, ResourceInput, ResourceName, ValueSetAutocomplete } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import { IconAlertCircle, IconCalendarSearch, IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SchedulingActorValue } from '../actors';
import { getActorType, getActorTypeLabel } from '../actors';
import { resolveBookingGeometry } from '../bookingGeometry';
import type { DateTimeRange } from '../types';
import { AppointmentActorSelections } from './AppointmentActorSelections';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import classes from './AppointmentFinder.module.css';
import type { BookingRequirementValues } from './AppointmentFinder.requirements';
import {
  DEFAULT_DIAGNOSIS_VALUE_SET,
  DEFAULT_PROCEDURE_VALUE_SET,
  EMPTY_REQUIREMENT_VALUES,
  hasRequiredValues,
  toCodings,
} from './AppointmentFinder.requirements';
import type { ActorSelections, SelectionBlocker } from './AppointmentFinder.schedules';
import {
  getActorCombinations,
  getSelectedActorResources,
  getSelectedCandidates,
  getSelectionError,
  getUnsatisfiableRows,
} from './AppointmentFinder.schedules';
import {
  formatTimezoneLabel,
  getAppointmentActors,
  getDurationMinutes,
  getNativeInputType,
  isViewerTimezone,
  parseZonedDateTimeInput,
} from './AppointmentFinder.times';
import { AppointmentOptionRow } from './AppointmentOptionRow';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';
import { isServiceKeptAtLocation } from './AppointmentServiceSelect.utils';
import { buildElevatedBooking } from './buildElevatedBooking';
import type { BookingConflict } from './findConflicts';
import { describeConflict, findBookingConflicts } from './findConflicts';
import { useDaySearch } from './useDaySearch';

// Excludes what a room is rather than admitting what a site is: `physicalType` is
// optional, so `physical-type=si,bu` would hide a Location that never declared one.
const LOCATION_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };

// The visit type decides which actors can be asked for at all, so nothing below it
// is answerable yet. Unanswered, not answered wrongly, so it reads as a prompt.
const NO_SERVICE_BLOCKER: SelectionBlocker = { message: 'Choose a visit type first.', severity: 'incomplete' };

// Alphabetical, then by birth date: a short prefix — or the first click, before
// anything is typed — leaves a list only a name orders usefully, and the birth
// date is what tells the people sharing one apart.
const PATIENT_SEARCH_CRITERIA = { _count: '25', _sort: 'name,birthdate' };

// No month-wide scan exists, so every day is offered and the search answers.
const NO_MARKED_DATES: Date[] = [];

// Long enough that typing a time does not search on every keystroke, short enough
// that the warning is there before the user reaches the book button.
const CONFLICT_DEBOUNCE_MS = 400;

export interface AppointmentProposalFormProps {
  /** Pre-fills where the visit is, for a host that already knows. */
  readonly defaultLocation?: WithId<Location>;
  /** Pre-fills the visit type, for a deep link or a reschedule. */
  readonly defaultService?: WithId<HealthcareService>;
  /** Pre-fills who the visit is for, for a host launching from a patient's chart. */
  readonly defaultPatient?: WithId<Patient>;
  /**
   * The day the time search opens on, and the day a typed time starts out on.
   * Defaults to today.
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
   * Called with the time chosen, and with `undefined` once it is dropped.
   *
   * Every answer above the time drops it — a different day, a different provider —
   * so a host pointing at the time on a calendar of its own takes the marker down
   * rather than leaving it on a time nobody chose.
   */
  readonly onChangeTime?: (time: DateTimeRange | undefined) => void;
  /** The ValueSet the procedure code field binds to. Defaults to the full CPT value set. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to the full ICD-10-CM value set. */
  readonly diagnosisBinding?: string;
  /**
   * Performs the booking with the proposal the form assembled.
   *
   * Resolving marks the form booked, so it stops offering to book until an answer
   * changes; rejecting shows the reason as the booking's refusal, every answer kept.
   */
  readonly onBook: (proposal: Appointment, options: BookOptions) => void | Promise<void>;
  /** Extensions to put on every appointment this form books. */
  readonly appointmentExtensions?: readonly Extension[];
  /**
   * Allows for manual entry of a time and length, bypassing the `$find` search and
   * `$book` endpoint.
   */
  readonly canBypassSchedulingRules?: boolean;
}

/** What `onBook` is told about the proposal it was handed. */
export interface BookOptions {
  /** True when the time was typed (& unvalidated) rather than chosen from the search. */
  readonly manual: boolean;
}

/**
 * Gathers what a visit is held on, finds a time every one of them is free, and
 * hands the proposal out to be booked.
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
  const medplum = useMedplum();
  const {
    defaultLocation,
    defaultService,
    defaultPatient,
    defaultStart,
    mrnSystem,
    onToggleTimeFinder,
    onChangeService,
    onChangeTime,
    procedureBinding = DEFAULT_PROCEDURE_VALUE_SET,
    diagnosisBinding = DEFAULT_DIAGNOSIS_VALUE_SET,
    onBook,
    canBypassSchedulingRules,
    appointmentExtensions,
  } = props;

  const [location, setLocation] = useState<WithId<Location> | undefined>(defaultLocation);
  const [service, setService] = useState<WithId<HealthcareService> | undefined>(defaultService);
  const [selections, setSelections] = useState<ActorSelections>({});
  const [month, setMonth] = useState<Date | undefined>(defaultStart);
  const [finding, setFinding] = useState(false);
  const [chosen, setChosen] = useState<Appointment | undefined>(undefined);
  // The fields ignore `defaultValue` after mount, so remounting is the only way to
  // clear their pills. Counters, so a field is never remounted out from under a pick.
  const [actorFieldsKey, setActorFieldsKey] = useState(0);
  const [serviceFieldKey, setServiceFieldKey] = useState(0);
  const [patient, setPatient] = useState<WithId<Patient> | undefined>(defaultPatient);
  const [requirementValues, setRequirementValues] = useState<BookingRequirementValues>(EMPTY_REQUIREMENT_VALUES);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookError, setBookError] = useState<unknown>(undefined);
  const [manualChoice, setManualChoice] = useState<Appointment | undefined>(undefined);
  const [manualDateTime, setManualDateTime] = useState('');
  const [manualDurationMinutes, setManualDurationMinutes] = useState<number | undefined>(undefined);
  const [conflicts, setConflicts] = useState<readonly BookingConflict[]>([]);

  const manual = chosen !== undefined && chosen === manualChoice;

  // Settles once the time and length fields stop moving; only the conflict lookup waits.
  const [debouncedChoice] = useDebouncedValue(manualChoice, CONFLICT_DEBOUNCE_MS);

  const selectionError = useMemo(() => getSelectionError(selections), [selections]);

  // Each field is asked for on its own, by a visit type whose eligibility names it.
  const requirements = useMemo(() => getSchedulingRequirements(service), [service]);
  const requirementsOutstanding = !hasRequiredValues(requirementValues, requirements);

  // The button above says the search is blocked; this says which rows blocked it.
  const actorErrors = useMemo(() => {
    const unsatisfiable = getUnsatisfiableRows(selections);
    return unsatisfiable && { [unsatisfiable.actorType]: unsatisfiable.message };
  }, [selections]);

  // Derived, not a flag: closing is never its own rule, so losing the last provider
  // closes the search however it was lost.
  const searching = finding && !selectionError;

  // Nothing is searched until the time search is open, so the answers above cost no
  // request per keystroke.
  const combinations = useMemo(() => (searching ? getActorCombinations(selections) : []), [searching, selections]);

  const candidates = useMemo(() => getSelectedCandidates(selections), [selections]);

  // `$find` applies each Schedule's own parameters, so the actors in one search need not
  // agree on a timezone. The first one is taken as the exemplar for what to display:
  // the times themselves are real instants either way, only their labelling is at stake.
  const timezone = useMemo(() => {
    const [first] = candidates;
    return service ? getSchedulingTimezone(service, first?.schedule, first?.actorResource) : undefined;
  }, [service, candidates]);

  const clearManualTime = useCallback((): void => {
    setManualChoice(undefined);
    setManualDateTime('');
    setManualDurationMinutes(undefined);
    setConflicts([]);
  }, []);

  // A proposal carries the Slots it was found for, so it cannot outlive the days it was
  // offered from. A typed time carries none: dropping it here would take the proposal
  // away while its fields, and their warnings, stayed on screen saying otherwise.
  const clearChosen = useCallback(
    (): void => setChosen((current) => (current === manualChoice ? current : undefined)),
    [manualChoice]
  );

  // All actor resources, keyed by their reference.
  const actorResources = useMemo(() => getSelectedActorResources(selections), [selections]);

  const daySearch = useDaySearch({
    service,
    combinations,
    timezone,
    defaultStart,
    actorResources,
    onResultsReplaced: clearChosen,
  });
  const { reset: resetDaySearch } = daySearch;

  // The first window is back and nothing is holding the search up, so what it found —
  // even if that is nothing — is what is on screen.
  const settled = !daySearch.loadingFirstDays && !daySearch.findRequestError && !daySearch.windowError;

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

  // Same shape as above: the ref holds the last time reported, so mounting takes down
  // no marker the host put up, and clearing a time nobody chose reports no drop.
  const reportedTime = useRef<Appointment | undefined>(undefined);
  useEffect(() => {
    if (reportedTime.current !== chosen) {
      reportedTime.current = chosen;
      onChangeTime?.(toRange(chosen));
    }
  }, [chosen, onChangeTime]);

  const patientItem = useCallback(
    (option: AsyncAutocompleteOption<WithId<Patient>>) => (
      <AppointmentOptionRow label={option.label} detail={formatPatientDetail(option.resource, mrnSystem)} />
    ),
    [mrnSystem]
  );

  function toggleFinder(): void {
    setFinding(!finding);
  }

  const chooseResources = useCallback(
    (next: ActorSelections): void => {
      setSelections(next);
      // A chosen time is a proposal carrying the Slots it was found for. Booked after
      // a resource changes it would hold whoever is named inside the proposal, and
      // `$book` cannot catch that: the proposal is internally consistent.
      setChosen(undefined);
      // A different calendar can configure a different length, and nobody asked for
      // the one that happened to be on screen. The typed time goes with it: it was
      // proposed against these schedules, and a field still holding it would read as
      // a time that is going to be booked.
      clearManualTime();
      resetDaySearch();
    },
    [clearManualTime, resetDaySearch]
  );

  function chooseService(next: WithId<HealthcareService> | undefined): void {
    setService(next);
    onChangeService?.(next);
    setRequirementValues(EMPTY_REQUIREMENT_VALUES);
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
    clearManualTime();
    setActorFieldsKey((key) => key + 1);
    resetDaySearch();
  }

  function chooseTime(next: Appointment): void {
    setChosen(next);
    setConflicts([]);
    setBooked(false);
  }

  const configuredDurationMinutes = useMemo(
    () => (service ? resolveBookingGeometry(service, candidates[0]?.schedule).duration : undefined),
    [service, candidates]
  );

  // State holds the edit rather than the value, so a different visit type falls back to
  // its own default instead of keeping the last length typed.
  const effectiveDurationMinutes = manualDurationMinutes ?? configuredDurationMinutes;

  /**
   * Takes the typed time and length together and proposes them, or takes the proposal
   * back down while they are still incomplete.
   *
   * @param dateTime - A `YYYY-MM-DDTHH:MM` wall-clock value, read in the visit's timezone.
   * @param durationMinutes - How long the visit runs.
   */
  function enterManualTime(dateTime: string, durationMinutes: number | undefined): void {
    // Stale the moment the fields move: what was looked up was about a different time.
    setConflicts([]);
    setManualDateTime(dateTime);
    setManualDurationMinutes(durationMinutes);

    const start = parseZonedDateTimeInput(dateTime, timezone);
    if (!start || !durationMinutes || durationMinutes <= 0 || !service || candidates.length === 0) {
      setManualChoice(undefined);
      // Only ever clears a manual time: a time from the search is not this field's to drop.
      setChosen((current) => (current === manualChoice ? undefined : current));
      return;
    }

    const proposal = buildElevatedBooking({
      service,
      schedules: candidates.map((candidate) => candidate.schedule),
      start,
      durationMinutes,
    });
    setManualChoice(proposal);
    setChosen(proposal);
    setBooked(false);
  }

  // Only a typed time needs this. A time the search offered was found by intersecting
  // the very Slots this would search, so it cannot conflict with them.
  //
  // A keystroke moves the proposal and nothing else here, so debouncing that one value
  // holds the search off until typing settles while a change of visit type or of actors
  // still looks up at once.
  useEffect(() => {
    if (
      chosen !== debouncedChoice ||
      !debouncedChoice?.start ||
      !debouncedChoice.end ||
      !service ||
      candidates.length === 0
    ) {
      // Nothing to look up; whatever was found last was cleared by the change that got here.
      return () => {};
    }

    let active = true;
    const range = { start: new Date(debouncedChoice.start), end: new Date(debouncedChoice.end) };
    findBookingConflicts({ medplum, service, candidates, range })
      .then((found) => {
        if (active) {
          setConflicts(found);
        }
      })
      .catch(() => {
        // Saying nothing beats refusing a booking this user is allowed to make.
        if (active) {
          setConflicts([]);
        }
      });

    return () => {
      active = false;
    };
  }, [medplum, chosen, debouncedChoice, service, candidates]);

  function choosePatient(next: WithId<Patient> | undefined): void {
    setPatient(next);
    setBooked(false);
  }

  function chooseRequirementValues(next: BookingRequirementValues): void {
    setRequirementValues(next);
    setBooked(false);
  }

  async function bookAppointment(): Promise<void> {
    if (!chosen || !patient || requirementsOutstanding) {
      return;
    }

    setBooking(true);
    setBookError(undefined);
    try {
      await onBook(buildBooking(chosen, patient, requirementValues, requirements, appointmentExtensions), { manual });
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
      <Stack className={classes.form} gap="sm">
        <ResourceInput<WithId<Location>>
          resourceType="Location"
          name="location"
          label="Location"
          placeholder="Any location"
          searchCriteria={LOCATION_SEARCH_CRITERIA}
          defaultValue={defaultLocation}
          onChange={chooseLocation}
          clearable={false}
        />
        <AppointmentServiceSelect
          key={serviceFieldKey}
          location={location}
          // From state, not the prop: `defaultService` on a remount would put back
          // the visit type the remount was clearing.
          defaultValue={service}
          onChange={chooseService}
        />

        <AppointmentActorSelections
          key={`actors-${actorFieldsKey}`}
          value={selections}
          service={service}
          location={location}
          disabled={!service}
          errors={actorErrors}
          onChange={chooseResources}
        />

        <ChosenTime
          appointment={chosen}
          timezone={timezone}
          actors={chosenActors}
          searching={searching}
          blockedBy={service ? selectionError : NO_SERVICE_BLOCKER}
          onToggleFinder={toggleFinder}
        />

        {searching && (
          <Stack gap={4}>
            <CalendarDateInput
              availableDates={NO_MARKED_DATES}
              allowUnavailableDates
              earliestDate={new Date()}
              month={month}
              range={daySearch.selectedDayRange}
              onChangeMonth={setMonth}
              onClick={daySearch.chooseDayRange}
              onSelectRange={daySearch.chooseDayRange}
            />
            {daySearch.windowError && <Alert color="yellow">{daySearch.windowError}</Alert>}
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
          clearable={false}
        />

        {/* Each field is shown only for a visit type whose eligibility asks for it. */}
        {service && requirements.size > 0 && (
          <Fragment key={service.id}>
            {requirements.has(REQUIRES_PROCEDURE_CODE) && (
              <ValueSetAutocomplete
                name="procedure-code"
                label="Procedure codes"
                required
                itemComponent={RequirementCodeItem}
                pillComponent={RequirementCodePill}
                binding={procedureBinding}
                onChange={(elements) =>
                  chooseRequirementValues({
                    ...requirementValues,
                    procedure: toCodings(elements),
                  })
                }
              />
            )}
            {requirements.has(REQUIRES_DIAGNOSIS_CODE) && (
              <ValueSetAutocomplete
                name="diagnosis-code"
                label="Diagnosis codes"
                required
                itemComponent={RequirementCodeItem}
                pillComponent={RequirementCodePill}
                binding={diagnosisBinding}
                onChange={(elements) =>
                  chooseRequirementValues({
                    ...requirementValues,
                    diagnosis: toCodings(elements),
                  })
                }
              />
            )}
            {requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE) && (
              <Checkbox
                classNames={{ label: classes.requiredLabel }}
                label="Medical necessity confirmed"
                required
                checked={requirementValues.medicalNecessity}
                onChange={(event) =>
                  chooseRequirementValues({ ...requirementValues, medicalNecessity: event.currentTarget.checked })
                }
              />
            )}
          </Fragment>
        )}

        {bookError !== undefined && <Alert color="red">{normalizeErrorString(bookError)}</Alert>}
        <Button
          fullWidth
          disabled={!chosen || !patient || booked || requirementsOutstanding}
          loading={booking}
          onClick={bookAppointment}
        >
          Book appointment
        </Button>
      </Stack>

      {searching && (
        <Stack className={classes.results} gap="lg">
          {canBypassSchedulingRules && (
            <ManualTime
              dateTime={manualDateTime}
              durationMinutes={effectiveDurationMinutes}
              timezone={timezone}
              conflicts={conflicts}
              onChange={enterManualTime}
            />
          )}
          {daySearch.loadingFirstDays && <Loader size="sm" />}
          {daySearch.findRequestError && <Alert color="red">{normalizeErrorString(daySearch.findRequestError)}</Alert>}
          {!daySearch.loadingFirstDays &&
            daySearch.hasTimes &&
            daySearch.timeResultsByDay.map((day) => (
              <AppointmentDayTimes
                key={day.key}
                date={day.date}
                groups={day.groups}
                timezone={timezone}
                selected={chosen}
                onSelectAppointment={chooseTime}
              />
            ))}
          {settled && (
            <>
              {!daySearch.hasTimes && (
                <Text c="dimmed" ta="center">
                  {daySearch.hasMoreCombinations
                    ? 'No times yet for the options searched so far.'
                    : 'No times are available for this selection.'}
                </Text>
              )}
              {daySearch.hasMoreCombinations && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" ta="center">
                    {getSearchedOptionsHint(daySearch.searchedCombinationCount, daySearch.totalCombinationCount)}
                  </Text>
                  <Button variant="subtle" onClick={daySearch.searchMoreCombinations}>
                    Search more options
                  </Button>
                </Stack>
              )}
              {/* No signal for how far ahead there's anything to find, so this has no end state. */}
              <Button variant="subtle" loading={daySearch.loadingMoreDays} onClick={daySearch.showMoreDays}>
                Show more days
              </Button>
            </>
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
  readonly actors: readonly SchedulingActorValue[];
  readonly searching: boolean;
  /** What is still owed before a time can be searched for, if anything. */
  readonly blockedBy: SelectionBlocker | undefined;
  readonly onToggleFinder: () => void;
}

/**
 * The chosen time, and under it the action that found it.
 *
 * Read-only whichever way the time was arrived at: a time offered by the search and a
 * time typed into {@link ManualTime} both land here.
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
        {blockedBy && <BlockerMessage blocker={blockedBy} />}
      </Stack>
    </>
  );
}

interface BlockerMessageProps {
  readonly blocker: SelectionBlocker;
}

/**
 * Why the finder cannot run, under the button that would have run it.
 *
 * Selections that cannot work are the user's to undo, so they are called out as
 * errors. A form that is merely unfinished is a prompt, and stays quiet.
 *
 * @param props - The React props.
 * @returns The blocker, styled by what it asks of the user.
 */
function BlockerMessage(props: BlockerMessageProps): JSX.Element {
  const { message, severity } = props.blocker;

  if (severity === 'incomplete') {
    return (
      <Text size="xs" c="dimmed">
        {message}
      </Text>
    );
  }

  return (
    <Group gap={6} wrap="nowrap">
      <IconAlertCircle size={16} stroke={1.8} color="var(--mantine-color-error)" style={{ flexShrink: 0 }} />
      <Text size="xs" c="var(--mantine-color-error)">
        {message}
      </Text>
    </Group>
  );
}

interface ManualTimeProps {
  /** A `YYYY-MM-DDTHH:MM` wall-clock value, read in the visit's timezone. */
  readonly dateTime: string;
  readonly durationMinutes: number | undefined;
  /** IANA timezone the visit is held in. */
  readonly timezone: string | undefined;
  readonly conflicts: readonly BookingConflict[];
  readonly onChange: (dateTime: string, durationMinutes: number | undefined) => void;
}

/**
 * Fields prompting the user for a datetime and a duration, used to manually choose
 * when an appointment should be scheduled and for how long.
 * @param props - The React props.
 * @returns The fields, and what the time entered clashes with.
 */
function ManualTime(props: ManualTimeProps): JSX.Element {
  const { dateTime, durationMinutes, timezone, conflicts, onChange } = props;

  return (
    <Stack gap={4}>
      <Text fw={500} size="sm">
        Or enter a time
      </Text>
      <Group align="flex-start" gap="xs" wrap="nowrap">
        <TextInput
          label="Date & time"
          type={getNativeInputType('datetime-local')}
          flex={1}
          value={dateTime}
          onChange={(event) => onChange(event.currentTarget.value, durationMinutes)}
        />
        <NumberInput
          label="Minutes"
          min={1}
          allowDecimal={false}
          w={110}
          value={durationMinutes ?? ''}
          onChange={(value) => onChange(dateTime, typeof value === 'number' ? value : undefined)}
        />
      </Group>

      {/* The visit is held where it is held, not where the person booking it is
          sitting, and a typed time is read there. */}
      {!isViewerTimezone(timezone) && timezone && (
        <Text size="xs" c="dimmed">
          Times are {formatTimezoneLabel(timezone)}.
        </Text>
      )}

      {conflicts.map((conflict) => (
        <Text key={`${conflict.schedule}-${conflict.kind}`} size="xs" c="orange.8">
          {describeConflict(conflict)}
        </Text>
      ))}
    </Stack>
  );
}

interface ChosenTimeCommitmentProps {
  readonly appointment: Appointment;
  /** Who the time is held on. */
  readonly actors: readonly SchedulingActorValue[];
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
        const actorLabel = getActorTypeLabel(getActorType(actor));
        return (
          <Fragment key={getReferenceString(actor)}>
            {(index > 0 || durationMinutes > 0) && ' · '}
            {actorLabel}: <ResourceName value={actor} link={false} inherit />
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

/**
 * One code on offer, led by the code itself.
 *
 * The code is what a scheduler searches on and what a biller reads, and descriptions run long
 * before they diverge: the CPT descriptions for infusion procedures, to take one example, agree
 * for sixty characters. Led by its description, a row does not tell itself apart from the next.
 * The system is left out because a field's value set draws from a single code system in practice,
 * which makes printing it one url repeated down the list and nothing more.
 *
 * @param props - The option to render.
 * @returns The row.
 */
function RequirementCodeItem(props: Readonly<AsyncAutocompleteOption<ValueSetExpansionContains>>): JSX.Element {
  const { label, resource, active } = props;
  return (
    <Group wrap="nowrap" gap="xs">
      {active && <IconCheck size={12} />}
      <Text size="sm">
        <Text span fw={600}>
          {resource.code}
        </Text>{' '}
        <Text span>{label}</Text>
      </Text>
    </Group>
  );
}

interface RequirementCodePillProps {
  readonly item: AsyncAutocompleteOption<ValueSetExpansionContains>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}

/**
 * A code that has been given, led by the code.
 *
 * What a scheduler checks a filled-in form against, and what a biller reads off it, is the code, so
 * it comes first and stays readable however narrow the pill gets. The description follows and is
 * clipped, since a dozen words times three pills would bury the rest of the form. The full text is
 * on the pill's `title`. A code typed in rather than picked off the list is its own description, so
 * it is printed once rather than twice.
 *
 * @param props - The chosen option, and how to take it back out.
 * @returns The pill.
 */
function RequirementCodePill(props: RequirementCodePillProps): JSX.Element {
  const { item, disabled, onRemove } = props;
  const code = item.resource.code;
  return (
    <Pill className={classes.codePill} withRemoveButton={!disabled} onRemove={onRemove} title={item.label}>
      {code && code !== item.label ? `${code} · ${item.label}` : item.label}
    </Pill>
  );
}

/**
 * Puts the patient, anything the visit type required, and whatever the host wants carried
 * onto the proposal that will be booked.
 *
 * Records a value only where the visit type asked for one: a field nobody was shown holds
 * whatever it was left at, and writing that would put an answer on the booking that was
 * never given.
 *
 * @param proposal - The time that was chosen, as `$find` offered it.
 * @param patient - Who the visit is for.
 * @param values - The codes and attestation given.
 * @param requirements - What the visit type requires, from its eligibility codes.
 * @param extensions - Extensions the host asked to be carried on the appointment.
 * @returns The appointment to book.
 */
function buildBooking(
  proposal: Appointment,
  patient: WithId<Patient>,
  values: BookingRequirementValues,
  requirements: ReadonlySet<SchedulingRequirement>,
  extensions: readonly Extension[] | undefined
): Appointment {
  const patientReference = getReferenceString(patient);
  const procedure = requirements.has(REQUIRES_PROCEDURE_CODE) ? values.procedure : [];
  const diagnosis = requirements.has(REQUIRES_DIAGNOSIS_CODE) ? values.diagnosis : [];
  const serviceType = [...(proposal.serviceType ?? []), ...procedure.map((coding) => ({ coding: [coding] }))];
  const reasonCode = [...(proposal.reasonCode ?? []), ...diagnosis.map((coding) => ({ coding: [coding] }))];
  const extension = [
    ...(proposal.extension ?? []),
    ...(requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE)
      ? [{ url: SchedulingMedicalNecessityURI, valueBoolean: values.medicalNecessity }]
      : []),
    ...(extensions ?? []),
  ];

  return {
    ...proposal,
    created: new Date().toISOString(),
    participant: [
      // A proposal knows nothing about patients, but a host may have put one on
      // the appointment it handed over, and naming them twice books them twice.
      ...proposal.participant.filter((participant) => participant.actor?.reference !== patientReference),
      { actor: createReference(patient), required: 'required', status: 'needs-action' },
    ],
    ...(serviceType.length > 0 && { serviceType }),
    ...(reasonCode.length > 0 && { reasonCode }),
    ...(extension.length > 0 && { extension }),
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
 * Reads the interval a proposal runs over.
 *
 * @param appointment - The chosen proposal, if one has been chosen.
 * @returns When the visit starts and ends, or undefined until a time is chosen.
 */
function toRange(appointment: Appointment | undefined): DateTimeRange | undefined {
  if (!appointment?.start || !appointment.end) {
    return undefined;
  }
  return { start: new Date(appointment.start), end: new Date(appointment.end) };
}

/**
 * The line above "Search more options": how much of the search has been run.
 * @param searched - How many ways of holding the visit have been searched.
 * @param total - How many there are in all.
 * @returns The line to show.
 */
function getSearchedOptionsHint(searched: number, total: number): string {
  return `Showing times for ${searched} of ${total} ways of holding this visit.`;
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
    timeZoneName: isViewerTimezone(timezone) ? undefined : 'shortGeneric',
  }).format(value);
}
