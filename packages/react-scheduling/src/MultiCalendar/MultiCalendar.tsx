// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventApi, EventClickInfo, EventInput, EventSourceInput } from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import type { MantineThemeColors } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { assertNever, getExtensionValue, SchedulingScheduleColorURI } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import { filterBookedSlots } from '../CalendarBase/CalendarBase.utils';
import type { DateTimeRange } from '../types';
import classes from './MultiCalendar.module.css';

type ExtendedEvent =
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

export interface MultiCalendarSource {
  schedule?: WithId<Schedule>;
  slots: WithId<Slot>[];
  appointments: WithId<Appointment>[];
  color?: keyof MantineThemeColors;
}

export interface MultiCalendarProps {
  sources: MultiCalendarSource[];
  onSelectInterval?: (slotInfo: DateTimeRange) => void;
  onSelectSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onSelectAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onDoubleClickAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
}

const colors = [
  'indigo',
  'teal',
  'pink',
  'violet',
  'blue',
  'cyan',
  'lime',
  'red',
  'yellow',
  'grape',
  'orange',
] satisfies (keyof MantineThemeColors)[];

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

/* A component that can display appointments and slots from several color-coded calendars.
 *
 * If you pass a Schedule as an attribute of a source, it will be passed back
 * to event handlers alongside the interacted Appointment/Slot resources. It may also
 * specify a color override via a Extension
 * ("https://medplum.com/fhir/StructureDefinition/SchedulingColor").
 *
 * @param props - Component props
 * @returns A React Node with the Calendar UI in it
 */
export function MultiCalendar(props: MultiCalendarProps): JSX.Element {
  const theme = useMantineTheme();
  const { onSelectAppointment, onSelectSlot, onDoubleClickAppointment } = props;

  const handleEventClick = useCallback(
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

  const eventDoubleClick = useCallback(
    (e: EventApi): boolean => {
      const ext = e.extendedProps as ExtendedEvent;
      if (ext?.type === 'appointment') {
        onDoubleClickAppointment?.(ext.appointment, ext.schedule);
        return true;
      }
      return false;
    },
    [onDoubleClickAppointment]
  );

  const eventSources = useMemo((): EventSourceInput[] => {
    const appointmentExtra = {
      interactive: Boolean(props.onSelectAppointment || props.onDoubleClickAppointment),
    };

    const slotExtra = {
      interactive: false,
      display: 'background',
    };

    return props.sources.map((source, i) => {
      const appointments = source.appointments ?? [];
      const slots = source.slots ?? [];
      const filteredSlots = filterBookedSlots(slots, appointments);

      const colorName = [
        source.color,
        getExtensionValue(source.schedule, SchedulingScheduleColorURI) as string | undefined,
      ].find((name) => typeof name === 'string' && Object.hasOwn(theme.colors, name));
      const color = theme.colors[colorName ?? colors[i % colors.length]][7];

      return {
        events: [
          ...appointmentsToEvents(appointments, source.schedule, appointmentExtra),
          ...slotsToEvents(filteredSlots, source.schedule, slotExtra),
        ],
        color,
      };
    });
  }, [props.sources, theme.colors, props.onSelectAppointment, props.onDoubleClickAppointment]);

  return (
    <CalendarBase
      className={props.className}
      eventSources={eventSources}
      onRangeChange={props.onRangeChange}
      eventClick={handleEventClick}
      eventDoubleClick={onDoubleClickAppointment && eventDoubleClick}
      selectable
      select={(eventInfo) =>
        props.onSelectInterval?.({
          start: eventInfo.start,
          end: eventInfo.end,
        })
      }
      eventInnerClass={classes.eventInner}
      eventTimeClass={classes.eventTime}
      nowIndicator
      availableTime={props.availableTime}
      eventTimeFormat={{
        hour: 'numeric',
        minute: '2-digit',
        omitZeroMinute: true,
        meridiem: 'lowercase',
      }}
    />
  );
}
