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
import { Box, Button, Group, SegmentedControl, Title, useComputedColorScheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import calendarClasses from '../Calendar.module.css';
import type { Range } from '../../types/scheduling';
import classes from './ResourceCalendar.module.css';

export type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

// One actor type = one View-by lens (see CalendarPage). Every visible entry
// in a given render belongs to the same lens, so the palette family is
// picked once per calendar, not per entry — Providers/Rooms/Devices get
// visually distinct hue families (spec feedback: color alone should signal
// which lens you're looking at, before reading the legend).
export type ActorKind = 'Practitioner' | 'Location' | 'Device';

const ACTOR_CLASSES: Record<ActorKind, string[]> = {
  Practitioner: [
    classes.practitioner0,
    classes.practitioner1,
    classes.practitioner2,
    classes.practitioner3,
    classes.practitioner4,
    classes.practitioner5,
  ],
  Location: [classes.location0, classes.location1, classes.location2, classes.location3, classes.location4, classes.location5],
  Device: [classes.device0, classes.device1, classes.device2, classes.device3, classes.device4, classes.device5],
};

export function actorColorClass(actorKind: ActorKind, colorIndex: number): string {
  const family = ACTOR_CLASSES[actorKind];
  return family[colorIndex % family.length];
}

// One appointment plus the palette index of the actor it should be colored by
// (which actor that is depends on the current View-by lens — see CalendarPage).
export type CalendarEntry = {
  appointment: WithId<Appointment>;
  colorIndex: number;
};

export type LegendItem = { label: string; colorIndex: number };

function entriesToEvents(entries: CalendarEntry[], actorKind: ActorKind): EventInput[] {
  return entries
    .filter((e) => e.appointment.start && e.appointment.end)
    .map(({ appointment, colorIndex }) => {
      const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const name = patientParticipant?.actor?.display ?? 'No Patient';
      const STATUS_OVERLAY: Record<string, string | undefined> = {
        pending: classes.pendingOverlay,
        cancelled: classes.cancelledOverlay,
      };
      const statusClass = STATUS_OVERLAY[appointment.status];
      const suffix = !['booked', 'arrived', 'fulfilled', 'pending'].includes(appointment.status)
        ? ` (${appointment.status})`
        : '';
      return {
        id: appointment.id,
        title: `${name}${suffix}`,
        start: appointment.start,
        end: appointment.end,
        extendedProps: { appointment },
        className: cx(actorColorClass(actorKind, colorIndex), statusClass),
      } satisfies EventInput;
    });
}

function blocksToEvents(blocks: Slot[]): EventInput[] {
  return blocks
    .filter((slot) => slot.status !== 'entered-in-error' && slot.start && slot.end)
    .map((slot) => ({
      id: `block-${slot.id}`,
      start: slot.start,
      end: slot.end,
      title: slot.comment ?? 'Blocked',
      display: 'background',
      className: cx(calendarClasses.slot),
    }));
}

/**
 * Multi-actor roster calendar for the Calendar & Availability screen. Unlike
 * the earlier side-by-side-instances design, this renders **one** shared
 * FullCalendar with every visible actor's appointments overlaid in the same
 * grid, colored per actor (FullCalendar's native intra-column overlap layout
 * slices simultaneous events side-by-side for free — no resource plugin
 * needed). Status (pending/cancelled) is a non-fill overlay so it doesn't
 * collide with actor color. The calendar never books directly: empty-space
 * clicks route out to Find & Book via `onCreateAt` (spec §6 load-bearing
 * principle), and appointment drag is disabled so the destructive
 * reschedule path can't fire accidentally.
 * @param props - Roster calendar props.
 * @returns The multi-actor roster calendar element.
 */
export type ResourceCalendarProps = {
  entries: CalendarEntry[];
  blocks: Slot[];
  legend: LegendItem[];
  actorKind: ActorKind;
  slotDurationMinutes: 15 | 30 | 60;
  initialView?: CalendarViewType;
  onRangeChange?: (range: Range) => void;
  onSelectAppointment?: (appointment: WithId<Appointment>) => void;
  onCreateAt?: (date: Date) => void;
};

export function ResourceCalendar(props: ResourceCalendarProps): JSX.Element {
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();
  const { onSelectAppointment, onCreateAt, actorKind } = props;

  const events = useMemo(
    () => [...entriesToEvents(props.entries, actorKind), ...blocksToEvents(props.blocks)],
    [props.entries, props.blocks, actorKind]
  );

  const handleEventClick = useCallback(
    (event: EventApi) => {
      const appointment = (event.extendedProps as { appointment?: WithId<Appointment> }).appointment;
      if (appointment) {
        onSelectAppointment?.(appointment);
      }
    },
    [onSelectAppointment]
  );

  const slotDuration = `00:${String(props.slotDurationMinutes).padStart(2, '0')}:00`;

  return (
    <div className={classes.wrapper}>
      <Group justify="space-between" pb="sm" className={classes.toolbar}>
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

      <div className={classes.body}>
        {props.legend.length > 0 && (
          <div className={classes.legend}>
            {props.legend.map((item) => (
              <div key={item.label} className={classes.legendItem}>
                <Box
                  className={cx(classes.legendSwatch, actorColorClass(actorKind, item.colorIndex))}
                  bg="var(--cal-background-color)"
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className={classes.calendarHost}>
          <FullCalendar
            className={cx(calendarClasses.calendar, controller.view?.type)}
            height="100%"
            plugins={[timeGridPlugin, dayGridPlugin, themePlugin, interactionPlugin]}
            controller={controller}
            initialView={props.initialView ?? 'timeGridWeek'}
            headerToolbar={false}
            events={events}
            slotDuration={slotDuration}
            datesSet={(info) => props.onRangeChange?.({ start: info.start, end: info.end })}
            eventClick={(eventInfo) => handleEventClick(eventInfo.event)}
            dateClick={(info) => onCreateAt?.(info.date)}
            selectable={false}
            slotMinHeight={38}
            eventClass={(evt) =>
              cx(calendarClasses.event, {
                [calendarClasses.interactiveEvent]: evt.isInteractive,
                [calendarClasses.shortEvent]: evt.isShort,
              })
            }
            eventTimeClass={calendarClasses.eventTime}
            eventTitleClass={calendarClasses.eventTitle}
            eventInnerClass={calendarClasses.eventInner}
            backgroundEventClass={calendarClasses.backgroundEvent}
            backgroundEventInnerClass={calendarClasses.backgroundEventInner}
            colorScheme={colorScheme}
            nowIndicator
            displayEventEnd={false}
            eventTimeFormat={{ timeStyle: 'short' }}
            views={{
              timeGridWeek: { allDaySlot: false },
              timeGridDay: { allDaySlot: false },
            }}
          />
        </div>
      </div>
    </div>
  );
}
