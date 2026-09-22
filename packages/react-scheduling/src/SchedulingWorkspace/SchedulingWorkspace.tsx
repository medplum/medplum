// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, CloseButton, Group, Title, useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  getExtensionValue,
  getReferenceString,
  isDefined,
  normalizeErrorString,
  SchedulingScheduleColorURI,
} from '@medplum/core';
import type { Appointment, Extension, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookableActorType } from '../actors';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { AppointmentBookingForm } from '../AppointmentFinder/AppointmentBookingForm';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { getCandidateDisplay, searchScheduleCandidates } from '../AppointmentFinder/AppointmentFinder.schedules';
import { resolveThemeColor } from '../colors';
import { useSchedulingResources } from '../hooks/useSchedulingResources';
import type { MultiCalendarSource } from '../MultiCalendar/MultiCalendar';
import { MultiCalendar } from '../MultiCalendar/MultiCalendar';
import type { DateTimeRange } from '../types';
import { AppointmentDetails } from './AppointmentDetails/AppointmentDetails';
import type { CalendarFilterValues } from './CalendarFilters';
import { CalendarFilters } from './CalendarFilters';
import type { CalendarsPanelItem } from './CalendarsPanel/CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel/CalendarsPanel';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';
import classes from './SchedulingWorkspace.module.css';
import { getCalendarTimezones } from './SchedulingWorkspace.utils';

type CandidatesByActorType = Readonly<Record<BookableActorType, ScheduleCandidate[]>>;
type DeselectedIdsByActorType = Readonly<Record<BookableActorType, ReadonlySet<string>>>;

const NO_CANDIDATES: CandidatesByActorType = { Practitioner: [], Location: [], Device: [] };

const EMPTY_COLOR_INDEXES: ReadonlyMap<string, number> = new Map();

const NO_FILTERS: CalendarFilterValues = {};

const NONE_DESELECTED: DeselectedIdsByActorType = {
  Practitioner: new Set(),
  Location: new Set(),
  Device: new Set(),
};

export interface SchedulingWorkspaceProps {
  readonly className?: string;
  /** The ValueSet the procedure code field binds to. Defaults to full CPT valueset. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to full ICD-10-CM valueset. */
  readonly diagnosisBinding?: string;
  readonly onBooked?: (booking: AppointmentBooking) => void | Promise<void>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /**
   * Overrides the value set the appointment detail view offers cancellation reasons
   * from, for a host coding them against its own terminology.
   */
  readonly appointmentCancellationReasonValueSet?: string;
  /**
   * Lets the booking form take a typed time and length, placing a visit the scheduling
   * rules would refuse: over occupied or blocked time, past the configured capacity,
   * or at a time or length the visit type does not offer.
   *
   * Passing it draws the fields; it enforces nothing. Which users get it is the host
   * application's responsibility.
   *
   * Such a booking is sent as a transaction, so the appointment and its Slots commit
   * together on projects with the `transaction-bundles` feature enabled. Without it they
   * are applied as a plain batch, where an appointment that failed to write would leave
   * Slots holding no visit.
   * @see https://www.medplum.com/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions
   */
  readonly canBypassSchedulingRules?: boolean;
  /**
   * Extensions to put on every appointment booked from this workspace. See
   * {@link AppointmentProposalFormProps.appointmentExtensions}.
   */
  readonly appointmentExtensions?: readonly Extension[];
}

/**
 * A data-coordination component pairing {@link CalendarsPanel} with {@link MultiCalendar}.
 *
 * - Picks a color for each Schedule so that it can render consistently across
 *   those components.
 * - Books from the calendar: clicking open time opens {@link AppointmentBookingForm}
 *   in a pane on the right, with its time search opened on the day that was clicked.
 *   The form writes the booking and announces what it wrote, which is what puts the
 *   new appointment on the calendar beside it — a host supplies no data for any of it.
 *   What was written is reported through `onBooked`, for a host that wants to say so.
 * - Shows what is booked: clicking an appointment opens {@link AppointmentDetails} in the
 *   same pane the booking form uses, describing the visit and offering to cancel it.
 *   Cancelling is what takes the time back off the calendar, again without a host
 *   supplying anything. The pane holds one or the other, never both: opening either
 *   closes whatever was open beside the calendar.
 * - Highlights the time last chosen, wherever it was chosen: the click that opened the
 *   pane, then whatever the form's time search settles on, and nothing while the form
 *   holds no time. The calendar is never moved to reach it — a highlight off the week
 *   on screen is kept, and is drawn again on paging back to it.
 *
 * @param props - Component props
 * @returns A React Node with the coordinated Calendars panel + calendar UI in it
 */
export function SchedulingWorkspace(props: SchedulingWorkspaceProps): JSX.Element {
  const {
    procedureBinding,
    diagnosisBinding,
    onBooked,
    appointmentCancellationReasonValueSet,
    canBypassSchedulingRules,
    appointmentExtensions,
  } = props;
  const medplum = useMedplum();
  const theme = useMantineTheme();

  const [schedulesLoadingError, setSchedulesLoadingError] = useState<unknown>();

  const [candidatesByActorType, setCandidatesByActorType] = useState<CandidatesByActorType>(NO_CANDIDATES);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [colorIndexes, setColorIndexes] = useState<ReadonlyMap<string, number>>(EMPTY_COLOR_INDEXES);

  const [deselectedIds, setDeselectedIds] = useState<DeselectedIdsByActorType>(NONE_DESELECTED);

  // Owned by `CalendarFilters`, which reports both whenever either changes. Held here
  // because the candidate search below is keyed on them.
  const [filters, setFilters] = useState<CalendarFilterValues>(NO_FILTERS);
  const { service: selectedService, location: selectedLocation } = filters;

  const [range, setRange] = useState<DateTimeRange>();

  // What was selected
  const [bookingSelection, setBookingSelection] = useState<DateTimeRange>();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>();

  // What the calendar highlights
  const [highlight, setHighlight] = useState<DateTimeRange>();
  const [timeFinderOpen, setTimeFinderOpen] = useState(false);

  // Finds all bookable Schedules, with one search per bookable actor type.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setCandidatesLoading(true);
    Promise.all(
      BOOKABLE_ACTOR_TYPES.map(async (actorType) => {
        // We search for a large number of schedule candidates here because we
        // do client-side filtering based on locations in the list. Follow up:
        // https://github.com/medplum/medplum/issues/10618
        const candidates = await searchScheduleCandidates(medplum, selectedService, {
          actorType,
          query: '',
          location: selectedLocation,
          signal: controller.signal,
          count: 250,
        });
        return [actorType, candidates] as const;
      })
    )
      .then((results) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(undefined);
          setColorIndexes((previous) => numberNewCandidates(previous, results));
          setCandidatesByActorType(Object.fromEntries(results) as CandidatesByActorType);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCandidatesLoading(false);
        }
      });
    return () => controller.abort();
  }, [medplum, selectedService, selectedLocation]);

  // Every candidate across all the bookable types gets its own color, shared between its
  // CalendarsPanel row and its MultiCalendar source so the two always match. The fallback
  // palette is picked by the number the calendar was given when it was first offered, so a
  // filter narrowing the list leaves the colors of the calendars it keeps alone.
  const colorByScheduleId = useMemo(() => {
    const all = BOOKABLE_ACTOR_TYPES.flatMap((actorType) => candidatesByActorType[actorType]);
    const map = new Map<string, keyof typeof theme.colors>();
    for (const candidate of all) {
      const extensionColor = getExtensionValue(candidate.schedule, SchedulingScheduleColorURI) as string | undefined;
      map.set(
        candidate.schedule.id,
        resolveThemeColor(theme, extensionColor, colorIndexes.get(candidate.schedule.id) ?? 0)
      );
    }
    return map;
  }, [candidatesByActorType, colorIndexes, theme]);

  const activeCandidates = useMemo(() => {
    return BOOKABLE_ACTOR_TYPES.flatMap((actorType) =>
      candidatesByActorType[actorType].filter((c) => !deselectedIds[actorType].has(c.schedule.id))
    );
  }, [candidatesByActorType, deselectedIds]);

  const schedules = useMemo(() => activeCandidates.map((c) => c.schedule), [activeCandidates]);
  const {
    slots,
    appointments,
    loading: resourcesLoading,
    error: resourcesError,
  } = useSchedulingResources(schedules, range);

  const sources = useMemo((): MultiCalendarSource[] => {
    return activeCandidates.map((candidate) => {
      const scheduleReference = getReferenceString(candidate.schedule);
      const actorReferences = new Set(candidate.schedule.actor.map((actor) => actor.reference).filter(isDefined));
      return {
        schedule: candidate.schedule,
        color: colorByScheduleId.get(candidate.schedule.id),
        slots: (slots ?? []).filter((slot: Slot) => slot.schedule?.reference === scheduleReference),
        appointments: (appointments ?? []).filter((appointment: Appointment) =>
          (appointment.participant ?? []).some(
            (participant) => participant.actor?.reference && actorReferences.has(participant.actor.reference)
          )
        ),
      };
    });
  }, [activeCandidates, slots, appointments, colorByScheduleId]);

  const { timezones, anyUnknown } = useMemo(() => getCalendarTimezones(activeCandidates), [activeCandidates]);

  const startBooking = useCallback((interval: DateTimeRange): void => {
    setSelectedAppointmentId(undefined);
    setBookingSelection(interval);
    setHighlight(interval);
  }, []);

  const closeBooking = useCallback((): void => {
    setBookingSelection(undefined);
    setHighlight(undefined);
    setTimeFinderOpen(false);
  }, []);

  // Hides are kept across a service change rather than pruned: a calendar hidden under
  // one service type stays hidden if another offers it again.
  const toggleCandidate = useCallback((actorType: BookableActorType, id: string): void => {
    setDeselectedIds((prev) => ({ ...prev, [actorType]: toggleId(prev[actorType], id) }));
  }, []);

  const finishBooking = useCallback(
    (booking: AppointmentBooking): void | Promise<void> => {
      closeBooking();
      return onBooked?.(booking);
    },
    [closeBooking, onBooked]
  );

  const selectAppointment = useCallback(
    (appointment: Appointment): void => {
      if (appointment.id) {
        closeBooking();
        setSelectedAppointmentId(appointment.id);
      }
    },
    [closeBooking]
  );

  const closeAppointment = useCallback((): void => setSelectedAppointmentId(undefined), []);

  const openAppointment = useMemo((): WithId<Appointment> | undefined => {
    if (selectedAppointmentId) {
      return (appointments ?? []).find((a) => a.id === selectedAppointmentId);
    }
    return undefined;
  }, [appointments, selectedAppointmentId]);

  const toItem = (candidate: ScheduleCandidate, selected: boolean): CalendarsPanelItem => {
    const color = colorByScheduleId.get(candidate.schedule.id);
    if (!color) {
      throw new Error('Got candidate without resolved color');
    }
    return {
      id: candidate.schedule.id,
      label: getCandidateDisplay(candidate),
      color,
      selected,
    };
  };

  const panelItems = Object.fromEntries(
    BOOKABLE_ACTOR_TYPES.map((actorType) => [
      actorType,
      candidatesByActorType[actorType].map((c) => toItem(c, !deselectedIds[actorType].has(c.schedule.id))),
    ])
  ) as Record<BookableActorType, CalendarsPanelItem[]>;

  const displayError = resourcesError ?? schedulesLoadingError;

  // The pane beside the calendar shows one thing at a time. Opening either side already
  // closes the other, so this only decides which wins if they ever both hold something.
  const showBooking = bookingSelection !== undefined && openAppointment === undefined;

  return (
    <div className={`${classes.root} ${props.className ?? ''}`}>
      <div className={classes.sidebar}>
        <CalendarsPanel
          items={panelItems}
          candidatesLoading={candidatesLoading}
          onToggle={toggleCandidate}
          filters={<CalendarFilters onChange={setFilters} />}
        />
      </div>
      <div className={classes.calendar}>
        {displayError !== undefined && (
          <Alert color="red" mb="xs">
            {normalizeErrorString(displayError)}
          </Alert>
        )}
        <MultiCalendar
          className={classes.multiCalendar}
          sources={sources}
          onRangeChange={setRange}
          loading={resourcesLoading}
          onSelectInterval={startBooking}
          onSelectAppointment={selectAppointment}
          selection={highlight}
        />
        <CalendarTimezoneNotice className={classes.timezoneNotice} timezones={timezones} anyUnknown={anyUnknown} />
      </div>
      {openAppointment && (
        <section key={openAppointment.id} className={classes.pane} aria-label="Appointment details">
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>Appointment details</Title>
            <CloseButton aria-label="Close appointment details" onClick={closeAppointment} />
          </Group>
          <AppointmentDetails
            appointment={openAppointment}
            cancellationReasonValueSet={appointmentCancellationReasonValueSet}
            onCancelled={props.onCancelled}
          />
        </section>
      )}
      {showBooking && (
        <section className={cx(classes.pane, { [classes.paneWide]: timeFinderOpen })} aria-label="Book appointment">
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>Book appointment</Title>
            <CloseButton aria-label="Close booking form" onClick={closeBooking} />
          </Group>
          <AppointmentBookingForm
            key={bookingSelection.start.toDateString()}
            defaultStart={bookingSelection.start}
            procedureBinding={procedureBinding}
            diagnosisBinding={diagnosisBinding}
            canBypassSchedulingRules={canBypassSchedulingRules}
            appointmentExtensions={appointmentExtensions}
            onToggleTimeFinder={setTimeFinderOpen}
            onChangeTime={setHighlight}
            onBooked={finishBooking}
            defaultLocation={selectedLocation}
            defaultService={selectedService}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Gives every calendar not yet numbered the next number, keeping the number the rest hold.
 *
 * The number picks a calendar's fallback color, so it has to outlive the list a filter
 * narrows: numbering by position in that list would repaint every calendar surviving the
 * filter. Numbers run in the order calendars were first offered, which holds for as long
 * as the workspace is open.
 *
 * @param previous - The numbers already given out.
 * @param results - The candidates that just arrived, by actor type.
 * @returns The numbers, extended for whatever is new, or `previous` when nothing is.
 */
function numberNewCandidates(
  previous: ReadonlyMap<string, number>,
  results: readonly (readonly [BookableActorType, ScheduleCandidate[]])[]
): ReadonlyMap<string, number> {
  let next: Map<string, number> | undefined;
  for (const [, candidates] of results) {
    for (const candidate of candidates) {
      if (!previous.has(candidate.schedule.id)) {
        next ??= new Map(previous);
        next.set(candidate.schedule.id, next.size);
      }
    }
  }
  return next ?? previous;
}

function toggleId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
