// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, CloseButton, Group, Title, useMantineTheme } from '@mantine/core';
import {
  getExtensionValue,
  getReferenceString,
  isDefined,
  normalizeErrorString,
  SchedulingScheduleColorURI,
} from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
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
import type { CalendarsPanelItem } from './CalendarsPanel/CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel/CalendarsPanel';
import classes from './SchedulingWorkspace.module.css';

type CandidatesByActorType = Readonly<Record<BookableActorType, ScheduleCandidate[]>>;
type DeselectedIdsByActorType = Readonly<Record<BookableActorType, ReadonlySet<string>>>;

const NO_CANDIDATES: CandidatesByActorType = { Practitioner: [], Location: [], Device: [] };

const NONE_DESELECTED: DeselectedIdsByActorType = {
  Practitioner: new Set(),
  Location: new Set(),
  Device: new Set(),
};

export interface SchedulingWorkspaceProps {
  readonly className?: string;
  readonly onBooked?: (booking: AppointmentBooking) => void | Promise<void>;
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
 * - Highlights the time last chosen, wherever it was chosen: the click that opened the
 *   pane, then whatever the form's time search settles on, and nothing while the form
 *   holds no time. The calendar is never moved to reach it — a highlight off the week
 *   on screen is kept, and is drawn again on paging back to it.
 *
 * @param props - Component props
 * @returns A React Node with the coordinated Calendars panel + calendar UI in it
 */
export function SchedulingWorkspace(props: SchedulingWorkspaceProps): JSX.Element {
  const { onBooked } = props;
  const medplum = useMedplum();
  const theme = useMantineTheme();

  const [schedulesLoadingError, setSchedulesLoadingError] = useState<unknown>();

  const [candidatesByActorType, setCandidatesByActorType] = useState<CandidatesByActorType>(NO_CANDIDATES);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [deselectedIds, setDeselectedIds] = useState<DeselectedIdsByActorType>(NONE_DESELECTED);

  const [range, setRange] = useState<DateTimeRange>();

  // What was clicked
  const [bookingSelection, setBookingSelection] = useState<DateTimeRange>();
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
        const candidates = await searchScheduleCandidates(medplum, undefined, {
          actorType,
          query: '',
          signal: controller.signal,
          count: 100,
        });
        return [actorType, candidates] as const;
      })
    )
      .then((results) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(undefined);
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
  }, [medplum]);

  // Every candidate across all the bookable types gets its own stable color, shared between
  // its CalendarsPanel row and its MultiCalendar source so the two always match.
  const colorByScheduleId = useMemo(() => {
    const all = BOOKABLE_ACTOR_TYPES.flatMap((actorType) => candidatesByActorType[actorType]);
    const map = new Map<string, keyof typeof theme.colors>();
    all.forEach((candidate, i) => {
      const extensionColor = getExtensionValue(candidate.schedule, SchedulingScheduleColorURI) as string | undefined;
      map.set(candidate.schedule.id, resolveThemeColor(theme, extensionColor, i));
    });
    return map;
  }, [candidatesByActorType, theme]);

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

  const startBooking = useCallback((interval: DateTimeRange): void => {
    setBookingSelection(interval);
    setHighlight(interval);
  }, []);

  const closeBooking = useCallback((): void => {
    setBookingSelection(undefined);
    setHighlight(undefined);
    setTimeFinderOpen(false);
  }, []);

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

  return (
    <div className={`${classes.root} ${props.className ?? ''}`}>
      <div className={classes.sidebar}>
        <CalendarsPanel items={panelItems} candidatesLoading={candidatesLoading} onToggle={toggleCandidate} />
      </div>
      <div className={classes.calendar}>
        {displayError !== undefined && (
          <Alert color="red" mb="xs">
            {normalizeErrorString(displayError)}
          </Alert>
        )}
        <MultiCalendar
          sources={sources}
          onRangeChange={setRange}
          loading={resourcesLoading}
          onSelectInterval={startBooking}
          selection={highlight}
        />
      </div>
      {bookingSelection && (
        <div className={cx(classes.bookingPane, { [classes.bookingPaneWide]: timeFinderOpen })}>
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>Book appointment</Title>
            <CloseButton aria-label="Close booking form" onClick={closeBooking} />
          </Group>
          <AppointmentBookingForm
            key={bookingSelection.start.toDateString()}
            defaultStart={bookingSelection.start}
            onToggleTimeFinder={setTimeFinderOpen}
            onChangeTime={setHighlight}
            onBooked={finishBooking}
          />
        </div>
      )}
    </div>
  );
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
