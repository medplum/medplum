// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventApi, EventInput } from '@fullcalendar/react';
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
import { EMPTY, getReferenceString } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Range } from '../types/scheduling';
import { assertNever } from '../utils/assert';
import classes from './Calendar.module.css';

export type ExtendedEvent = { type: 'appointment'; appointment: Appointment } | { type: 'slot'; slot: Slot };

// `includeCancelled` defaults to false to preserve `Calendar.tsx`/
// `ScheduleDetails.tsx`'s existing behavior unchanged (spec §7, §9
// regression requirement). The new multi-actor Calendar screen passes
// `true` — cancelled appointments must stay visible there, greyed/struck
// (spec §4.5), not hidden.
export function appointmentsToEvents(appointments: Appointment[], includeCancelled = false): EventInput[] {
  return appointments
    .filter((appointment) => (includeCancelled || appointment.status !== 'cancelled') && appointment.start && appointment.end)
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const status = !['booked', 'arrived', 'fulfilled', 'pending'].includes(appointment.status)
        ? ` (${appointment.status})`
        : '';

      const name = patientParticipant?.actor?.display ?? 'No Patient';

      return {
        id: appointment.id,
        title: `${name} ${status}`,
        start: appointment.start,
        end: appointment.end,
        extendedProps: { type: 'appointment', appointment } satisfies ExtendedEvent,
        interactive: true,
        className: cx(classes.appointment, classes[appointment.status]),
      };
    });
}

export function slotsToEvents(slots: Slot[]): EventInput[] {
  return slots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    title: slot.status === 'free' ? 'Available' : 'Blocked',
    extendedProps: { type: 'slot', slot } satisfies ExtendedEvent,
    interactive: false,
    className: cx(classes.slot, classes[slot.status]),
    display: 'background',
  }));
}

// Shared by Calendar.tsx (single-actor) and ResourceCalendar.tsx (multi-actor
// swimlanes) — drops slots that are just the busy-side-effect of an
// appointment already being rendered, and never shows "entered-in-error"
// slots.
export function appointmentsAndSlotsToEvents(
  appointments: Appointment[],
  slots: Slot[],
  includeCancelled = false
): EventInput[] {
  const appointmentIndex = appointments.reduce<Record<string, Appointment>>((acc, appointment) => {
    (appointment.slot ?? EMPTY).forEach((slotRef) => {
      const key = getReferenceString(slotRef);
      if (key) {
        acc[key] = appointment;
      }
    });
    return acc;
  }, {});

  const filteredSlots = slots.filter((slot) => {
    if (slot.status === 'entered-in-error') {
      return false;
    }
    const key = getReferenceString(slot);
    if (key && appointmentIndex[key]) {
      const appointment = appointmentIndex[key];
      if (slot.start === appointment.start && slot.end === appointment.end) {
        return false;
      }
    }
    return true;
  });

  return [...appointmentsToEvents(appointments, includeCancelled), ...slotsToEvents(filteredSlots)];
}

export function Calendar(props: {
  slots: Slot[];
  appointments: Appointment[];
  onSelectInterval?: (slotInfo: Range) => void;
  onSelectSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  onDoubleClickAppointment?: (appointment: Appointment) => void;
  onRangeChange?: (range: Range) => void;
  className?: string;
}): JSX.Element {
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();
  const { onSelectAppointment, onSelectSlot, onDoubleClickAppointment } = props;

  const handleSelectEventRaw = useCallback(
    (event: EventApi) => {
      const ext = event.extendedProps as ExtendedEvent;
      if (ext.type === 'appointment') {
        onSelectAppointment?.(ext.appointment);
      } else if (ext.type === 'slot') {
        onSelectSlot?.(ext.slot);
      } else {
        assertNever(ext);
      }
    },
    [onSelectAppointment, onSelectSlot]
  );

  // Add slight delay to click handler to permit double-clicks to register
  const handleSelectEventDebounced = useDebouncedCallback(handleSelectEventRaw, 100);

  const handleSelectEvent = onDoubleClickAppointment ? handleSelectEventDebounced : handleSelectEventRaw;

  // FullCalendar creates new elements on each render rather than recycling them,
  // so dblclick listeners are cleaned up automatically when the old element is GC'd
  // — no eventWillUnmount teardown needed. The WeakMap and callback Ref let the
  // single stable listener read the latest event data and prop without being
  // re-registered on every render.
  const eventDataRef = useRef(new WeakMap<Element, ExtendedEvent>());
  const onDoubleClickRef = useRef(onDoubleClickAppointment);
  useEffect(() => {
    onDoubleClickRef.current = onDoubleClickAppointment;
  }, [onDoubleClickAppointment]);

  const handleDblClick = useCallback((e: Event) => {
    const ext = eventDataRef.current.get(e.currentTarget as Element);
    if (ext?.type === 'appointment') {
      onDoubleClickRef.current?.(ext.appointment);
    }
  }, []);

  const events = useMemo(
    () => appointmentsAndSlotsToEvents(props.appointments, props.slots),
    [props.appointments, props.slots]
  );

  return (
    <div data-testid="calendar" className={cx(classes.wrapper, props.className)}>
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
        className={cx(classes.calendar, controller.view?.type)}
        height="100%"
        plugins={[timeGridPlugin, dayGridPlugin, themePlugin, interactionPlugin]}
        controller={controller}
        initialView="timeGridWeek"
        headerToolbar={false}
        events={events}
        datesSet={(info) => props.onRangeChange?.({ start: info.start, end: info.end })}
        eventClick={(eventInfo) => handleSelectEvent(eventInfo.event)}
        selectable
        select={(eventInfo) =>
          props.onSelectInterval?.({
            start: eventInfo.start,
            end: eventInfo.end,
          })
        }
        slotMinHeight={38}
        eventClass={(evt) =>
          cx(classes.event, {
            [classes.interactiveEvent]: evt.isInteractive,
            [classes.shortEvent]: evt.isShort,
          })
        }
        eventTimeClass={classes.eventTime}
        eventTitleClass={classes.eventTitle}
        eventInnerClass={classes.eventInner}
        backgroundEventClass={classes.backgroundEvent}
        backgroundEventInnerClass={classes.backgroundEventInner}
        colorScheme={colorScheme}
        nowIndicator
        displayEventEnd={false}
        eventTimeFormat={{ timeStyle: 'short' }}
        listItemEventBeforeClass={classes.listItemEventBefore}
        views={{
          timeGridWeek: {
            allDaySlot: false,
          },
          timeGridDay: {
            allDaySlot: false,
          },
        }}
        eventDidMount={(info) => {
          if (onDoubleClickAppointment) {
            eventDataRef.current.set(info.el, info.event.extendedProps as ExtendedEvent);
            info.el.addEventListener('dblclick', handleDblClick);
          }
        }}
      />
    </div>
  );
}
