// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Loader, Stack, Stepper, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  getDisplayString,
  getReferenceString,
  getSchedulingTimezone,
  isDefined,
  normalizeErrorString,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Appointment, HealthcareService, Location, Patient, Reference } from '@medplum/fhirtypes';
import { ResourceName, startOfMonth } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import { IconMapPin, IconStethoscope } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppointmentBookingDraft } from './AppointmentConfirmForm';
import { AppointmentConfirmForm, getBookingError } from './AppointmentConfirmForm';
import type { AppointmentSearchCriteria } from './AppointmentCriteriaForm';
import { AppointmentCriteriaForm, getCriteriaError } from './AppointmentCriteriaForm';
import type { AppointmentSelectionOptions } from './AppointmentCustomTimeCard';
import { applyBookingDetails } from './AppointmentFinder.assemble';
import classes from './AppointmentFinder.module.css';
import { getConfiguredDurationMinutes } from './AppointmentFinder.params';
import type { ActorSelections, ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import { getActorCombination, getSelectedCandidates, getSelectedSchedules } from './AppointmentFinder.schedules';
import {
  MAX_FIND_WINDOW_DAYS,
  endOfDay,
  endOfMonth,
  enumerateDateRange,
  filterByTimeOfDay,
  getDurationMinutes,
  groupAppointmentsByDay,
} from './AppointmentFinder.times';
import { AppointmentLocationSelect } from './AppointmentLocationSelect';
import { AppointmentServiceSelect, toServiceReference } from './AppointmentServiceSelect';
import type { CustomTimeConfig } from './AppointmentSlotPicker';
import { AppointmentSlotPicker } from './AppointmentSlotPicker';
import type { AppointmentFindCriteria } from './useAppointmentFind';
import { useAppointmentFind } from './useAppointmentFind';
import { useEligibleSchedules } from './useEligibleSchedules';
import type { MonthAvailabilityCriteria } from './useMonthAvailability';
import { useMonthAvailability } from './useMonthAvailability';

/** How far ahead of now the earliest offered time must be, unless overridden. */
const DEFAULT_MINIMUM_NOTICE_MINUTES = 30;

/** Visit length for a requested time when the service configures none. */
const DEFAULT_VISIT_MINUTES = 30;

/**
 * The pages of the finder, in the order they are walked.
 *
 * Named rather than numbered so that adding a page later does not silently
 * change what a caller's step means.
 */
export const APPOINTMENT_FINDER_STEPS = ['service', 'times', 'confirm'] as const;

export type AppointmentFinderStep = (typeof APPOINTMENT_FINDER_STEPS)[number];

export interface AppointmentFinderProps {
  /**
   * Called with the appointment to book, once a time has been chosen and
   * confirmed. It carries the `contained` Slots that `$book` and `$hold` need,
   * so pass it on unmodified.
   *
   * Returning a promise keeps the button in its loading state until it settles,
   * and a rejection is shown against the button. Which of `$book` and `$hold` to
   * call is the caller's decision, so this component writes nothing itself.
   *
   * The second argument says whether the time was one the server offered. A time
   * the user asked for instead is reported with `available: false`, and booking
   * it means writing over whatever is already there.
   */
  readonly onBook: (appointment: Appointment, options: AppointmentSelectionOptions) => void | Promise<void>;
  /** Called as soon as a time is chosen, for a caller that wants to follow along. */
  readonly onSelectAppointment?: (appointment: Appointment, options: AppointmentSelectionOptions) => void;
  /**
   * Fixes the site, and skips the first step when a service is also given. Left
   * out, the site is asked for, or taken from the service when it names one.
   */
  readonly location?: Location | Reference<Location>;
  /** Fixes the service being booked, and skips the first step. */
  readonly service?: HealthcareService | Reference<HealthcareService>;
  /** Who the appointment is for. Given, the patient is not asked for. */
  readonly patient?: Patient | Reference<Patient>;
  /**
   * Offers a way to create a patient who is not on file yet, on the last step.
   * See `AppointmentConfirmForm` for what the host has to do with it.
   */
  readonly onCreatePatient?: () => void;
  /**
   * The `Identifier.system` MRNs are issued under, for a project that does not
   * type them. See `AppointmentPatientSelect`.
   */
  readonly mrnSystem?: string;
  /**
   * Fields of the host's own, shown on the last step under the ones the finder
   * asks for. See `AppointmentConfirmForm`, which describes what the host does
   * with their values.
   */
  readonly additionalFields?: ReactNode;
  /**
   * Why booking cannot go ahead yet, for a host whose own fields are not filled
   * in. Shown beside the book button, which is held until this is cleared. The
   * finder's own reasons, such as no patient chosen, take precedence.
   */
  readonly bookDisabledReason?: string;
  /**
   * The page to show. Passing it hands the step to the caller, who moves it in
   * response to `onStepChange`. Left out, the finder walks itself.
   */
  readonly step?: AppointmentFinderStep;
  /**
   * The page to open on while the finder owns the step. Defaults to `times`
   * when the service is fixed, and `service` otherwise.
   */
  readonly defaultStep?: AppointmentFinderStep;
  /** Called with the page the user asked for, whether or not the caller owns the step. */
  readonly onStepChange?: (step: AppointmentFinderStep) => void;
  /**
   * Dates to open the search on. Both ends are optional, and leaving them out —
   * the default — searches from as soon as the notice period allows, a page at a
   * time.
   */
  readonly defaultDateRange?: { readonly start?: Date; readonly end?: Date };
  /**
   * How many days of times to show at once. Defaults to one, or to every day of
   * a range the user asked for by dragging the calendar.
   */
  readonly daysShown?: number;
  /** Minutes of lead time before the earliest offered appointment. Defaults to 30. */
  readonly minimumNoticeMinutes?: number;
  /**
   * Whether this user may ask for a time that was not offered, and book it over
   * the warning that it may double-book. Defaults to false: it writes over
   * whatever the schedule says, so it belongs to whoever the host decides may
   * overrule it — a scheduler or a practice manager, not a patient booking
   * themselves in.
   */
  readonly allowCustomTime?: boolean;
  readonly onCancel?: () => void;
}

/**
 * Walks a user from a service to a booked appointment.
 *
 * The steps are: choose where and what, then pick a time from what
 * `Appointment/$find` offers, then confirm who it is for. The middle step asks
 * about whoever the service is held on, so a service configured against a
 * provider and a device asks about both without any extra configuration, and the
 * criteria stay beside the times so that narrowing a search is a change to a
 * list already on screen.
 *
 * The middle step runs two searches, not one. The times on screen come from the
 * day or the stretch of days being read, while the calendar beside them is marked
 * from a scan of the whole month on display, so which days are worth clicking
 * does not depend on which one is open. Clicking a day reads it and dragging
 * across days reads all of them; paging the calendar rescans that month, and
 * reads it as well when no day has been asked for, without choosing a day there
 * on the user's behalf.
 *
 * Until a day is asked for, the search covers the month being looked at, so it
 * opens on the soonest day of that month with anything on it — a clinic booked
 * solid for a fortnight opens on the first day it is not. The calendar is the
 * only way through the days, which is why it is marked: a list of times with a
 * "next" button under it would walk a user through the empty days one at a time.
 *
 * Every actor named narrows the times offered rather than adding to them:
 * `$find` intersects the schedules it is given, so naming a surgeon, an
 * anesthesiologist and a theatre asks for the times all three are free. There is
 * no "any eligible" mode — a choice between actors would be a request per
 * combination.
 *
 * Confirming reports the assembled appointment through `onBook`; writing it with
 * `$book` or reserving it with `$hold` is left to the caller.
 *
 * This component is only the shell: it holds the step and the layout, and the
 * work is done by `AppointmentLocationSelect`, `AppointmentServiceSelect`,
 * `AppointmentCriteriaForm`, `AppointmentSlotPicker` and
 * `AppointmentConfirmForm`, each of which is exported and knows nothing about
 * the others. An app with a wizard of its own can lay those out however it
 * likes, or keep this one and own the step through the `step` and `onStepChange`
 * props.
 *
 * @param props - The React props.
 * @returns The appointment finder.
 */
export function AppointmentFinder(props: AppointmentFinderProps): JSX.Element {
  const {
    onBook,
    onSelectAppointment,
    minimumNoticeMinutes = DEFAULT_MINIMUM_NOTICE_MINUTES,
    allowCustomTime = false,
    daysShown,
    onStepChange,
    onCancel,
  } = props;

  const fixedLocation = useResource(props.location);
  const fixedService = useResource(props.service);
  const serviceIsFixed = !!props.service;

  // A caller that fixed the service owns it, so the page that would change it is
  // neither where the finder opens nor somewhere the user can go back to.
  const firstStep: AppointmentFinderStep = serviceIsFixed ? 'times' : 'service';
  const [ownStep, setOwnStep] = useState<AppointmentFinderStep>(props.defaultStep ?? firstStep);
  const step = props.step ?? ownStep;
  const stepIndex = APPOINTMENT_FINDER_STEPS.indexOf(step);
  const firstStepIndex = APPOINTMENT_FINDER_STEPS.indexOf(firstStep);

  const [chosenLocation, setChosenLocation] = useState<WithId<Location>>();
  const [service, setService] = useState<WithId<HealthcareService>>();
  const [criteria, setCriteria] = useState<AppointmentSearchCriteria>(() => defaultCriteria(props.defaultDateRange));
  const [selected, setSelected] = useState<Appointment>();
  const [selectedAvailable, setSelectedAvailable] = useState(true);
  const [draft, setDraft] = useState<AppointmentBookingDraft>({});
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string>();

  // The floor is fixed when a search starts rather than read from the clock on
  // every render, which would restart the search continuously.
  const [noticeFloor, setNoticeFloor] = useState<Date>();

  const goToStep = useCallback(
    (next: AppointmentFinderStep) => {
      if (props.step === undefined) {
        setOwnStep(next);
      }
      onStepChange?.(next);
    },
    [props.step, onStepChange]
  );

  // A caller may open straight onto the times, which skips the button that would
  // otherwise have set the floor.
  useEffect(() => {
    if (step !== 'service') {
      setNoticeFloor((current) => current ?? new Date(Date.now() + minimumNoticeMinutes * 60 * 1000));
    }
  }, [step, minimumNoticeMinutes]);

  useEffect(() => {
    if (fixedService) {
      setService(fixedService);
    }
  }, [fixedService]);

  // A service held at a single site says where it is, so there is nothing to ask.
  // Several sites is a real question, and none at all — telehealth, a phone call —
  // has no answer, which is why the field stays optional either way.
  const serviceSite = service?.location?.length === 1 ? service.location[0] : undefined;
  const inferredLocation = useResource(serviceSite);
  const pickedLocation = fixedLocation ?? chosenLocation;
  const clinic = pickedLocation ?? inferredLocation;

  const {
    groups,
    excludedByClinic,
    loading: loadingSchedules,
    error: schedulesError,
  } = useEligibleSchedules(service, clinic);

  // Every schedule ruled out by the site is a different dead end from a service
  // with nothing configured, and the form has nothing to say about it.
  const nothingAtSite = groups.length === 0 && excludedByClinic > 0;

  // The search opens on one provider rather than all of them: everyone chosen
  // has to be free at once, so opening on all of them would usually find nothing.
  useEffect(() => {
    setCriteria((current) => ({ ...current, actorSelections: defaultSelections(groups) }));
  }, [groups]);

  const actorPrompt = useMemo(
    () => getActorPrompt(groups, criteria.actorSelections),
    [groups, criteria.actorSelections]
  );

  const timezone = useMemo(
    () => getTimezone(groups, criteria.actorSelections, service),
    [groups, criteria.actorSelections, service]
  );

  const findCriteria = useMemo((): AppointmentFindCriteria | undefined => {
    if (step === 'service' || !service || !noticeFloor || getCriteriaError(groups, criteria)) {
      return undefined;
    }
    const schedules = getSelectedSchedules(groups, criteria.actorSelections);
    if (schedules.length === 0) {
      return undefined;
    }
    // The search starts no earlier than the lead time allows, and covers the
    // whole of the last day the user asked for. The lead time can push the start
    // past that day, which leaves nothing to search.
    //
    // With no day asked for it reads the month the calendar is showing, so the
    // times open on the soonest day of that month however far into it that falls,
    // and paging the calendar forward answers with that month rather than with
    // times from the month just left. A shorter window would leave a quiet
    // fortnight looking like a quiet month.
    const from = criteria.start ?? (criteria.month && startOfMonth(criteria.month));
    const start = from && from > noticeFloor ? from : noticeFloor;
    const askedEnd = criteria.end && endOfDay(criteria.end);
    const monthEnd = criteria.start ? undefined : criteria.month && endOfMonth(criteria.month);
    const end = earliest(askedEnd, monthEnd);
    if (end && end <= start) {
      return undefined;
    }
    return {
      service: toServiceReference(service),
      schedules,
      start,
      end,
      // One request as wide as the operation allows, since nothing offers to
      // search any further: whatever is not covered is reached by picking a day.
      pageDays: MAX_FIND_WINDOW_DAYS,
    };
  }, [step, service, noticeFloor, criteria, groups]);

  const { appointments, loading: loadingTimes, error: findError, searchKey } = useAppointmentFind(findCriteria);

  // A time chosen out of one search does not survive another: the actors or the
  // days it was offered for are no longer what is being asked about.
  useEffect(() => {
    setSelected(undefined);
    setBookError(undefined);
  }, [searchKey]);

  const filtered = useMemo(
    () => filterByTimeOfDay(appointments, criteria.timeOfDay, timezone),
    [appointments, criteria.timeOfDay, timezone]
  );

  // Which days of the month have anything, asked separately from the times being
  // read: the search above narrows to the day or the range chosen, and marking
  // the calendar from it would empty the calendar the moment it was used.
  const monthCriteria = useMemo((): MonthAvailabilityCriteria | undefined => {
    if (!findCriteria || !criteria.month) {
      return undefined;
    }
    return {
      service: findCriteria.service,
      schedules: findCriteria.schedules,
      month: criteria.month,
      from: noticeFloor,
    };
  }, [findCriteria, criteria.month, noticeFloor]);

  const monthAvailability = useMonthAvailability(monthCriteria);

  // Read in the scheduling timezone rather than off the ISO strings, so a clinic
  // three zones away marks its own days on the calendar. Filtered the same way
  // the times are, so narrowing to mornings unmarks the afternoon-only days.
  const availableDates = useMemo(
    () =>
      groupAppointmentsByDay(
        filterByTimeOfDay(monthAvailability.appointments, criteria.timeOfDay, timezone),
        timezone
      ).map((day) => day.date),
    [monthAvailability.appointments, criteria.timeOfDay, timezone]
  );

  // Asking for a stretch of days is asking about all of them, so they are all
  // shown at once instead of a day at a time. A caller that fixed how many days
  // to show still gets what it asked for.
  const rangeDays = useMemo(
    () => enumerateDateRange({ start: criteria.start, end: criteria.end }).length,
    [criteria.start, criteria.end]
  );

  // Asking for a specific time needs somebody to hold it on, so it is offered
  // against the same actors the search was run for.
  const customTime = useMemo((): CustomTimeConfig | undefined => {
    if (!allowCustomTime || !service) {
      return undefined;
    }
    const combination = getActorCombination(groups, criteria.actorSelections);
    if (!combination) {
      return undefined;
    }
    const offered = getDurationMinutes(appointments[0]);
    return {
      options: [combination],
      durationMinutes:
        getConfiguredDurationMinutes(service, getFirstSelected(groups, criteria.actorSelections)?.schedule) ??
        (offered > 0 ? offered : DEFAULT_VISIT_MINUTES),
      serviceType: toServiceTypeCodeableConcepts(service),
    };
  }, [allowCustomTime, service, groups, criteria.actorSelections, appointments]);

  const patientReference = useMemo((): Reference<Patient> | undefined => {
    const source = props.patient ?? draft.patient;
    const reference = source && getReferenceString(source);
    return reference ? { reference } : undefined;
  }, [props.patient, draft.patient]);

  // The finder's own reasons come first: a host asking for a billing code has no
  // reason to say so until there is a time and a patient to attach one to.
  const bookingError = selected ? (getBookingError(draft, props.patient) ?? props.bookDisabledReason) : 'Choose a time';

  // Which day a request for a specific time lands on: the day asked for, or the
  // first day the times cover. A search that found nothing has neither, and that
  // is the case where asking matters most, so it falls back to the day the search
  // opens on rather than leaving nothing to ask about.
  const customTimeDay = criteria.start ?? (filtered.length === 0 ? findCriteria?.start : undefined);

  function goToTimes(): void {
    // Stamped afresh, so a search run after sitting on the form for a while does
    // not offer times that have since fallen inside the notice period.
    setNoticeFloor(new Date(Date.now() + minimumNoticeMinutes * 60 * 1000));
    goToStep('times');
  }

  function handleSelect(appointment: Appointment, options: AppointmentSelectionOptions): void {
    setSelected(appointment);
    setSelectedAvailable(options.available);
    setBookError(undefined);
    onSelectAppointment?.(appointment, options);
    goToStep('confirm');
  }

  async function handleBook(): Promise<void> {
    if (!selected) {
      return;
    }
    const appointment = applyBookingDetails(selected, {
      patient: patientReference,
      comment: draft.comment,
      patientInstruction: draft.patientInstruction,
    });

    setBooking(true);
    setBookError(undefined);
    try {
      await onBook(appointment, { available: selectedAvailable });
    } catch (reason) {
      setBookError(normalizeErrorString(reason));
    } finally {
      setBooking(false);
    }
  }

  return (
    <Stack data-testid="appointment-finder">
      {props.patient && (
        <Text size="sm" c="dimmed">
          Scheduling for <ResourceName value={props.patient} />
        </Text>
      )}

      <Stepper
        active={stepIndex}
        onStepClick={(clicked) => goToStep(APPOINTMENT_FINDER_STEPS[Math.max(clicked, firstStepIndex)] ?? firstStep)}
        allowNextStepsSelect={false}
      >
        <Stepper.Step label="Location and service" description="Where and what">
          <div className={classes.pickColumns} style={{ marginTop: 'var(--mantine-spacing-md)' }}>
            {!props.location && <AppointmentLocationSelect location={chosenLocation} onChange={setChosenLocation} />}
            <div>
              <AppointmentServiceSelect service={service} location={pickedLocation} onChange={setService} />
              {!pickedLocation && inferredLocation && (
                <Text size="xs" c="dimmed" mt="xs">
                  Held at {getDisplayString(inferredLocation)}.
                </Text>
              )}
            </div>
          </div>
        </Stepper.Step>

        <Stepper.Step label="Choose a time" description="Who and when">
          <Stack mt="md">
            {loadingSchedules && <Loader />}
            {schedulesError && (
              <Alert color="red" title="Could not load schedules">
                {schedulesError.message}
              </Alert>
            )}
            {!loadingSchedules && !schedulesError && nothingAtSite && (
              <Alert color="yellow" title="Nothing at this site can provide this service">
                {excludedByClinic === 1 ? 'Its one schedule is' : `All ${excludedByClinic} of its schedules are`} held
                elsewhere{clinic?.name ? `, not at ${clinic.name}` : ''}. Try another site.
              </Alert>
            )}
            {!loadingSchedules && !schedulesError && !nothingAtSite && (
              <div className={classes.searchLayout}>
                <Stack className={classes.rail}>
                  {/* What is being booked, read back above the dates: by this
                      point the answers from the first step are off screen, and
                      the site in particular decides which actors are on offer. */}
                  {service && (
                    <Stack gap={2}>
                      <Group gap={6} wrap="nowrap">
                        <IconStethoscope size={16} stroke={1.8} />
                        <Text size="sm" fw={500}>
                          {getDisplayString(service)}
                        </Text>
                      </Group>
                      {clinic && (
                        <Group gap={6} wrap="nowrap">
                          <IconMapPin size={16} stroke={1.8} />
                          <Text size="sm" c="dimmed">
                            {getDisplayString(clinic)}
                          </Text>
                        </Group>
                      )}
                    </Stack>
                  )}
                  <AppointmentCriteriaForm
                    groups={groups}
                    value={criteria}
                    availableDates={availableDates}
                    availabilityCheckedThrough={monthAvailability.checkedThrough}
                    earliestDate={noticeFloor}
                    onChange={setCriteria}
                  />
                </Stack>
                <div className={classes.resultsColumn}>
                  {/* A role emptied out leaves nothing to search, so the pane
                      asks for it back rather than reporting that a search
                      nobody ran found nothing. */}
                  {actorPrompt ? (
                    <Text c="dimmed">{actorPrompt}</Text>
                  ) : (
                    <AppointmentSlotPicker
                      appointments={filtered}
                      timezone={timezone}
                      customTime={customTime}
                      customTimeDay={customTimeDay}
                      daysShown={daysShown ?? (rangeDays > 1 ? rangeDays : undefined)}
                      searchKey={searchKey}
                      loading={loadingTimes}
                      error={findError}
                      selected={selected}
                      onSelectAppointment={handleSelect}
                    />
                  )}
                </div>
              </div>
            )}
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Confirm and book" description="Check and book">
          <Stack mt="md">
            {selected ? (
              <AppointmentConfirmForm
                appointment={selected}
                value={draft}
                onChange={setDraft}
                patient={props.patient}
                service={service}
                location={clinic}
                timezone={timezone}
                available={selectedAvailable}
                disabled={booking}
                onCreatePatient={props.onCreatePatient}
                mrnSystem={props.mrnSystem}
                additionalFields={props.additionalFields}
              />
            ) : (
              <Text c="dimmed">Pick a time first.</Text>
            )}
          </Stack>
        </Stepper.Step>
      </Stepper>

      {bookError && (
        <Alert color="red" title="Could not book this appointment">
          {bookError}
        </Alert>
      )}

      <Group gap="sm" wrap="nowrap">
        {stepIndex > firstStepIndex && (
          <Button
            variant="default"
            disabled={booking}
            onClick={() => goToStep(APPOINTMENT_FINDER_STEPS[stepIndex - 1])}
          >
            Back
          </Button>
        )}
        {onCancel && (
          <Button variant="subtle" disabled={booking} onClick={onCancel}>
            Cancel
          </Button>
        )}
        {step === 'service' && (
          <Button style={{ flex: 1 }} disabled={!service} onClick={goToTimes}>
            Next
          </Button>
        )}
        {step === 'confirm' && (
          <>
            {bookingError && (
              <Text size="xs" c="dimmed">
                {bookingError}
              </Text>
            )}
            <Button style={{ flex: 1 }} loading={booking} disabled={!!bookingError} onClick={handleBook}>
              Confirm and book appointment
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}

/**
 * Asks for whoever the search still needs, for the pane the times go in.
 *
 * Roles open filled in, so this is the state a user makes by emptying one: there
 * is nothing to search rather than nothing to be found, and saying so where the
 * times were is what tells those two apart. Worded here rather than borrowed
 * from the form so that it reads as a sentence in the space a list of times
 * would have filled.
 *
 * @param groups - The roles the service is booked against.
 * @param selections - Chosen schedule ids per role.
 * @returns What to ask for, or undefined once the search has enough to run.
 */
function getActorPrompt(groups: readonly ScheduleCandidateGroup[], selections: ActorSelections): string | undefined {
  const unfilled = groups.filter((group) => getSelectedCandidates(group, selections).length === 0);
  // Every role optional and none of them chosen would search the service's whole
  // availability, so the first is asked for even where none is required.
  const asking =
    unfilled.find((group) => group.required) ?? (unfilled.length === groups.length ? groups[0] : undefined);
  return asking && `Choose a ${asking.label.toLowerCase()} to see the times on offer.`;
}

/**
 * Returns the first of the days given, ignoring the ones that are not there.
 *
 * The end of a search has two answers to reconcile: the last day the caller
 * asked about, and the end of the month being read. Whichever comes first is the
 * one that binds.
 *
 * @param dates - The candidate days, any of which may be absent.
 * @returns The earliest day given, or undefined when none was.
 */
function earliest(...dates: (Date | undefined)[]): Date | undefined {
  return dates.filter(isDefined).sort((left, right) => left.getTime() - right.getTime())[0];
}

function defaultCriteria(range: AppointmentFinderProps['defaultDateRange']): AppointmentSearchCriteria {
  return {
    actorSelections: {},
    start: range?.start,
    end: range?.end,
    // The calendar opens on the month the search does, so the days it marks are
    // the days the times on screen came from.
    month: startOfMonth(range?.start ?? new Date()),
    timeOfDay: 'any',
  };
}

/**
 * Chooses what each role starts out set to.
 *
 * Required roles open on their first candidate so a search can run immediately;
 * optional ones open empty, which searches without holding a room or a device.
 *
 * @param groups - The roles the service is booked against.
 * @returns The opening selections.
 */
function defaultSelections(groups: readonly ScheduleCandidateGroup[]): ActorSelections {
  return Object.fromEntries(
    groups.map((group) => [group.role, group.required && group.candidates[0] ? [group.candidates[0].schedule.id] : []])
  );
}

function getFirstSelected(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): ScheduleCandidate | undefined {
  for (const group of groups) {
    const candidate = getSelectedCandidates(group, selections)[0];
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Resolves the timezone the selected schedules are read in.
 *
 * All schedules in one search must share their alignment, so reading the first
 * selected one is enough.
 * @param groups - The roles offered by the criteria form.
 * @param selections - Chosen schedule ids per role.
 * @param service - The service being booked.
 * @returns The resolved IANA timezone identifier, if any is configured.
 */
function getTimezone(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections,
  service: WithId<HealthcareService> | undefined
): string | undefined {
  if (!service) {
    return undefined;
  }
  for (const group of groups) {
    const candidate = getSelectedCandidates(group, selections)[0] ?? group.candidates[0];
    if (candidate) {
      const timezone = getSchedulingTimezone(service, candidate.schedule, candidate.actorResource);
      if (timezone) {
        return timezone;
      }
    }
  }
  return undefined;
}
