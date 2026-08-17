// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventApi } from '@fullcalendar/react';
import FullCalendar, { useCalendarController } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { Button, Group, SegmentedControl, Title, useComputedColorScheme } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { HealthcareServiceAvailableTime } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { DateTimeRange } from '../types';
import classes from './CalendarBase.module.css';
import { availableTimeToBusinessHoursEntry } from './CalendarBase.utils';

export interface CalendarBaseProps extends Omit<
  React.ComponentProps<typeof FullCalendar>,
  // disallow specifying some FullCalendar props that we rely on
  'controller' | 'headerToolbar' | 'datesSet' | 'eventDidMount' | 'businessHours' | 'plugins'
> {
  eventDoubleClick?: (event: EventApi) => void;
  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
}

// Some common calendar features:
// - basic styling & calendar headers components
// - event double click handlers
// - availability overlay input in format of `HealthcareService.availableTime`
export function CalendarBase(props: CalendarBaseProps): JSX.Element {
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();

  // Add slight delay to click handler to permit double-clicks to register (but only when
  // there is a double click handler).
  const { eventDoubleClick, onRangeChange, className, availableTime, ...fullCalendarProps } = props;
  const eventClickDebounced = useDebouncedCallback(props.eventClick ?? (() => {}), 100);
  const eventClick = eventDoubleClick ? eventClickDebounced : props.eventClick;

  // FullCalendar creates new elements on each render rather than recycling them,
  // so dblclick listeners are cleaned up automatically when the old element is GC'd
  // — no eventWillUnmount teardown needed. The WeakMap and callback Ref let the
  // single stable listener read the latest event data and prop without being
  // re-registered on every render.
  const eventDataRef = useRef(new WeakMap<Element, EventApi>());
  const eventDoubleClickRef = useRef(eventDoubleClick);
  useEffect(() => {
    eventDoubleClickRef.current = eventDoubleClick;
  }, [eventDoubleClick]);

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
          <Title order={4}>{controller.view?.title}</Title>
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
        {...fullCalendarProps}
        controller={controller}
        headerToolbar={false}
        datesSet={(info) => onRangeChange?.({ start: info.start, end: info.end })}
        className={cx(classes.calendar, controller.view?.type)}
        eventDidMount={(info) => {
          if (eventDoubleClick) {
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
      />
    </div>
  );
}
