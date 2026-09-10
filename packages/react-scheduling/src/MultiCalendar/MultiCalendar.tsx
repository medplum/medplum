// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventDisplayInfo } from '@fullcalendar/react';
import type { MantineThemeColors } from '@mantine/core';
import { Tooltip, useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getExtensionValue, SchedulingScheduleColorURI } from '@medplum/core';
import type { Appointment, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import type { ExtendedEvent, FhirEventSource } from '../CalendarBase/CalendarBase';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import { filterBookedSlots } from '../CalendarBase/CalendarBase.utils';
import { resolveThemeColor } from '../colors';
import type { DateTimeRange } from '../types';
import classes from './MultiCalendar.module.css';

export interface MultiCalendarSource {
  schedule?: WithId<Schedule>;
  slots: Slot[];
  appointments: Appointment[];
  color?: keyof MantineThemeColors;
  /** Name shown on this source's chips. Defaults to the name of the schedule's actor. */
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
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
  loading?: boolean;
}

/** One source's badge inside an appointment block. */
interface SourceChip {
  key: string;
  /** The calendar's full name, given as the chip's tooltip. */
  label: string;
  /** As much of the name as a chip shows. */
  short: string;
  /** Chip background. Every chip prints in the same text color, whatever its own. */
  color: string;
}

/** How many characters of a calendar's name a chip shows before cutting it. */
const CHIP_NAME_LENGTH = 14;

/**
 * Names the calendar a chip stands for.
 * @param source - The source the chip is drawn for.
 * @param index - Its position in `sources`, used when nothing names it.
 * @returns The name to show on the chip.
 */
function chipLabel(source: MultiCalendarSource, index: number): string {
  if (source.label) {
    return source.label;
  }
  const actor = source.schedule?.actor[0];
  return actor?.display ?? actor?.reference ?? `Calendar ${index + 1}`;
}

/**
 * Cuts a calendar's name down to what reads inside an appointment block.
 *
 * An honorific and a parenthesized qualifier both go: they repeat across the
 * calendars of a workspace rather than telling two of them apart. What is left is
 * cut to {@link CHIP_NAME_LENGTH} characters on a word boundary. The full name is
 * still given as the chip's tooltip.
 *
 * @param label - The calendar's full name.
 * @returns The name to print on the chip.
 */
function shortChipLabel(label: string): string {
  const trimmed =
    label
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/^(?:dr|mr|mrs|ms|mx|prof)\.?\s+/i, '')
      .trim() || label;

  if (trimmed.length <= CHIP_NAME_LENGTH) {
    return trimmed;
  }
  const cut = trimmed.slice(0, CHIP_NAME_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break on a word that leaves something worth reading behind
  return `${(lastSpace > 5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A component that can display appointments and slots from several color-coded calendars.
 *
 * An appointment linked to several sources is drawn once, carrying a chip for each of
 * them, so that the calendar does not repeat a block per linked resource. The
 * appointment handlers are given the schedule of the first source that links it.
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

  const { eventSources, chipsByAppointment } = useMemo(() => {
    const colors = sources.map((source, i) => {
      let colorName = source.color && Object.hasOwn(theme.colors, source.color) ? source.color : undefined;

      if (!colorName) {
        const extColor = getExtensionValue(source.schedule, SchedulingScheduleColorURI);
        if (typeof extColor === 'string') {
          colorName = extColor;
        }
      }

      // Convert color name into concrete color values we can pass to FullCalendar and the chips
      const shades = theme.colors[resolveThemeColor(theme, colorName, i)];
      const label = chipLabel(source, i);
      return {
        event: shades[7],
        chip: {
          key: source.schedule?.id ?? `source-${i}`,
          label,
          short: shortChipLabel(label),
          color: shades[2],
        } satisfies SourceChip,
      };
    });

    // The first source that links an appointment draws it; the rest only contribute a chip.
    const chipsByAppointment = new Map<Appointment, SourceChip[]>();
    const drawnById = new Map<string, Appointment>();
    const drawnBySource: Appointment[][] = sources.map(() => []);

    sources.forEach((source, i) => {
      for (const appointment of source.appointments) {
        // An appointment with no id cannot be recognized across sources, so it is drawn per source.
        let drawn = appointment.id ? drawnById.get(appointment.id) : undefined;
        if (!drawn) {
          drawn = appointment;
          drawnBySource[i].push(appointment);
          if (appointment.id) {
            drawnById.set(appointment.id, appointment);
          }
          chipsByAppointment.set(drawn, []);
        }
        chipsByAppointment.get(drawn)?.push(colors[i].chip);
      }
    });

    const eventSources = sources.flatMap((source, i): FhirEventSource[] => [
      // Appointment blocks are left the default color: the chips inside them carry the
      // color of every calendar the appointment is on, including this one.
      { schedule: source.schedule, appointments: drawnBySource[i], slots: [] },
      {
        schedule: source.schedule,
        appointments: [],
        // Filtered here rather than by CalendarBase, which only sees the emptied
        // appointment list of this source and so could not match its booked slots.
        slots: filterBookedSlots(source.slots, source.appointments),
        color: colors[i].event,
      },
    ]);

    return { eventSources, chipsByAppointment };
  }, [sources, theme]);

  // Mirrors FullCalendar's own event content, with the chips under the title.
  const renderEventContent = useCallback(
    (info: EventDisplayInfo): ReactNode | true => {
      const ext = info.event.extendedProps as ExtendedEvent;
      const chips = ext.type === 'appointment' ? chipsByAppointment.get(ext.appointment) : undefined;
      if (!chips?.length) {
        return true; // Nothing to add; let FullCalendar render the event
      }
      return (
        <>
          <div className={info.titleClass}>{info.event.title || '\u00A0'}</div>
          <div className={classes.chips}>
            {chips.map((chip) => (
              // A chip shows as much of the calendar's name as fits, or none of it at
              // all in a block too short for a line of text, so the whole name is
              // always a hover away.
              <Tooltip key={chip.key} label={chip.label} withArrow>
                <span className={classes.chip} style={{ backgroundColor: chip.color }}>
                  <span className={classes.chipLabel}>{chip.short}</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </>
      );
    },
    [chipsByAppointment]
  );

  return (
    <CalendarBase
      eventSources={eventSources}
      nowIndicator
      {...calendarBaseProps}
      eventContent={renderEventContent}
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
