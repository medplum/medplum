// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ContextFn, Interval } from 'date-fns';
import { add as dateAdd, eachDayOfInterval } from 'date-fns';
import type { SchedulingParameters } from './scheduling-parameters';

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const dayNames: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Returns intervals of availability from a SchedulingParameters definition and a range of time
 *
 * @param schedulingParameters - The SchedulingParameters definition to evaluate
 * @param range - The Interval to return availability within
 * @param opts - Options to customize the result
 * @param opts.in - The timezone context to use in the function
 * @returns An array of intervals of availability
 */
export function resolveAvailability(
  schedulingParameters: SchedulingParameters,
  range: Interval,
  opts?: {
    in?: ContextFn<Date>;
  }
): Interval[] {
  return eachDayOfInterval(range, opts).flatMap((dayStart) => {
    const dayOfWeek = dayNames[dayStart.getDay()];
    return schedulingParameters.availability
      .filter((availability) => availability.dayOfWeek.includes(dayOfWeek))
      .flatMap((availability) =>
        availability.timeOfDay.map((timeOfDay) => {
          const [hours, minutes, seconds] = timeOfDay.split(':').map(Number);
          const start = dateAdd(dayStart, { hours, minutes, seconds });
          const end = dateAdd(start, { minutes: availability.duration });
          return { start, end };
        })
      );
  });
}
