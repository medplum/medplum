// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Loader, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { arrayify, getReferenceString, isDefined, isReference, isResource, normalizeErrorString } from '@medplum/core';
import type { Period, Practitioner, Reference, Resource, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDateInput } from '../CalendarDateInput/CalendarDateInput';
import { getStartMonth } from '../CalendarDateInput/CalendarDateInput.utils';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceName } from '../ResourceName/ResourceName';
import classes from './Scheduler.module.css';

export type SchedulingOption<T> = [T, Date];
export type FetchOptionsFunction<T> = (period: Period) => Promise<SchedulingOption<T>[]>;

export interface BaseSchedulerProps<T> {
  /** A Reference or Resource to the actor being scheduled against (typically a Practitioner) */
  readonly actor?: Reference | Resource;
  /** A function that fetches SchedulingOption pairs. If this is not a stable function it can cause duplicate queries. */
  readonly fetchOptions: FetchOptionsFunction<T>;
  /** React nodes to render inside the scheduler container */
  readonly children?: React.ReactNode;
  /** A callback invoked when a specific option is selected */
  readonly onSelectOption?: (el: T, date: Date) => void;
}

/**
 * A generic widget to choose an option by date/time. Renders a monthly
 * calendar UI and lets the viewer drill down into options on a given day.
 *
 * @param props - The React props
 * @returns the JSX Element
 */
export function BaseScheduler<T>(props: BaseSchedulerProps<T>): JSX.Element | null {
  const [month, setMonth] = useState(getStartMonth);
  const [date, setDate] = useState<Date>();
  const [options, setOptions] = useState<SchedulingOption<T>[]>();
  const [selectedOption, setSelectedOption] = useState<SchedulingOption<T>>();

  const { fetchOptions, onSelectOption } = props;

  useEffect(() => {
    let active = true;

    async function doSearch(): Promise<void> {
      const start = getStart(month);
      const end = getEnd(month);
      const options = await fetchOptions({ start, end });
      if (active) {
        setOptions(options);
      }
    }

    doSearch().catch(console.error);

    return () => {
      active = false;
    };
  }, [fetchOptions, month]);

  const handleSelectOption = useCallback(
    (option: SchedulingOption<T>) => {
      setSelectedOption(option);
      onSelectOption?.(...option);
    },
    [onSelectOption]
  );

  // Restrict to options with unique start times inside the selected day
  const filteredOptions = useMemo(() => {
    if (!date || !options) {
      return [];
    }
    const start = date.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const seen = new Set<number>();
    return options.filter(([_, optionDate]) => {
      const optionTime = optionDate.getTime();
      if (seen.has(optionTime)) {
        return false;
      }
      seen.add(optionTime);
      return start <= optionTime && optionTime < end;
    });
  }, [date, options]);

  if (!options) {
    return (
      <div className={classes.container} data-testid="scheduler">
        <Loader />
      </div>
    );
  }

  return (
    <div className={classes.container} data-testid="scheduler">
      <div className={classes.info}>
        {props.actor && <ResourceAvatar value={props.actor} size="xl" />}
        {props.actor && (
          <Text size="xl" fw={500}>
            <ResourceName value={props.actor} />
          </Text>
        )}
        <p>1 hour</p>
        {date && <p>{date.toLocaleDateString()}</p>}
        {selectedOption && <p>{formatTime(selectedOption[1])}</p>}
      </div>
      <div className={classes.selection}>
        {!date && (
          <div>
            <h3>Select date</h3>
            <CalendarDateInput
              availableDates={options.map((opt) => opt[1])}
              onChangeMonth={setMonth}
              onClick={setDate}
            />
          </div>
        )}
        {date && !selectedOption && (
          <div>
            <h3>Select time</h3>
            <Stack>
              {filteredOptions.map((option) => (
                <div key={option[1].toISOString()}>
                  <Button variant="outline" style={{ width: 150 }} onClick={() => handleSelectOption(option)}>
                    {formatTime(option[1])}
                  </Button>
                </div>
              ))}
            </Stack>
          </div>
        )}
        {props.children}
      </div>
    </div>
  );
}

/**
 * Custom function to search for available slots within a given time period
 * @param period - The time period to search within
 * @returns Promise resolving to an array of available slots
 */
export type SlotSearchFunction = (period: Period) => Promise<Slot[]>;
export interface SchedulerProps {
  readonly schedule?: Schedule | Reference<Schedule> | Schedule[] | Reference<Schedule>[];
  fetchSlots?: SlotSearchFunction;
  onSelectSlot?: (slot: Slot) => void;
  children?: React.ReactNode;
}

// Finds the first entry in Schedule.actor of type Reference<Practitioner>
function onlyPractitioner(schedule: Schedule): Reference<Practitioner> | undefined {
  const refs = schedule.actor.filter((ref) => isReference<Practitioner>(ref, 'Practitioner'));
  if (refs.length === 1) {
    return refs[0];
  }
  return undefined;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const medplum = useMedplum();
  const { fetchSlots, schedule } = props;
  const [actor, setActor] = useState<Reference<Practitioner> | undefined>();

  const fetchOptions = useCallback(
    async (period: Period): Promise<SchedulingOption<Slot>[]> => {
      // use custom slot fetching function when provided
      if (fetchSlots) {
        const slots = await fetchSlots(period);
        return slots.map((slot) => [slot, new Date(slot.start)]);
      }

      // default search: find slots on the schedules passed in
      const scheduleRefs = arrayify(schedule ?? [])
        .map(getReferenceString)
        .filter(isDefined);

      const slotSearchParams = new URLSearchParams([
        ['_count', (30 * 24).toString()],
        ['schedule', scheduleRefs.join(',')],
        ['start', 'gt' + period.start],
        ['start', 'lt' + period.end],
      ]);
      const slots = await medplum.searchResources('Slot', slotSearchParams);
      return slots.map((slot) => [slot, new Date(slot.start)]);
    },
    [medplum, fetchSlots, schedule]
  );

  useEffect(() => {
    const schedules = arrayify(props.schedule);
    if (schedules?.length !== 1) {
      return;
    }
    const schedule = schedules[0];
    if (isResource(schedule)) {
      setActor(onlyPractitioner(schedule));
    } else {
      medplum
        .readReference(schedule)
        .then((schedule) => {
          setActor(onlyPractitioner(schedule));
        })
        .catch((error: unknown) => {
          showNotification({
            color: 'red',
            title: 'Error',
            message: normalizeErrorString(error),
          });
        });
    }
  }, [medplum, props.schedule]);

  return (
    <BaseScheduler fetchOptions={fetchOptions} onSelectOption={props.onSelectSlot} actor={actor}>
      {props.children}
    </BaseScheduler>
  );
}

function getStart(month: Date): string {
  return formatSlotInstant(month.getTime());
}

function getEnd(month: Date): string {
  return formatSlotInstant(month.getTime() + 31 * 24 * 60 * 60 * 1000);
}

function formatSlotInstant(time: number): string {
  const date = new Date(Math.max(Date.now(), time));
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
