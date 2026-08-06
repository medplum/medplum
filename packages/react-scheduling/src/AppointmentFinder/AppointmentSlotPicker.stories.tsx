// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SimpleGrid } from '@mantine/core';
import type { Appointment } from '@medplum/fhirtypes';
import { CalendarDateInput, Document } from '@medplum/react';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { withMockedDate } from '../stories/decorators';
import { buildProposedAppointment } from '../stories/scheduling';
import type { AppointmentSelectionOptions } from './AppointmentCustomTimeCard';
import type { ActorCombination } from './AppointmentFinder.utils';
import { getActorsKey } from './AppointmentFinder.utils';
import type { CustomTimeConfig } from './AppointmentSlotPicker';
import { AppointmentSlotPicker } from './AppointmentSlotPicker';

export default {
  title: 'Medplum/AppointmentSlotPicker',
  component: AppointmentSlotPicker,
  decorators: [withMockedDate],
} as Meta;

/** The clinic keeps Eastern hours, which are UTC-4 in May. */
const TIMEZONE = 'America/New_York';

/** A reference carrying the display `$find` fills in from the Schedule's actor. */
interface StoryActor {
  readonly reference: string;
  readonly display: string;
}

const RIVERA: StoryActor = { reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' };
const OKAFOR: StoryActor = { reference: 'Practitioner/dr-okafor', display: 'Dr. Ada Okafor' };
const ROOM_A: StoryActor = { reference: 'Location/exam-room-a', display: 'Procedure Room A' };
const ROOM_B: StoryActor = { reference: 'Location/exam-room-b', display: 'Procedure Room B' };
const ULTRASOUND_1: StoryActor = { reference: 'Device/ultrasound-1', display: 'Ultrasound 1' };
const ULTRASOUND_2: StoryActor = { reference: 'Device/ultrasound-2', display: 'Ultrasound 2' };

const TUESDAY = buildTimes('2020-05-05', [RIVERA], ['13:00', '13:30', '14:00', '15:00']);
const WEDNESDAY = buildTimes('2020-05-06', [OKAFOR], ['14:00', '17:00']);
const THURSDAY = buildTimes('2020-05-07', [RIVERA], ['13:00', '17:30']);

/**
 * A search naming a service but no room or device, which is answered with every
 * way of holding the visit — including the same provider in two different rooms.
 */
const TEAM_TIMES = [
  ...buildTimes('2020-05-05', [RIVERA, ROOM_A, ULTRASOUND_1], ['16:30', '16:45', '17:30', '17:45']),
  ...buildTimes('2020-05-05', [OKAFOR, ROOM_B, ULTRASOUND_2], ['16:30', '16:45', '17:30']),
  ...buildTimes('2020-05-05', [RIVERA, ROOM_B, ULTRASOUND_2], ['18:30', '18:45']),
  ...buildTimes('2020-05-06', [RIVERA, ROOM_A, ULTRASOUND_1], ['16:30', '17:30', '17:45']),
  ...buildTimes('2020-05-06', [OKAFOR, ROOM_B, ULTRASOUND_2], ['16:45', '18:30']),
  ...buildTimes('2020-05-07', [OKAFOR, ROOM_A, ULTRASOUND_1], ['16:30', '16:45']),
];

/** The days `TEAM_TIMES` has anything on, which is what the calendar fills in. */
const TEAM_DAYS = [new Date(2020, 4, 5), new Date(2020, 4, 6), new Date(2020, 4, 7)];

/** A stretch of days asked about, at local midnight. */
interface DayRange {
  readonly start: Date;
  readonly end: Date;
}

/** Holding a time on Dr. Rivera, which is what a request for one would be for. */
const CUSTOM_TIME: CustomTimeConfig = {
  options: [
    {
      // Keyed the way the offered times are, so that asking for one of them is
      // answered with the offer rather than with a warning about overriding it.
      key: getActorsKey([RIVERA]),
      label: 'Dr. Maya Rivera',
      actors: [RIVERA],
      schedules: [{ reference: 'Schedule/schedule-dr-rivera' }],
    } satisfies ActorCombination,
  ],
  durationMinutes: 30,
};

/**
 * Builds the times one set of actors is offering on one day.
 * @param day - The calendar day, as `YYYY-MM-DD`.
 * @param actors - Who the times are with.
 * @param times - The times, on the clinic's own clock.
 * @returns The proposed appointments.
 */
function buildTimes(day: string, actors: readonly StoryActor[], times: readonly string[]): Appointment[] {
  return times.map((time) => buildProposedAppointment({ start: `${day}T${time}:00.000Z`, actorReferences: actors }));
}

/**
 * The picker, holding the time that was chosen.
 * @param props - The React props.
 * @param props.appointments - The times the search found.
 * @param props.daysShown - How many days of times to show at once.
 * @param props.customTime - What a request for an unoffered time would book.
 * @param props.customTimeDay - The day such a request falls on.
 * @param props.loading - Whether the search is still running.
 * @param props.error - Why the search failed.
 * @returns The picker.
 */
function Picker(props: {
  readonly appointments: readonly Appointment[];
  readonly daysShown?: number;
  readonly customTime?: CustomTimeConfig;
  readonly customTimeDay?: Date;
  readonly loading?: boolean;
  readonly error?: Error;
}): JSX.Element {
  const [selected, setSelected] = useState<Appointment>();

  function handleSelect(appointment: Appointment, options: AppointmentSelectionOptions): void {
    console.log(options.available ? 'Selected' : 'Selected an unavailable time', appointment.start);
    setSelected(appointment);
  }

  return (
    <Document>
      <AppointmentSlotPicker
        appointments={props.appointments}
        timezone={TIMEZONE}
        daysShown={props.daysShown}
        customTime={props.customTime}
        customTimeDay={props.customTimeDay}
        loading={props.loading}
        error={props.error}
        selected={selected}
        onSelectAppointment={handleSelect}
      />
    </Document>
  );
}

/**
 * The default: one day at a time, even where the search covered several.
 *
 * The answer a scheduler is usually after is the soonest time that works, which
 * is on the first day that has any. A month of times is a page nobody reads.
 * @returns The story.
 */
export const Basic = (): JSX.Element => <Picker appointments={[...TUESDAY, ...WEDNESDAY, ...THURSDAY]} />;

/**
 * Someone comparing days rather than taking the first free one. The caller says
 * so by widening `daysShown` to the range that was asked for.
 * @returns The story.
 */
export const SeveralDays = (): JSX.Element => (
  <Picker appointments={[...TUESDAY, ...WEDNESDAY, ...THURSDAY]} daysShown={3} />
);

/**
 * A user allowed to overrule the schedule. Asking for a time stays behind a link,
 * since it is the rare way through — and asking for one that is already offered
 * is answered with that offer rather than with a warning.
 * @returns The story.
 */
export const SpecificTimeRequests = (): JSX.Element => <Picker appointments={TUESDAY} customTime={CUSTOM_TIME} />;

/**
 * Nothing on offer, which is where asking for a time matters most and so is the
 * one case where the card is open from the start. The day it asks about has to
 * come from the caller, because there are no times left to infer it from.
 * @returns The story.
 */
export const NoTimes = (): JSX.Element => (
  <Picker appointments={[]} customTime={CUSTOM_TIME} customTimeDay={new Date(2020, 4, 5)} />
);

/**
 * Nothing on offer and no way to ask, so the hint points at another search.
 * @returns The story.
 */
export const NoTimesAndNoWayToAsk = (): JSX.Element => <Picker appointments={[]} />;

export const Loading = (): JSX.Element => <Picker appointments={[]} loading />;

export const Failed = (): JSX.Element => <Picker appointments={[]} error={new Error('Schedule is unavailable')} />;

/**
 * The two-column "find a time" panel, assembled from a calendar and a picker.
 *
 * This is the arrangement a host builds rather than one the library ships: the
 * calendar says which days to search, and the picker lists what came back across
 * them. Drag or shift-click to widen the range, which widens the list, since
 * `daysShown` is the caller's answer to how many days it asked about.
 * @returns The story.
 */
export const BesideACalendar = (): JSX.Element => {
  const [range, setRange] = useState<DayRange>({ start: TEAM_DAYS[0], end: TEAM_DAYS[0] });
  const [selected, setSelected] = useState<Appointment>();

  const asked = TEAM_TIMES.filter((appointment) => isWithin(new Date(appointment.start as string), range));

  return (
    <Document>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <CalendarDateInput
          availableDates={TEAM_DAYS}
          range={range}
          allowUnavailableDates
          onChangeMonth={(date: Date) => console.log(date)}
          onClick={(date: Date) => setRange({ start: date, end: date })}
          onSelectRange={(start: Date, end: Date) => setRange({ start, end })}
        />
        <AppointmentSlotPicker
          appointments={asked}
          timezone={TIMEZONE}
          daysShown={countDays(range)}
          selected={selected}
          onSelectAppointment={setSelected}
        />
      </SimpleGrid>
    </Document>
  );
};

/**
 * Whether an instant falls on one of the days asked about.
 * @param date - The instant to place.
 * @param range - The days asked about, at local midnight.
 * @returns True when the day is in the range.
 */
function isWithin(date: Date, range: DayRange): boolean {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return day >= range.start.getTime() && day <= range.end.getTime();
}

/**
 * Counts the days a range covers, both ends included.
 * @param range - The days asked about, at local midnight.
 * @returns How many days to show.
 */
function countDays(range: DayRange): number {
  return Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1;
}

const DAY_MS = 24 * 60 * 60 * 1000;
