// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventSourceInput } from '@fullcalendar/react';
import FullCalendar from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import {
  Checkbox,
  getThemeColor,
  Grid,
  LoadingOverlay,
  Stack,
  Title,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { getReferenceString, parseReference } from '@medplum/core';
import type { Appointment, Reference, ResourceType, Schedule, Slot } from '@medplum/fhirtypes';
import { ReferenceDisplay } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import type { Range } from '../../types/scheduling';
import classes from './SchedulingPage.module.css';

type ColorTheme = {
  appointment: string;
  slot: string;
};

const COLOR_THEMES: ColorTheme[] = [
  { appointment: 'indigo.7', slot: 'indigo.3' },
  { appointment: 'teal.7', slot: 'teal.3' },
  { appointment: 'orange.7', slot: 'orange.3' },
  { appointment: 'pink.7', slot: 'pink.3' },
  { appointment: 'violet.7', slot: 'violet.3' },
  { appointment: 'blue.7', slot: 'blue.3' },
  { appointment: 'cyan.7', slot: 'cyan.3' },
  { appointment: 'lime.7', slot: 'lime.3' },
  { appointment: 'yellow.7', slot: 'yellow.3' },
  { appointment: 'red.7', slot: 'red.3' },
  { appointment: 'grape.7', slot: 'grape.3' },
];

type EventInput = {
  title: string;
  start?: string;
  end?: string;
  display?: 'background';
};

function colorThemeForId(id: string): ColorTheme {
  // #HAX: assume ID is a UUID4 or UUID7; in either case the last 60 bits are random,
  // so we take a suffix from the ID, interpret the hex as a number, as treat that
  // value as the hash of the ID.
  const hash = parseInt(id.slice(id.length - 4), 16);
  return COLOR_THEMES[hash % COLOR_THEMES.length];
}

function appointmentToEvent(appointment: Appointment): EventInput {
  // Find the patient among the participants to use as title
  const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const name = patientParticipant ? patientParticipant.actor?.display : 'No Patient';
  const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status) ? ` (${appointment.status})` : '';

  return {
    title: `${name} ${status}`,
    start: appointment.start,
    end: appointment.end,
  };
}

function slotToEvent(slot: Slot): EventInput {
  return {
    title: slot.status === 'free' ? 'Available' : 'Blocked',
    start: slot.start,
    end: slot.end,
  };
}

type ActorChooserProps = {
  schedules: Schedule[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

export function ActorChooser(props: ActorChooserProps): JSX.Element {
  const actorsByType: Partial<Record<ResourceType, Reference[]>> = useMemo(() => {
    const result: Partial<Record<ResourceType, Reference[]>> = {};
    props.schedules.forEach((schedule) => {
      schedule.actor.forEach((actor) => {
        const actorType = parseReference(actor)[0];
        result[actorType] ||= [];
        result[actorType].push(actor);
      });
    });
    return result;
  }, [props.schedules]);

  return (
    <Stack gap="lg">
      {Object.entries(actorsByType).map(([resourceType, values]) => (
        <Stack gap="sm" key={resourceType}>
          <Title order={4}>{resourceType}</Title>
          {values.map((value) => {
            const ref = getReferenceString(value);
            if (!ref) {
              return null;
            }
            const color = colorThemeForId(ref);

            return (
              <Checkbox
                key={ref}
                checked={props.selected.includes(ref)}
                classNames={{ labelWrapper: classes.wideLabel }}
                label={<ReferenceDisplay value={value} link={false} />}
                color={color.appointment}
                onChange={(event) => {
                  if (event.target.checked) {
                    props.onChange([...props.selected, ref]);
                  } else {
                    props.onChange(props.selected.filter((s) => s !== ref));
                  }
                }}
              />
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Scheduling page that displays schedules for many actors.
 * @returns A React component that displays the schedule page.
 */
export function SchedulingPage(): JSX.Element | null {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const [range, setRange] = useState<Range | undefined>(undefined);

  // Q: should this use `{ _include: 'Schedule:actor' }`?
  const [allSchedules, allSchedulesLoading, allSchedulesOutcome] = useSearchResources<'Schedule'>('Schedule', {
    _count: 100,
  });
  useNotifyOnError(allSchedulesOutcome);

  const [searchParams, setSearchParams] = useSearchParams();

  const actors = useMemo(() => {
    return searchParams
      .getAll('actor')
      .filter((actorStr) =>
        allSchedules?.some((schedule) => schedule.actor.some((actorRef) => getReferenceString(actorRef) === actorStr))
      );
  }, [allSchedules, searchParams]);

  const selectedSchedules = useMemo(
    () =>
      allSchedules?.filter((schedule) =>
        schedule.actor.some((actor) => {
          const ref = getReferenceString(actor);
          return ref && actors.includes(ref);
        })
      ),
    [allSchedules, actors]
  );

  // Search for slots on any selected calendar in the given range.
  const [slots, slotsLoading, slotsOutcome] = useSearchResources(
    'Slot',
    selectedSchedules?.length && range
      ? [
          ['_count', '1000'],
          ['schedule', selectedSchedules.map((schedule) => getReferenceString(schedule)).join(',')],
          ['start', `ge${range.start.toISOString()}`],
          ['start', `le${range.end.toISOString()}`],
          ['status', 'free,busy-unavailable'],
        ]
      : undefined,
    { enabled: !!selectedSchedules?.length && !!range }
  );
  useNotifyOnError(slotsOutcome);

  // Search for appointments related to any selected actor in the given range.
  const [appointments, appointmentsLoading, appointmentsOutcome] = useSearchResources(
    'Appointment',
    actors.length && range
      ? [
          ['_count', '1000'],
          ['actor', actors.join(',')],
          ['date', `ge${range.start.toISOString()}`],
          ['date', `le${range.end.toISOString()}`],
          ['status:not', 'cancelled'],
        ]
      : undefined,
    { enabled: !!actors.length && !!range }
  );
  useNotifyOnError(appointmentsOutcome);

  // Q: SchedulePage.tsx merged overlapping slots on a single calendar into a
  // single display slot; is that desirable in the multi-calendar view?

  const loading = allSchedulesLoading || slotsLoading || appointmentsLoading;

  const eventSources = useMemo(() => {
    return actors.flatMap((actor) => {
      const colorTheme = colorThemeForId(actor);
      const apts = (appointments ?? []).filter((appointment) =>
        appointment.participant.some(
          (participant) => participant.actor && getReferenceString(participant.actor) === actor
        )
      );

      const appointmentSource = {
        events: apts.map((apt) => appointmentToEvent(apt)),
        color: getThemeColor(colorTheme.appointment, theme),
      } satisfies EventSourceInput;

      const scheduleRefs = new Set(
        allSchedules
          ?.filter((schedule) => schedule.actor.some((x) => getReferenceString(x) === actor))
          .map((schedule) => getReferenceString(schedule))
      );

      const mySlots = (slots ?? []).filter((slot) => scheduleRefs.has(getReferenceString(slot.schedule) as string));

      const slotSource = {
        events: mySlots.map(slotToEvent),
        color: getThemeColor(colorTheme.slot, theme),
      };

      return [appointmentSource, slotSource];
    });
  }, [appointments, slots, allSchedules, actors, theme]);

  return (
    <Grid gutter="md" p="md">
      <Grid.Col span={3}>
        <ActorChooser
          schedules={allSchedules ?? []}
          selected={actors}
          onChange={(actor: string[]) => setSearchParams({ actor })}
        />
      </Grid.Col>
      <Grid.Col span="auto" pos="relative">
        <LoadingOverlay visible={loading} />
        <FullCalendar
          plugins={[themePlugin, timeGridPlugin]}
          initialView="timeGridWeek"
          datesSet={setRange}
          eventSources={eventSources}
          slotDuration="00:15:00"
          height="95vh"
          headerToolbar={{
            left: 'title',
            right: 'prev,today,next',
          }}
          allDaySlot={false}
          colorScheme={colorScheme}
        />
      </Grid.Col>
    </Grid>
  );
}
