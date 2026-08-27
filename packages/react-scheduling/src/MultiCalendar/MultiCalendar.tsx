// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineThemeColors } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getExtensionValue, SchedulingScheduleColorURI } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { FhirEventSource } from '../CalendarBase/CalendarBase';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import { resolveThemeColor } from '../colors';
import type { DateTimeRange } from '../types';
import classes from './MultiCalendar.module.css';

export interface MultiCalendarSource {
  schedule?: WithId<Schedule>;
  slots: Slot[];
  appointments: Appointment[];
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
  loading?: boolean;
}

/**
 * A component that can display appointments and slots from several color-coded calendars.
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

  const { sources, ...calendarBaseProps } = props;

  const eventSources = useMemo((): FhirEventSource[] => {
    return sources.map((source, i) => {
      let colorName = source.color && Object.hasOwn(theme.colors, source.color) ? source.color : undefined;

      if (!colorName) {
        const extColor = getExtensionValue(source.schedule, SchedulingScheduleColorURI);
        if (typeof extColor === 'string') {
          colorName = extColor;
        }
      }

      // Convert color name into a concrete color value we can pass to FullCalendar
      const color = theme.colors[resolveThemeColor(theme, colorName, i)][7];
      return { ...source, color };
    });
  }, [sources, theme]);

  return (
    <CalendarBase
      eventSources={eventSources}
      nowIndicator
      {...calendarBaseProps}
      eventInnerClass={classes.eventInner}
      eventTimeClass={classes.eventTime}
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
