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
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { AppointmentBookingForm } from '../AppointmentFinder/AppointmentBookingForm';
import type { SchedulingRole } from '../AppointmentFinder/AppointmentFinder.roles';
import { SCHEDULING_ROLES } from '../AppointmentFinder/AppointmentFinder.roles';
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

const EMPTY_CANDIDATES: Readonly<Record<SchedulingRole, ScheduleCandidate[]>> = { provider: [], room: [], device: [] };

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

  const [candidatesByRole, setCandidatesByRole] =
    useState<Readonly<Record<SchedulingRole, ScheduleCandidate[]>>>(EMPTY_CANDIDATES);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [deselectedProviderIds, setDeselectedProviderIds] = useState<ReadonlySet<string>>(new Set());
  const [deselectedDeviceIds, setDeselectedDeviceIds] = useState<ReadonlySet<string>>(new Set());
  const [deselectedRoomIds, setDeselectedRoomIds] = useState<ReadonlySet<string>>(new Set());

  const [range, setRange] = useState<DateTimeRange>();

  // What was clicked
  const [bookingSelection, setBookingSelection] = useState<DateTimeRange>();
  // What the calendar highlights
  const [highlight, setHighlight] = useState<DateTimeRange>();
  const [timeFinderOpen, setTimeFinderOpen] = useState(false);

  // Finds all bookable Schedules, with one search per schedulable role.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setCandidatesLoading(true);
    Promise.all(
      SCHEDULING_ROLES.map((role) =>
        searchScheduleCandidates(medplum, undefined, {
          role,
          query: '',
          signal: controller.signal,
          count: 100,
        })
      )
    )
      .then(([provider, room, device]) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(undefined);
          setCandidatesByRole({ provider, room, device });
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

  // Every candidate across all three roles gets its own stable color, shared between
  // its CalendarsPanel row and its MultiCalendar source so the two always match.
  const colorByScheduleId = useMemo(() => {
    const all = [...candidatesByRole.provider, ...candidatesByRole.room, ...candidatesByRole.device];
    const map = new Map<string, keyof typeof theme.colors>();
    all.forEach((candidate, i) => {
      const extensionColor = getExtensionValue(candidate.schedule, SchedulingScheduleColorURI) as string | undefined;
      map.set(candidate.schedule.id, resolveThemeColor(theme, extensionColor, i));
    });
    return map;
  }, [candidatesByRole, theme]);

  const activeCandidates = useMemo(() => {
    return [
      ...candidatesByRole.provider.filter((c) => !deselectedProviderIds.has(c.schedule.id)),
      ...candidatesByRole.room.filter((c) => !deselectedRoomIds.has(c.schedule.id)),
      ...candidatesByRole.device.filter((c) => !deselectedDeviceIds.has(c.schedule.id)),
    ];
  }, [candidatesByRole, deselectedProviderIds, deselectedRoomIds, deselectedDeviceIds]);

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

  const displayError = resourcesError ?? schedulesLoadingError;

  return (
    <div className={`${classes.root} ${props.className ?? ''}`}>
      <div className={classes.sidebar}>
        <CalendarsPanel
          providers={candidatesByRole.provider.map((c) => toItem(c, !deselectedProviderIds.has(c.schedule.id)))}
          devices={candidatesByRole.device.map((c) => toItem(c, !deselectedDeviceIds.has(c.schedule.id)))}
          rooms={candidatesByRole.room.map((c) => toItem(c, !deselectedRoomIds.has(c.schedule.id)))}
          candidatesLoading={candidatesLoading}
          onToggleProvider={(id) => setDeselectedProviderIds((prev) => toggleId(prev, id))}
          onToggleDevice={(id) => setDeselectedDeviceIds((prev) => toggleId(prev, id))}
          onToggleRoom={(id) => setDeselectedRoomIds((prev) => toggleId(prev, id))}
        />
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
