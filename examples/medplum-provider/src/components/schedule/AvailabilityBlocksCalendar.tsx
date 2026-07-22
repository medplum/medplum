// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventInput } from '@fullcalendar/react';
import FullCalendar, { useCalendarController } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { Button, Group, SegmentedControl, Title, useComputedColorScheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import calendarClasses from '../Calendar.module.css';
import type { Range } from '../../types/scheduling';
import type { AvailabilityWindow } from '../../utils/schedulingParameters';
import { computeAvailabilityBlocks } from '../../utils/schedulingParameters';
import classes from './AvailabilityBlocksCalendar.module.css';

/**
 * The single dated calendar in Availability mode — the time-off surface.
 * Renders the recurring weekly hours (configured elsewhere) as a translucent
 * green background so the grid lines still read through, plus one-time
 * `busy-unavailable` blocks as solid events. Purely presentational: drag
 * fires `onSelectRange` (parent opens the Block-time modal pre-filled) and a
 * block click fires `onSelectBlock` (parent confirms deletion). All create/
 * edit modals live in the parent so there's one block-authoring surface.
 *
 * Mirrors `ResourceCalendar`'s flex-fill wrapper/toolbar/calendarHost layout
 * exactly (same `height:100%` chain, same single toolbar row) so this
 * calendar renders at the same size as the Calendar-mode roster. `headerActions`
 * lets the parent (`AvailabilityManager`) fold its own buttons into this
 * toolbar row instead of adding a second header row above it, which is what
 * previously made this calendar shorter than the roster's.
 * @param props - Blocks calendar props.
 * @param props.availabilityWindows - Recurring hours to project as background.
 * @param props.blocks - Existing one-time busy-unavailable slots for this actor.
 * @param props.range - Currently visible date range.
 * @param props.onRangeChange - Called when the visible range changes.
 * @param props.onSelectRange - Called when the user drags an empty range.
 * @param props.onSelectBlock - Called when the user clicks an existing block.
 * @param props.headerActions - Extra controls rendered in the toolbar row (e.g. "Edit weekly hours"/"Block time").
 * @returns The time-off calendar element.
 */
export type AvailabilityBlocksCalendarProps = {
  availabilityWindows: AvailabilityWindow[];
  blocks: WithId<Slot>[];
  range: Range | undefined;
  onRangeChange: (range: Range) => void;
  onSelectRange: (start: Date, end: Date) => void;
  onSelectBlock: (slot: WithId<Slot>) => void;
  headerActions?: ReactNode;
};

export function AvailabilityBlocksCalendar(props: AvailabilityBlocksCalendarProps): JSX.Element {
  const { availabilityWindows, blocks, range, onRangeChange, onSelectRange, onSelectBlock } = props;
  const colorScheme = useComputedColorScheme();
  const controller = useCalendarController();

  const events = useMemo<EventInput[]>(() => {
    const backgroundBlocks: EventInput[] = range
      ? computeAvailabilityBlocks(availabilityWindows, range).map((b, i) => ({
          id: `avail-${i}`,
          start: b.start,
          end: b.end,
          display: 'background',
          className: calendarClasses.availabilityFree,
        }))
      : [];

    const blockEvents: EventInput[] = blocks
      .filter((s) => s.start && s.end)
      .map((slot) => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        title: slot.comment ?? 'Blocked',
        className: calendarClasses.slot,
        extendedProps: { slot },
      }));

    return [...backgroundBlocks, ...blockEvents];
  }, [availabilityWindows, blocks, range]);

  return (
    <div className={classes.wrapper}>
      <Group justify="space-between" pb="sm" className={classes.toolbar} wrap="wrap">
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
          <Title order={5}>{controller.view?.title}</Title>
        </Group>
        <Group gap="sm">
          {props.headerActions}
          <SegmentedControl
            size="xs"
            value={controller.view?.type}
            onChange={(v) => controller.changeView(v)}
            data={[
              { label: 'Month', value: 'dayGridMonth' },
              { label: 'Week', value: 'timeGridWeek' },
              { label: 'Day', value: 'timeGridDay' },
            ]}
          />
        </Group>
      </Group>

      <div className={classes.calendarHost}>
        <FullCalendar
          className={cx(calendarClasses.calendar, controller.view?.type)}
          height="100%"
          plugins={[timeGridPlugin, dayGridPlugin, themePlugin, interactionPlugin]}
          controller={controller}
          initialView="timeGridWeek"
          headerToolbar={false}
          allDaySlot={false}
          slotDuration="00:30:00"
          events={events}
          datesSet={(info) => onRangeChange({ start: info.start, end: info.end })}
          selectable
          select={(info) => onSelectRange(info.start, info.end)}
          eventClick={(info) => {
            const slot = (info.event.extendedProps as { slot?: WithId<Slot> }).slot;
            if (slot) {
              onSelectBlock(slot);
            }
          }}
          slotMinHeight={30}
          eventClass={calendarClasses.event}
          eventTimeClass={calendarClasses.eventTime}
          eventTitleClass={calendarClasses.eventTitle}
          eventInnerClass={calendarClasses.eventInner}
          backgroundEventClass={calendarClasses.backgroundEvent}
          backgroundEventInnerClass={calendarClasses.backgroundEventInner}
          colorScheme={colorScheme}
          nowIndicator
          eventTimeFormat={{ timeStyle: 'short' }}
        />
      </div>
    </div>
  );
}
