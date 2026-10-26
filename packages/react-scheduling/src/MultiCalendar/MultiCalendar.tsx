// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineThemeColors } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { ReactNode } from 'react';
import { forwardRef, useMemo } from 'react';
import { AppointmentEvent } from '../CalendarBase/AppointmentEvent';
import type { CalendarHandle, ExtendedEvent, FhirEventSource } from '../CalendarBase/CalendarBase';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import { SlotEvent } from '../CalendarBase/SlotEvent';
import { getSchedulingColor, resolveThemeColor } from '../colors';
import type { DateTimeRange } from '../types';
import classes from './MultiCalendar.module.css';

export type { CalendarHandle } from '../CalendarBase/CalendarBase';

export interface MultiCalendarSource {
  schedule?: WithId<Schedule>;
  slots: Slot[];
  appointments: Appointment[];
  color?: keyof MantineThemeColors;
  /** False draws the source's events as not clickable, whatever click handlers the calendar has. */
  interactive?: boolean;
  /**
   * Draws the source's appointments as not yet saved, such as a visit a form is about to book:
   * hatched and outlined, apart from any appointment stored as proposed.
   */
  draft?: boolean;
  /** Names each of the source's appointments in place of its patient. */
  label?: string;
}

export interface MultiCalendarProps {
  sources: MultiCalendarSource[];
  onSelectInterval?: (slotInfo: DateTimeRange) => void;
  onSelectSlot?: (slot: Slot, schedule?: WithId<Schedule>) => void;
  onSelectAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onDoubleClickAppointment?: (appointment: Appointment, schedule?: WithId<Schedule>) => void;
  onRangeChange?: (range: DateTimeRange) => void;
  selection?: DateTimeRange;
  selectedId?: string;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
  loading?: boolean;
  /** Placed at the start of the toolbar, before the navigation buttons. */
  toolbarStart?: ReactNode;
  /** Placed at the end of the toolbar, after the view toggle. */
  toolbarEnd?: ReactNode;
}

/**
 * A component that can display appointments and slots from several Schedules, with each
 * schedule's appointments color-coded. Slots are drawn in gray, whichever schedule holds them.
 *
 * If you pass a Schedule as an attribute of a source, it will be passed back
 * to event handlers alongside the interacted Appointment/Slot resources. It may also
 * specify a color override via a Extension
 * ("https://medplum.com/fhir/StructureDefinition/SchedulingColor").
 *
 * @param props - Component props
 * @param ref - Handle for paging the calendar
 * @returns A React Node with the Calendar UI in it
 */
export const MultiCalendar = forwardRef<CalendarHandle, MultiCalendarProps>(function MultiCalendar(props, ref) {
  const theme = useMantineTheme();

  const { sources, className, ...calendarBaseProps } = props;

  const eventSources = useMemo((): FhirEventSource[] => {
    return sources.map(({ draft, ...source }, i) => {
      let colorName = source.color && Object.hasOwn(theme.colors, source.color) ? source.color : undefined;
      colorName ||= getSchedulingColor(source.schedule);

      // Convert color name into a concrete color value we can pass to FullCalendar, and a class
      // that styles can pick the color out by.
      const resolved = resolveThemeColor(theme, colorName, i);
      return { ...source, color: theme.colors[resolved][7], className: cx(`color-${resolved}`, draft && 'draft') };
    });
  }, [sources, theme]);

  return (
    <CalendarBase
      ref={ref}
      eventSources={eventSources}
      nowIndicator
      className={cx(className, classes.wrapper)}
      {...calendarBaseProps}
      eventInnerClass={classes.eventInner}
      eventTimeClass={classes.eventTime}
      eventTitleClass={classes.eventTitle}
      availableTime={props.availableTime}
      eventContent={(info) => {
        const ext = info.event.extendedProps as ExtendedEvent;
        if (ext.type === 'appointment') {
          return <AppointmentEvent appointment={ext.appointment} label={ext.label} info={info} />;
        } else if (ext.type === 'slot') {
          return <SlotEvent slot={ext.slot} schedule={ext.schedule} info={info} />;
        } else {
          // `true` renders unknown event types via FullCalendar's default UI
          return true;
        }
      }}
      eventTimeFormat={{
        hour: 'numeric',
        minute: '2-digit',
        omitZeroMinute: true,
        meridiem: 'lowercase',
      }}
    />
  );
});
