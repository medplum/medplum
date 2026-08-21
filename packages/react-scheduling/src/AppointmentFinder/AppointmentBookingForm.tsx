// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Loader, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString, getSchedulingTimezone, isDefined, normalizeErrorString } from '@medplum/core';
import type { Appointment, HealthcareService, Location } from '@medplum/fhirtypes';
import { CalendarDateInput, ReferenceDisplay, ResourceInput } from '@medplum/react';
import { IconCalendarSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import { AppointmentDayTimes } from './AppointmentDayTimes';
import classes from './AppointmentFinder.module.css';
import type { SchedulingRole } from './AppointmentFinder.roles';
import { getActorRoleLabel, SCHEDULING_ROLES } from './AppointmentFinder.roles';
import type { ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import { getActorCombinations, getSelectedCandidates, getSelectionError } from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import { endOfDay, getDurationMinutes, getFindWindowError, groupAppointmentsByDay } from './AppointmentFinder.times';
import { AppointmentServiceSelect } from './AppointmentServiceSelect';
import { isServiceKeptAtLocation } from './AppointmentServiceSelect.utils';
import { useProposedAppointments } from './useProposedAppointments';

// Rooms are Locations too, so the site field is kept off them by what they are
// not: `physical-type` is a Medplum search parameter, so the exclusion is the
// server's and paging survives it. Naming what a site *is* would be more precise
// and would silently hide a Location whose type nobody populated.
const LOCATION_SEARCH_CRITERIA = { _count: '25', _sort: 'name', 'physical-type:not': 'ro,bd' };

// Nothing has scanned a month for the days that have times on them, so every day
// is offered and the search is what answers.
const NO_MARKED_DATES: Date[] = [];

export interface AppointmentBookingFormProps {
  /** Pre-fills where the visit is, for a host that already knows. */
  readonly defaultLocation?: WithId<Location>;
  /** Pre-fills the visit type, for a deep link or a reschedule. */
  readonly defaultService?: WithId<HealthcareService>;
  /**
   * The day the time search opens on. Defaults to today.
   *
   * Seeds the day rather than the time: only a time `$find` offered can be
   * chosen, so a pre-filled time could not survive its own validation.
   */
  readonly defaultStart?: Date;
  /**
   * Called when the time search opens or closes.
   *
   * The times sit beside the form rather than under it, so a host that puts this
   * in a side panel has to widen the panel to fit them. Reports rather than
   * decides, because that is the host's layout to change.
   */
  readonly onToggleTimeFinder?: (open: boolean) => void;
  /**
   * Called with the visit type as it changes.
   *
   * The type decides more than the search: it carries the availability a host may
   * want to shade its own calendar with.
   */
  readonly onChangeService?: (service: WithId<HealthcareService> | undefined) => void;
}

/**
 * Gathers what a visit is held on, and finds a time every one of them is free.
 *
 * Narrow by site and visit type, then name the actors: one field per scheduling
 * role, each searching the schedules bookable for that type. Everything named
 * attends, because `$find` intersects their schedules — so naming a second room
 * narrows the times rather than widening them.
 *
 * Choosing a time is deliberately a separate step behind "Find a time". The
 * times depend on every answer above them, so offering them earlier would only
 * show times that are about to change. Only a time the search offered can be
 * chosen: the field that holds it accepts no input, and there is none at all until
 * a time exists, so nothing can be booked onto time that was never checked against
 * anybody's availability.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function AppointmentBookingForm(props: AppointmentBookingFormProps): JSX.Element {
  const { defaultLocation, defaultService, defaultStart, onToggleTimeFinder, onChangeService } = props;

  const [location, setLocation] = useState<WithId<Location> | undefined>(defaultLocation);
  const [service, setService] = useState<WithId<HealthcareService> | undefined>(defaultService);
  const [selections, setSelections] = useState<ActorSelections>({});
  const [range, setRange] = useState<DateRange>(() => oneDay(defaultStart ?? new Date()));
  const [month, setMonth] = useState<Date | undefined>(defaultStart);
  const [finding, setFinding] = useState(false);
  const [chosen, setChosen] = useState<Appointment | undefined>(undefined);
  // The fields below hold their own selections and ignore `defaultValue` after
  // mount, so clearing the state above is not enough to clear what is on screen.
  // Remounting is, and these are what force it — counters rather than the chosen
  // values, so a field is never remounted out from under the user's own pick.
  const [roleFieldsKey, setRoleFieldsKey] = useState(0);
  const [serviceFieldKey, setServiceFieldKey] = useState(0);

  const selectionError = getSelectionError(selections);
  const windowError = getFindWindowError(range);

  // Nothing is searched until the time search is open, so the answers above can
  // be changed without a request per keystroke.
  const combinations = useMemo(
    () => (finding && !selectionError && !windowError ? getActorCombinations(selections) : []),
    [finding, selectionError, windowError, selections]
  );

  const search = useProposedAppointments({ service, combinations, range });

  // The schedule is what carries the timezone for a service, so the first chosen
  // actor's schedule answers it. Every actor in one search shares the scheduling
  // parameters — `$find` rejects the request otherwise.
  const timezone = useMemo(() => {
    const [first] = getSelectedCandidates(selections);
    return service ? getSchedulingTimezone(service, first?.schedule, first?.actorResource) : undefined;
  }, [service, selections]);

  const days = useMemo(() => groupAppointmentsByDay(search.appointments, timezone), [search.appointments, timezone]);

  function toggleFinder(): void {
    const next = !finding;
    setFinding(next);
    onToggleTimeFinder?.(next);
  }

  function chooseService(next: WithId<HealthcareService> | undefined): void {
    setService(next);
    onChangeService?.(next);
    // The actors on offer come from the visit type, so what was chosen for the
    // last one cannot mean anything for this one — nor can a time held on them.
    clearResources();
    // Nothing can be searched without a visit type, and the field holds one at a
    // time, so every change passes through none. Collapsing keeps the times from
    // outliving what produced them, and the host is told so its panel narrows
    // with them.
    closeFinder();
  }

  function chooseLocation(next: WithId<Location> | undefined): void {
    setLocation(next);
    // Where a visit is held decides which actors are offered at all, so the ones
    // chosen for the last site cannot be assumed to serve this one.
    clearResources();
    // The visit type is narrowed by site too. It only has to go when the new site
    // does not hold it; otherwise the answer still stands.
    if (service && !isServiceKeptAtLocation(service, next)) {
      setService(undefined);
      onChangeService?.(undefined);
      setServiceFieldKey((key) => key + 1);
      closeFinder();
    }
  }

  function clearResources(): void {
    setSelections({});
    setChosen(undefined);
    setRoleFieldsKey((key) => key + 1);
  }

  function closeFinder(): void {
    if (finding) {
      setFinding(false);
      onToggleTimeFinder?.(false);
    }
  }

  function chooseDay(date: Date): void {
    setRange(oneDay(date));
    // A time on one day is not a time on another.
    setChosen(undefined);
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
        />
        <AppointmentServiceSelect
          key={serviceFieldKey}
          location={location}
          // Seeded from state, not from the prop: a remount is how the field is
          // cleared, and re-seeding from `defaultService` would put back the visit
          // type that was just cleared.
          defaultValue={service}
          onChange={chooseService}
        />

        {SCHEDULING_ROLES.map((role) => (
          <RoleField
            key={`${role}-${roleFieldsKey}`}
            role={role}
            service={service}
            location={location}
            // The actors on offer come from the visit type, so asking before one
            // is chosen could only ever find nothing, which reads as a fault in
            // the field rather than an answer still owed.
            disabled={!service}
            onChange={setSelections}
          />
        ))}

        <ChosenTime
          appointment={chosen}
          timezone={timezone}
          finding={finding}
          disabled={!service}
          onToggleFinder={toggleFinder}
        />

        {finding && (
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
            {selectionError && (
              <Text size="sm" c="dimmed">
                {selectionError}
              </Text>
            )}
          </Stack>
        )}
      </Stack>

      {finding && (
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
          {!search.loading && !search.error && !selectionError && !windowError && days.length === 0 && (
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
  /** The proposal the user picked, or undefined while none has been. */
  readonly appointment: Appointment | undefined;
  /** IANA timezone the visit is held in. */
  readonly timezone: string | undefined;
  readonly finding: boolean;
  readonly disabled?: boolean;
  readonly onToggleFinder: () => void;
}

/**
 * The chosen time, and under it the action that found it.
 *
 * The form is a column of labelled fields and the chosen time is one of its
 * answers, so it sits in that column, above the control that produced it. What it
 * must not be is a field before there is anything to put in it: an empty white
 * input among greyed-out ones reads as the one thing still fillable, and its
 * placeholder repeated the button's own invitation. So there is no field until
 * there is a time.
 *
 * Read-only, and deliberately an input rather than plain text: for a user
 * permitted to override, this same field in this same place becomes editable and
 * gains a warning. Keeping the region isolated and reading from the chosen
 * proposal is what makes that a control change rather than a layout change.
 *
 * @param props - The React props.
 * @returns The chosen time, once there is one, and the action.
 */
function ChosenTime(props: ChosenTimeProps): JSX.Element {
  const { appointment, timezone, finding, disabled, onToggleFinder } = props;

  return (
    <>
      {appointment?.start && (
        <TextInput
          label="Date & time"
          readOnly
          value={formatZonedDateTime(new Date(appointment.start), timezone)}
          // Under the value rather than over it: the time is the answer, and what
          // it commits to only qualifies it.
          inputWrapperOrder={['label', 'input', 'description']}
          description={<ChosenTimeCommitment appointment={appointment} />}
        />
      )}

      <Button
        variant="outline"
        fullWidth
        leftSection={<IconCalendarSearch size={16} stroke={1.8} />}
        disabled={disabled}
        onClick={onToggleFinder}
      >
        {getFinderLabel(finding, !!appointment)}
      </Button>
    </>
  );
}

interface ChosenTimeCommitmentProps {
  readonly appointment: Appointment;
}

/**
 * What the chosen time commits to: how long the visit runs, and what holds it.
 *
 * Read off the proposal rather than off the answers above, because the proposal is
 * what `$book` is handed — so this describes what would actually be booked. Inline
 * elements only: it renders as the field's description, which is a paragraph, and
 * being the field's own description is what ties it to the value it qualifies.
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
 * @param finding - Whether the time search is open.
 * @param chosen - Whether a time has been picked.
 * @returns The button's label.
 */
function getFinderLabel(finding: boolean, chosen: boolean): string {
  if (finding) {
    return 'Close time finder';
  }
  // Repeating the invitation once a time is chosen reads as though the search had
  // come back with nothing.
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
 * field searches on a changed callback, and one built inline would be new on
 * every keystroke anywhere in the form.
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
 * Returns the range covering one whole day.
 * @param date - Any instant during the day.
 * @returns The day, both ends closed, as `$find` requires.
 */
function oneDay(date: Date): DateRange {
  return { start: date, end: endOfDay(date) };
}

/**
 * Writes an instant as the day and time it falls on at the site.
 *
 * Read in the timezone the visit is held in, so the summary shows the time the
 * clinic will keep rather than the time on the booker's own clock.
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
