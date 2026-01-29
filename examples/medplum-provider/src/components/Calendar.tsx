// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Button, Group, SegmentedControl, Title } from '@mantine/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { Calendar as ReactBigCalendar, dayjsLocalizer } from 'react-big-calendar';
import type { Event, SlotInfo, ToolbarProps, View } from 'react-big-calendar';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Range } from '../types/scheduling';
import { SchedulingTransientIdentifier } from '../utils/scheduling';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault(dayjs.tz.guess());

type AppointmentEvent = Event & { type: 'appointment'; appointment: Appointment; start: Date; end: Date };
type SlotEvent = Event & { type: 'slot'; slot: Slot; status: string; start: Date; end: Date };
type ScheduleEvent = AppointmentEvent | SlotEvent;

export const CalendarToolbar = (props: ToolbarProps<ScheduleEvent>): JSX.Element => {
  const [firstRender, setFirstRender] = useState(true);
  useEffect(() => {
    // The calendar does not provide any way to receive the range of dates that
    // are visible except when they change. This is the cleanest way I could find
    // to extend it to provide the _initial_ range (`onView` calls `onRangeChange`).
    // https://github.com/jquense/react-big-calendar/issues/1752#issuecomment-761051235
    if (firstRender) {
      props.onView(props.view);
      setFirstRender(false);
    }
  }, [props, firstRender, setFirstRender]);
  return (
    <Group justify="space-between" pb="sm">
      <Group>
        <Title order={4} mr="md">
          {props.view !== 'day' && dayjs(props.date).format('MMMM YYYY')}
          {props.view === 'day' && dayjs(props.date).format('MMMM D YYYY')}
        </Title>
        <Button.Group>
          <Button variant="default" size="xs" aria-label="Previous" onClick={() => props.onNavigate('PREV')}>
            <IconChevronLeft size={12} />
          </Button>
          <Button variant="default" size="xs" onClick={() => props.onNavigate('TODAY')}>
            Today
          </Button>
          <Button variant="default" size="xs" aria-label="Next" onClick={() => props.onNavigate('NEXT')}>
            <IconChevronRight size={12} />
          </Button>
        </Button.Group>
      </Group>
      <SegmentedControl
        size="xs"
        value={props.view}
        onChange={(newView) => props.onView(newView as View)}
        data={[
          { label: 'Month', value: 'month' },
          { label: 'Week', value: 'week' },
          { label: 'Day', value: 'day' },
        ]}
      />
    </Group>
  );
};

function appointmentsToEvents(appointments: Appointment[]): AppointmentEvent[] {
  return appointments
    .filter((appointment) => appointment.status !== 'cancelled' && appointment.start && appointment.end)
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status as string)
        ? ` (${appointment.status})`
        : '';

      return {
        type: 'appointment',
        appointment,
        title: `${patientParticipant?.actor?.display} ${status}`,
        start: new Date(appointment.start as string),
        end: new Date(appointment.end as string),
        resource: appointment,
      };
    });
}

// This function collapses contiguous or overlapping slots of the same status into single events
function slotsToEvents(slots: Slot[]): SlotEvent[] {
  return slots.map((slot) => ({
    type: 'slot',
    slot,
    status: slot.status,
    resource: slot,
    start: new Date(slot.start),
    end: new Date(slot.end),
    title: slot.status === 'free' ? 'Available' : 'Blocked',
  }));
}

function eventPropGetter(
  event: ScheduleEvent,
  _start: Date,
  _end: Date,
  _isSelected: boolean
): { className?: string | undefined; style?: React.CSSProperties } {
  const result = {
    style: {
      backgroundColor: '#228be6',
      border: '1px solid rgba(255, 255, 255, 0)',
      borderRadius: '4px',
      color: 'white',
      display: 'block',
      opacity: 1.0,
    },
  };

  if (event.type === 'slot') {
    result.style.backgroundColor = event.status === 'free' ? '#d3f9d8' : '#ced4da';
    result.style.color = 'black';
    result.style.opacity = 0.6;
  }

  return result;
}

export function Calendar(props: {
  slots: Slot[];
  appointments: Appointment[];
  style?: React.CSSProperties;
  onSelectInterval?: (slotInfo: SlotInfo) => void;
  onSelectSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  onRangeChange?: (range: Range) => void;
}): JSX.Element {
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState<Date>(new Date());
  const [range, setRange] = useState<Range | undefined>();

  const { onRangeChange } = props;
  const handleRangeChange = useCallback(
    (newRange: Date[] | { start: Date; end: Date }) => {
      let newStart: Date;
      let newEnd: Date;
      if (Array.isArray(newRange)) {
        // Week view passes the range as an array of dates
        newStart = newRange[0];
        newEnd = dayjs(newRange[newRange.length - 1])
          .add(1, 'day')
          .toDate();
      } else {
        // Other views pass the range as an object
        newStart = newRange.start;
        newEnd = newRange.end;
      }

      // Only update state if the range has changed
      if (newStart.getTime() !== range?.start.getTime() || newEnd.getTime() !== range.end.getTime()) {
        setRange({ start: newStart, end: newEnd });
        onRangeChange?.({ start: newStart, end: newEnd });
      }
    },
    [range, onRangeChange]
  );

  const { onSelectAppointment, onSelectSlot } = props;

  const handleSelectEvent = useCallback(
    (event: ScheduleEvent) => {
      if (event.type === 'appointment') {
        onSelectAppointment?.(event.appointment);
      } else if (event.type === 'slot') {
        onSelectSlot?.(event.slot);
      }
    },
    [onSelectAppointment, onSelectSlot]
  );

  const events = [
    ...appointmentsToEvents(props.appointments),
    ...slotsToEvents(props.slots.filter((slot) => SchedulingTransientIdentifier.get(slot))),
  ];

  const backgroundEvents = slotsToEvents(props.slots.filter((slot) => !SchedulingTransientIdentifier.get(slot)));

  return (
    <ReactBigCalendar
      components={{ toolbar: CalendarToolbar }}
      view={view}
      date={date}
      localizer={dayjsLocalizer(dayjs)}
      events={events}
      // Background events don't show in the month view
      backgroundEvents={backgroundEvents}
      onNavigate={(newDate: Date, newView: View) => {
        setDate(newDate);
        setView(newView);
      }}
      onRangeChange={handleRangeChange}
      onSelectSlot={props.onSelectInterval}
      onSelectEvent={handleSelectEvent}
      onView={setView}
      // Default scroll to current time
      scrollToTime={date}
      selectable
      eventPropGetter={eventPropGetter}
      style={props.style}
      dayLayoutAlgorithm="no-overlap"
    />
  );
}
