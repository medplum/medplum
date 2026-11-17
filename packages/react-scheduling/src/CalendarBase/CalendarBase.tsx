// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CalendarRef,
  DayHeaderInfo,
  EventApi,
  EventClickInfo,
  EventDisplayInfo,
  EventInput,
  EventSourceInput,
} from '@fullcalendar/react';
import FullCalendar, { useCalendarController } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { ActionIcon, Button, Group, Loader, NativeSelect, Text, useComputedColorScheme } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { assertNever } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { getPatientParticipant } from '../actors';
import type { AvailabilityShade } from '../availabilityShading';
import { MonthPickerButton } from '../MonthPickerButton/MonthPickerButton';
import type { CalendarSelection, DateTimeRange } from '../types';
import { AppointmentPatientName } from './AppointmentPatientName';
import { AvailabilityShadeEvent } from './AvailabilityShadeEvent';
import classes from './CalendarBase.module.css';
import { availableTimeToBusinessHoursEntry, filterBookedSlots } from './CalendarBase.utils';
import { AvailabilityShadeHoverContext, useAvailabilityShadeHover } from './useAvailabilityShadeHover';

export interface FhirEventSource {
  schedule?: WithId<Schedule>;
  slots: Slot[];
  appointments: Appointment[];
  color?: string;
  className?: string;
  /** False draws the source's events as not clickable, whatever click handlers the calendar has. */
  interactive?: boolean;
  /** Names each of the source's appointments in place of its patient. */
  label?: string;
}

export type ExtendedEvent = (
  | {
      type: 'appointment';
      appointment: Appointment;
      schedule?: WithId<Schedule>;
      label?: string;
    }
  | {
      type: 'slot';
      slot: Slot;
      schedule?: WithId<Schedule>;
    }
  | {
      type: 'availability';
      shade: AvailabilityShade;
    }
) & {
  interactive?: boolean;
};

function appointmentsToEvents(
  appointments: Appointment[],
  schedule: WithId<Schedule> | undefined,
  extra?: Partial<EventInput>,
  details?: { interactive?: boolean; label?: string }
): EventInput[] {
  return appointments
    .filter((appointment) => appointment.start && appointment.end)
    .map((appointment) => {
      const actor = getPatientParticipant(appointment)?.actor;
      const name = actor?.reference ? (actor.display ?? '') : 'No Patient';

      return {
        id: appointment.id,
        title: details?.label ?? name,
        start: appointment.start,
        end: appointment.end,
        extendedProps: { type: 'appointment', appointment, schedule, ...details } satisfies ExtendedEvent,
        className: `appointment ${appointment.status}`,
        ...extra,
      };
    });
}

/**
 * Draws an appointment as FullCalendar would, but names its patient from the patient's record.
 * @param info - What FullCalendar hands its event content.
 * @returns The appointment's content, or `true` to keep FullCalendar's own for everything else.
 */
function renderEventContent(info: EventDisplayInfo): JSX.Element | true {
  const ext = info.event.extendedProps as ExtendedEvent;
  if (ext.type !== 'appointment') {
    return true;
  }
  return (
    <>
      {info.timeText && <div className={info.timeClass}>{info.timeText}</div>}
      <div className={info.titleClass}>{ext.label ?? <AppointmentPatientName appointment={ext.appointment} />}</div>
    </>
  );
}

/**
 * Draws a block of availability; every other background event is left to FullCalendar.
 * @param info - What FullCalendar hands a background event's content.
 * @returns The block, or `true` to keep FullCalendar's own content.
 */
function renderBackgroundEventContent(info: EventDisplayInfo): JSX.Element | true {
  const ext = info.event.extendedProps as ExtendedEvent;
  return ext.type === 'availability' ? <AvailabilityShadeEvent shade={ext.shade} /> : true;
}

function isTodaysWeekday(info: DayHeaderInfo): boolean {
  const now = new Date();
  return (
    !info.dayNumberText && info.dow === now.getDay() && now >= info.view.currentStart && now < info.view.currentEnd
  );
}

function renderDayHeaderContent(info: DayHeaderInfo): JSX.Element {
  return (
    <span className={cx(classes.dayHeaderText, isTodaysWeekday(info) && classes.todayWeekday)}>
      {info.textParts.map((part, i) => (
        <span key={i} className={part.type === 'day' ? classes.dayNumber : undefined}>
          {part.value}
        </span>
      ))}
    </span>
  );
}

const VIEWS = {
  timeGridWeekdays: {
    type: 'timeGridWeek',
    weekends: false,
  },
  // Fewer, wider days than a week, so overlapping events have room.
  timeGridFourDay: {
    type: 'timeGrid',
    duration: { days: 4 },
  },
};

const VIEW_OPTIONS = [
  { label: 'Month', value: 'dayGridMonth' },
  { label: 'Week', value: 'timeGridWeek' },
  { label: 'Weekdays', value: 'timeGridWeekdays' },
  { label: '4 Day', value: 'timeGridFourDay' },
  { label: 'Day', value: 'timeGridDay' },
] as const;

function slotTitle(slot: Slot): string {
  if (slot.status === 'free') {
    return 'Available';
  }
  if (slot.status === 'entered-in-error') {
    return 'Entered in error';
  }
  return 'Blocked';
}

function slotsToEvents(
  slots: Slot[],
  schedule: WithId<Schedule> | undefined,
  extra?: Partial<EventInput>,
  interactive?: boolean
): EventInput[] {
  return slots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    title: slotTitle(slot),
    extendedProps: { type: 'slot', slot, schedule, interactive } satisfies ExtendedEvent,
    className: `slot ${slot.status}`,
    ...extra,
  }));
}

export interface CalendarBaseProps extends Omit<
  React.ComponentProps<typeof FullCalendar>,
  // disallow specifying some FullCalendar props that we rely on
  | 'controller'
  | 'headerToolbar'
  | 'datesSet'
  | 'eventDidMount'
  | 'businessHours'
  | 'plugins'
  | 'eventClick'
  | 'loading'
  | 'ref'
  | 'views'
  | 'initialView'
> {
  onSelectAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onSelectSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onDoubleClickAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onDoubleClickSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onSelectInterval?: (interval: CalendarSelection) => void;
  selection?: DateTimeRange;
  /** The id of the event to mark `selected`, such as the appointment open in a details pane. */
  selectedId?: string;
  eventSources: FhirEventSource[];
  /** The view the calendar opens on, which has to be one the view dropdown offers. */
  initialView?: (typeof VIEW_OPTIONS)[number]['value'];

  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
  /**
   * Colored blocks drawn behind the events to say when visit types can be booked, as
   * `computeAvailabilityShading` works them out for the days on show. Not drawn in month view.
   */
  availabilityShading?: readonly AvailabilityShade[];
  /**
   * Prototype. Called as the pointer moves over the availability blocks with the instant under it, to the
   * pixel rather than to the grid's rows, and with undefined once it is off them or over an event.
   */
  onHoverAvailability?: (instant: Date | undefined) => void;
  loading?: boolean;
  /** Placed at the start of the toolbar, before the navigation buttons. */
  toolbarStart?: ReactNode;
  /** Placed at the end of the toolbar, after the view toggle. */
  toolbarEnd?: ReactNode;
}

/** Imperative handle on a calendar. */
export interface CalendarHandle {
  /**
   * Pages the calendar to the day holding `date`, such as that of an appointment just booked.
   * Stays put when that day is already on screen; switches the view from "Weekdays" to "Week"
   * if the date is on a weekend.
   */
  readonly gotoDate: (date: Date) => void;
  /** Pages the calendar on by one of whatever the view shows: a day, four days, a week or a month. */
  readonly next: () => void;
}

// Some common calendar features:
// - basic styling & calendar headers components
// - event double click handlers
// - availability overlay input in format of `HealthcareService.availableTime`
export const CalendarBase = forwardRef<CalendarHandle, CalendarBaseProps>(function CalendarBase(props, ref) {
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();
  const viewType = controller.view?.type;

  useImperativeHandle(
    ref,
    () => ({
      gotoDate: (date) => {
        // Views like 4 Day start at the date they're paged to, which would shift days already in view.
        const view = controller.view;
        if (view && date >= view.activeStart && date < view.activeEnd) {
          return;
        }
        // Weekdays has no column for a weekend day, so show the whole week instead.
        if (controller.view?.type === 'timeGridWeekdays' && (date.getDay() === 0 || date.getDay() === 6)) {
          controller.changeView('timeGridWeek');
        }
        controller.gotoDate(date);
      },
      next: () => controller.next(),
    }),
    [controller]
  );

  const {
    onRangeChange,
    className,
    availableTime,
    availabilityShading,
    onHoverAvailability,
    onSelectAppointment,
    onSelectSlot,
    onDoubleClickAppointment,
    onDoubleClickSlot,
    onSelectInterval,
    selection,
    selectedId,
    loading,
    toolbarStart,
    toolbarEnd,
    initialView = 'timeGridWeek',
    ...fullCalendarProps
  } = props;

  const eventSources = useMemo(() => {
    // Transparent, so the theme's own background fill stays out of the way of the block's color.
    const shadingSource: EventSourceInput = {
      color: 'transparent',
      display: viewType === 'dayGridMonth' ? 'none' : 'background',
      events: (availabilityShading ?? []).map((shade) => ({
        id: shade.id,
        start: shade.start,
        end: shade.end,
        extendedProps: { type: 'availability', shade } satisfies ExtendedEvent,
      })),
    };
    return [
      ...props.eventSources.map((fhirSource): EventSourceInput => {
        const { schedule, slots, appointments, interactive, label, ...source } = fhirSource;
        const filteredSlots = filterBookedSlots(slots, appointments);

        const appointmentExtra = {
          interactive: interactive ?? Boolean(props.onSelectAppointment || props.onDoubleClickAppointment),
        };

        const slotExtra = {
          interactive: interactive ?? Boolean(props.onSelectSlot || props.onDoubleClickSlot),
          display: viewType === 'dayGridMonth' ? 'none' : 'auto', // Hide slots in month view
        };

        return {
          ...source,
          events: [
            ...appointmentsToEvents(appointments, schedule, appointmentExtra, { interactive, label }),
            ...slotsToEvents(filteredSlots, schedule, slotExtra, interactive),
          ],
        };
      }),
      ...(availabilityShading?.length ? [shadingSource] : []),
    ];
  }, [
    props.eventSources,
    availabilityShading,
    props.onDoubleClickAppointment,
    props.onSelectAppointment,
    props.onSelectSlot,
    props.onDoubleClickSlot,
    viewType,
  ]);

  const rawEventClick = useCallback(
    (eventClickInfo: EventClickInfo) => {
      const ext = eventClickInfo.event.extendedProps as ExtendedEvent;
      // FullCalendar's `interactive` only takes an event out of the tab order; it still reports clicks.
      if (ext.interactive === false) {
        return;
      }
      if (ext.type === 'appointment') {
        onSelectAppointment?.(ext.appointment, ext.schedule);
      } else if (ext.type === 'slot') {
        onSelectSlot?.(ext.slot, ext.schedule);
      } else if (ext.type !== 'availability') {
        assertNever(ext);
      }
    },
    [onSelectAppointment, onSelectSlot]
  );

  const eventDoubleClickHandler = useCallback(
    (e: EventApi): boolean => {
      const ext = e.extendedProps as ExtendedEvent;
      if (ext?.type === 'appointment') {
        onDoubleClickAppointment?.(ext.appointment, ext.schedule);
        return true;
      } else if (ext.type === 'slot') {
        onDoubleClickSlot?.(ext.slot, ext.schedule);
      } else if (ext.type !== 'availability') {
        assertNever(ext);
      }
      return false;
    },
    [onDoubleClickAppointment, onDoubleClickSlot]
  );

  // Add slight delay to click handler to permit double-clicks to register (but only when
  // there is a double click handler).
  const hasDoubleClickHandler = Boolean(onDoubleClickAppointment || onDoubleClickSlot);
  const eventClickDebounced = useDebouncedCallback(rawEventClick ?? (() => {}), 100);
  const eventClick = hasDoubleClickHandler ? eventClickDebounced : rawEventClick;

  // FullCalendar creates new elements on each render rather than recycling them,
  // so dblclick listeners are cleaned up automatically when the old element is GC'd
  // — no eventWillUnmount teardown needed. The WeakMap and callback Ref let the
  // single stable listener read the latest event data and prop without being
  // re-registered on every render.
  const eventDataRef = useRef(new WeakMap<Element, EventApi>());
  const eventDoubleClickRef = useRef(eventDoubleClickHandler);
  useEffect(() => {
    eventDoubleClickRef.current = eventDoubleClickHandler;
  }, [eventDoubleClickHandler]);

  const handleDblClick = useCallback(
    (e: Event) => {
      const event = eventDataRef.current.get(e.currentTarget as Element);
      if (event) {
        // The first click started a timer for `handleSelectEvent`; cancel that pending
        // event since we are emitting the double-click instead.
        eventClickDebounced.cancel();
        eventDoubleClickRef.current?.(event);
      }
    },
    [eventClickDebounced]
  );

  const businessHours = availableTime?.flatMap(availableTimeToBusinessHoursEntry);

  const selectable = Boolean(onSelectInterval || selection);

  // FullCalendar owns the highlight and only a pointer gesture ever sets it, so the
  // prop has to be pushed in. Keyed on the instants rather than the object: a host
  // reporting the interval back hands over a fresh pair of `Date`s each time, and
  // clearing is its own case only because `unselectAuto` is false.
  const calendarRef = useRef<CalendarRef>(null);
  const startMs = selection?.start.getTime();
  const endMs = selection?.end.getTime();
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }
    if (startMs !== undefined && endMs !== undefined) {
      api.select(startMs, endMs);
    } else {
      api.unselect();
    }
  }, [startMs, endMs]);

  const shadeHover = useAvailabilityShadeHover(Boolean(availabilityShading?.length), onHoverAvailability);

  return (
    <div data-testid="calendar" className={cx(classes.wrapper, className)} {...shadeHover.hoverProps}>
      <Group justify="space-between" pb="sm">
        <Group gap="md">
          {toolbarStart}
          <Button variant="default" size="sm" h={32} fw={400} onClick={() => controller.today()}>
            Today
          </Button>
          <Group gap="xs">
            <ActionIcon
              variant="default"
              size={32}
              radius="xl"
              c="dimmed"
              aria-label="Previous"
              onClick={() => controller.prev()}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
            <ActionIcon
              variant="default"
              size={32}
              radius="xl"
              c="dimmed"
              aria-label="Next"
              onClick={() => controller.next()}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Group>
          <Group>
            <MonthPickerButton
              size="compact-md"
              label={
                <Text component="span" fz="h4" fw={700} lh="h4">
                  {controller.view?.title}
                </Text>
              }
              date={controller.getDate() ?? new Date()}
              onChange={(month) => {
                // Weekdays has no column for a weekend 1st, and a Saturday's week falls in the month
                // before, so go to the month's first weekday.
                if (viewType === 'timeGridWeekdays' && (month.getDay() === 0 || month.getDay() === 6)) {
                  controller.gotoDate(new Date(month.getFullYear(), month.getMonth(), month.getDay() === 6 ? 3 : 2));
                } else {
                  controller.gotoDate(month);
                }
              }}
            />
            {loading && <Loader size="sm" />}
          </Group>
        </Group>
        <Group gap="sm">
          <NativeSelect
            aria-label="View"
            // Match the toolbar's 32px buttons. Mantine sets `--input-height` from the size itself.
            styles={{ wrapper: { '--input-height-sm': '32px' } }}
            value={viewType ?? initialView}
            onChange={(e) => controller.changeView(e.currentTarget.value)}
            data={VIEW_OPTIONS}
          />
          {toolbarEnd}
        </Group>
      </Group>
      <AvailabilityShadeHoverContext.Provider value={shadeHover.hoveredId}>
        <FullCalendar
          height="100%"
          plugins={[timeGridPlugin, dayGridPlugin, themePlugin, interactionPlugin]}
          initialView={initialView}
          slotMinHeight={38}
          eventShortHeight={33}
          colorScheme={colorScheme}
          displayEventEnd={false}
          eventTimeFormat={{ timeStyle: 'short' }}
          allDaySlot={false}
          views={VIEWS}
          selectable={selectable}
          unselectAuto={false} // keep selected even if user clicks elsewhere, like booking form
          select={(eventInfo) => {
            // `api.select` above comes back through here with a null `jsEvent`; only a
            // pointer gesture is news to the host.
            if (!eventInfo.jsEvent) {
              return;
            }
            onSelectInterval?.({ start: eventInfo.start, end: eventInfo.end, allDay: eventInfo.allDay });
            // A host holding no selection would otherwise leave the gesture's highlight up for good, as
            // `unselectAuto` is off. One that answers with a selection has it pushed back in above.
            if (!selection) {
              calendarRef.current?.getApi().unselect();
            }
          }}
          eventContent={renderEventContent}
          backgroundEventContent={renderBackgroundEventContent}
          dayHeaderContent={renderDayHeaderContent}
          dayCellTopInnerClass={classes.dayCellTopInner}
          slotHeaderInnerClass={classes.slotHeaderInner}
          nowIndicatorLineClass={classes.nowIndicatorLine}
          nowIndicatorDotClass={classes.nowIndicatorDot}
          nowIndicatorHeaderClass={classes.nowIndicatorHeader}
          {...fullCalendarProps}
          ref={calendarRef}
          eventSources={eventSources}
          controller={controller}
          headerToolbar={false}
          datesSet={(info) => onRangeChange?.({ start: info.start, end: info.end })}
          className={cx(classes.calendar, controller.view?.type)}
          eventDidMount={(info) => {
            if (hasDoubleClickHandler && (info.event.extendedProps as ExtendedEvent).interactive !== false) {
              eventDataRef.current.set(info.el, info.event);
              info.el.addEventListener('dblclick', handleDblClick);
            }
          }}
          businessHours={businessHours}
          eventClick={eventClick}
          eventClass={(evt) =>
            cx(props.eventClass, classes.event, {
              [classes.clickable]: evt.isInteractive,
              [classes.shortEvent]: evt.isShort,
              // Judged when the event is drawn, so one that ends while on show stays unmarked until redrawn.
              past: !!evt.event.end && evt.event.end.getTime() <= Date.now(),
              selected: evt.event.id === selectedId,
            })
          }
          eventTimeClass={cx(props.eventTimeClass, classes.eventTime)}
          eventTitleClass={cx(props.eventTitleClass, classes.eventTitle)}
          eventInnerClass={cx(props.eventInnerClass, classes.eventInner)}
          backgroundEventClass={cx(props.backgroundEventClass, classes.backgroundEvent)}
          backgroundEventInnerClass={cx(props.backgroundEventInnerClass, classes.backgroundEventInner)}
          listItemEventBeforeClass={cx(props.listItemEventBeforeClass, classes.listItemEventBefore)}
          nonBusinessHoursClass={cx(props.nonBusinessHoursClass, classes.nonBusinessHours)}
          dayLaneClass={cx(props.dayLaneClass, selectable && classes.clickable)}
          dayCellClass={cx(props.dayCellClass, selectable && classes.clickable)}
          highlightClass={cx(props.highlightClass, classes.selectedRange)}
        />
      </AvailabilityShadeHoverContext.Provider>
    </div>
  );
});
