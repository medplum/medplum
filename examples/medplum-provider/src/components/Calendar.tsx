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
import { Button, Group, SegmentedControl, Title } from '@mantine/core';
import { EMPTY, getReferenceString } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import type { Range } from '../types/scheduling';
import { assertNever } from '../utils/assert';
import classes from './Calendar.module.css';

type ExtendedEvent = { type: 'appointment'; appointment: Appointment } | { type: 'slot'; slot: Slot };

function appointmentsToEvents(appointments: Appointment[]): EventInput[] {
  return appointments
    .filter((appointment) => appointment.status !== 'cancelled' && appointment.start && appointment.end)
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status) ? ` (${appointment.status})` : '';

      const name = patientParticipant ? patientParticipant.actor?.display : 'No Patient';

      return {
        id: appointment.id,
        title: `${name} ${status}`,
        start: appointment.start,
        end: appointment.end,
        extendedProps: { type: 'appointment' as const, appointment },
        interactive: true,
        color: '#228be6', // blue.6
      };
    });
}

function slotsToEvents(slots: Slot[]): EventInput[] {
  return slots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    title: slot.status === 'free' ? 'Available' : 'Blocked',
    extendedProps: { type: 'slot', slot } satisfies ExtendedEvent,
    interactive: false,
    color:
      slot.status === 'free'
        ? '#d3f9d8' // green.1
        : '#ced4da', // gray.4
    contrastColor: '#424242', // dark.4
  }));
}

export function Calendar(props: {
  slots: Slot[];
  appointments: Appointment[];
  style?: React.CSSProperties;
  onSelectInterval?: (slotInfo: Range) => void;
  onSelectSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  onRangeChange?: (range: Range) => void;
}): JSX.Element {
  const controller = useCalendarController();
  const { onSelectAppointment, onSelectSlot } = props;

  const handleSelectEvent = useCallback(
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

  const events = useMemo(() => {
    const appointmentIndex = props.appointments.reduce<Record<string, Appointment>>((acc, appointment) => {
      (appointment.slot ?? EMPTY).forEach((slotRef) => {
        const key = getReferenceString(slotRef);
        if (key) {
          acc[key] = appointment;
        }
      });
      return acc;
    }, {});

    const filteredSlots = props.slots.filter((slot) => {
      // never show "entered-in-error" slots on the calendar
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

    return [...appointmentsToEvents(props.appointments), ...slotsToEvents(filteredSlots)];
  }, [props.appointments, props.slots]);

  return (
    <div data-testid="calendar" style={props.style} className={classes.wrapper}>
      <Group justify="space-between" pb="sm">
        <Group gap="md">
          <Title order={4}>{controller.view?.title}</Title>
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
        slotMinHeight={35}
        eventClass={(evt) => (evt.isInteractive ? classes.interactiveEvent : undefined)}
        nowIndicator
      />
    </div>
  );
}
