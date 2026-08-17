// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventApi, EventInput } from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import { assertNever } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import { filterBookedSlots } from '../CalendarBase/CalendarBase.utils';
import type { DateTimeRange } from '../types';
import classes from './Calendar.module.css';

type ExtendedEvent = { type: 'appointment'; appointment: Appointment } | { type: 'slot'; slot: Slot };

function appointmentsToEvents(appointments: Appointment[]): EventInput[] {
  return appointments
    .filter((appointment) => appointment.start && appointment.end)
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

function slotTitle(slot: Slot): string {
  if (slot.status === 'free') {
    return 'Available';
  }
  if (slot.status === 'entered-in-error') {
    return 'Entered in error';
  }
  return 'Blocked';
}

function slotsToEvents(slots: Slot[]): EventInput[] {
  return slots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    title: slotTitle(slot),
    extendedProps: { type: 'slot', slot } satisfies ExtendedEvent,
    interactive: false,
    className: cx(classes.slot, classes[slot.status]),
    display: 'background',
  }));
}

export interface CalendarProps {
  slots?: Slot[];
  appointments?: Appointment[];
  onSelectInterval?: (slotInfo: DateTimeRange) => void;
  onSelectSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  onDoubleClickAppointment?: (appointment: Appointment) => void;
  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
}

export function Calendar(props: CalendarProps): JSX.Element {
  const { onSelectAppointment, onSelectSlot, onDoubleClickAppointment } = props;

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

  const handleDoubleClick = useCallback(
    (event: EventApi) => {
      const ext = event.extendedProps as ExtendedEvent;
      if (ext.type === 'appointment') {
        onDoubleClickAppointment?.(ext.appointment);
      }
    },
    [onDoubleClickAppointment]
  );

  const events = useMemo(() => {
    const appointments = props.appointments ?? [];
    const slots = props.slots ?? [];
    const filteredSlots = filterBookedSlots(slots, appointments);
    return [...appointmentsToEvents(appointments), ...slotsToEvents(filteredSlots)];
  }, [props.appointments, props.slots]);

  return (
    <CalendarBase
      events={events}
      onRangeChange={props.onRangeChange}
      eventClick={(eventInfo) => handleSelectEvent(eventInfo.event)}
      eventDoubleClick={onDoubleClickAppointment && handleDoubleClick}
      selectable
      select={(eventInfo) =>
        props.onSelectInterval?.({
          start: eventInfo.start,
          end: eventInfo.end,
        })
      }
      nowIndicator
      views={{
        timeGridWeek: {
          allDaySlot: false,
        },
        timeGridDay: {
          allDaySlot: false,
        },
      }}
      className={props.className}
      availableTime={props.availableTime}
      eventClass={classes.event}
      eventInnerClass={classes.eventInner}
      backgroundEventClass={classes.backgroundEvent}
      backgroundEventInnerClass={classes.backgroundEventInner}
    />
  );
}
