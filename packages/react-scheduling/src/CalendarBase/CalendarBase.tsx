// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CalendarRef, EventApi, EventClickInfo, EventInput, EventSourceInput } from '@fullcalendar/react';
import FullCalendar, { useCalendarController } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { Button, Group, Loader, SegmentedControl, Title, useComputedColorScheme } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { assertNever } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DateTimeRange } from '../types';
import classes from './CalendarBase.module.css';
import { availableTimeToBusinessHoursEntry, filterBookedSlots } from './CalendarBase.utils';

export interface FhirEventSource {
  schedule?: WithId<Schedule>;
  slots: Slot[];
  appointments: Appointment[];
  color?: string;
}

export type ExtendedEvent =
  | {
      type: 'appointment';
      appointment: Appointment;
      schedule?: WithId<Schedule>;
    }
  | {
      type: 'slot';
      slot: Slot;
      schedule?: WithId<Schedule>;
    };

function appointmentsToEvents(
  appointments: Appointment[],
  schedule: WithId<Schedule> | undefined,
  extra?: Partial<EventInput>
): EventInput[] {
  return appointments
    .filter((appointment) => appointment.start && appointment.end)
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const name = patientParticipant?.actor?.display ?? 'No Patient';

      return {
        id: appointment.id,
        title: name,
        start: appointment.start,
        end: appointment.end,
        extendedProps: { type: 'appointment', appointment, schedule } satisfies ExtendedEvent,
        className: `appointment ${appointment.status}`,
        ...extra,
      };
    });
}

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
  extra?: Partial<EventInput>
): EventInput[] {
  return slots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    title: slotTitle(slot),
    extendedProps: { type: 'slot', slot, schedule } satisfies ExtendedEvent,
    className: `slot ${slot.status}`,
    ...extra,
  }));
}

export interface CalendarBaseProps extends Omit<
  React.ComponentProps<typeof FullCalendar>,
  // disallow specifying some FullCalendar props that we rely on
  'controller' | 'headerToolbar' | 'datesSet' | 'eventDidMount' | 'businessHours' | 'plugins' | 'eventClick' | 'loading'
> {
  onSelectAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onSelectSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onDoubleClickAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onDoubleClickSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onSelectInterval?: (interval: DateTimeRange) => void;
  selection?: DateTimeRange;
  eventSources: FhirEventSource[];

  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
  loading?: boolean;
}

// Some common calendar features:
// - basic styling & calendar headers components
// - event double click handlers
// - availability overlay input in format of `HealthcareService.availableTime`
export function CalendarBase(props: CalendarBaseProps): JSX.Element {
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();

  const {
    onRangeChange,
    className,
    availableTime,
    onSelectAppointment,
    onSelectSlot,
    onDoubleClickAppointment,
    onDoubleClickSlot,
    onSelectInterval,
    selection,
    loading,
    ...fullCalendarProps
  } = props;

  const eventSources = useMemo(
    () =>
      props.eventSources.map((fhirSource): EventSourceInput => {
        const { schedule, slots, appointments, ...source } = fhirSource;
        const filteredSlots = filterBookedSlots(slots, appointments);

        const appointmentExtra = {
          interactive: Boolean(props.onSelectAppointment || props.onDoubleClickAppointment),
        };

        const slotExtra = {
          interactive: false,
          display: 'background',
        };

        return {
          ...source,
          events: [
            ...appointmentsToEvents(appointments, schedule, appointmentExtra),
            ...slotsToEvents(filteredSlots, schedule, slotExtra),
          ],
        };
      }),
    [props.eventSources, props.onDoubleClickAppointment, props.onSelectAppointment]
  );

  const rawEventClick = useCallback(
    (eventClickInfo: EventClickInfo) => {
      const ext = eventClickInfo.event.extendedProps as ExtendedEvent;
      if (ext.type === 'appointment') {
        onSelectAppointment?.(ext.appointment, ext.schedule);
      } else if (ext.type === 'slot') {
        onSelectSlot?.(ext.slot, ext.schedule);
      } else {
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
      } else {
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

  const selectable = Boolean(onSelectInterval);

  // Necessary because `unselectAuto` is false
  const calendarRef = useRef<CalendarRef>(null);
  useEffect(() => {
    if (selectable && !selection) {
      calendarRef.current?.getApi().unselect();
    }
  }, [selectable, selection]);


  return (
    <div data-testid="calendar" className={cx(classes.wrapper, className)}>
      <Group justify="space-between" pb="sm">
        <Group gap="md">
          <Button.Group>
            <Button variant="default" size="xs" aria-label="Previous" onClick={() => controller.prev()}>
              <IconChevronLeft size={12} />
            </Button>
            <Button variant="default" size="xs" onClick={() => controller.today()}>
              Today
            </Button>
            <Button variant="default" size="xs" aria-label="Next" onClick={() => controller.next()}>
              <IconChevronRight size={12} />
            </Button>
          </Button.Group>
          <Group>
            <Title order={4}>{controller.view?.title}</Title>
            {loading && <Loader size="sm" />}
          </Group>
        </Group>
        <SegmentedControl
          size="xs"
          value={controller.view?.type}
          onChange={(newView) => controller.changeView(newView)}
          data={[
            { label: 'Month', value: 'dayGridMonth' },
            { label: 'Week', value: 'timeGridWeek' },
            { label: 'Day', value: 'timeGridDay' },
          ]}
        />
      </Group>
      <FullCalendar
        height="100%"
        plugins={[timeGridPlugin, dayGridPlugin, themePlugin, interactionPlugin]}
        initialView="timeGridWeek"
        slotMinHeight={38}
        colorScheme={colorScheme}
        displayEventEnd={false}
        eventTimeFormat={{ timeStyle: 'short' }}
        views={{
          timeGridWeek: {
            allDaySlot: false,
          },
          timeGridDay: {
            allDaySlot: false,
          },
        }}
        selectable={selectable}
        unselectAuto={false} // keep selected even if user clicks elsewhere, like booking form
        select={(eventInfo) => {
          onSelectInterval?.({ start: eventInfo.start, end: eventInfo.end });
        }}
        {...fullCalendarProps}
        ref={calendarRef}
        eventSources={eventSources}
        controller={controller}
        headerToolbar={false}
        datesSet={(info) => onRangeChange?.({ start: info.start, end: info.end })}
        className={cx(classes.calendar, controller.view?.type)}
        eventDidMount={(info) => {
          if (hasDoubleClickHandler) {
            eventDataRef.current.set(info.el, info.event);
            info.el.addEventListener('dblclick', handleDblClick);
          }
        }}
        businessHours={businessHours}
        eventClick={eventClick}
        eventClass={(evt) =>
          cx(props.eventClass, classes.event, {
            [classes.interactiveEvent]: evt.isInteractive,
            [classes.shortEvent]: evt.isShort,
          })
        }
        eventTimeClass={cx(props.eventTimeClass, classes.eventTime)}
        eventTitleClass={cx(props.eventTitleClass, classes.eventTitle)}
        eventInnerClass={cx(props.eventInnerClass, classes.eventInner)}
        backgroundEventClass={cx(props.backgroundEventClass, classes.backgroundEvent)}
        backgroundEventInnerClass={cx(props.backgroundEventInnerClass, classes.backgroundEventInner)}
        listItemEventBeforeClass={cx(props.listItemEventBeforeClass, classes.listItemEventBefore)}
        nonBusinessHoursClass={cx(props.nonBusinessHoursClass, classes.nonBusinessHours)}
        dayLaneClass={cx(props.dayLaneClass, selectable && classes.selectableDay)}
        dayCellClass={cx(props.dayCellClass, selectable && classes.selectableDay)}
        highlightClass={cx(props.highlightClass, classes.selectedRange)}
      />
    </div>
  );
}
