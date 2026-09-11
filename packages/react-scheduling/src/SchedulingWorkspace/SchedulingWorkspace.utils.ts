// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';

/** The zones the calendars on show are kept in, and whether any of them is unknown. */
export interface CalendarTimezones {
  /** One entry per calendar whose zone could be read. */
  readonly timezones: string[];
  /** Whether any calendar's actor could not be read, leaving its zone untold. */
  readonly anyUnknown: boolean;
}

/**
 * Reads the zones the calendars on show are drawn for.
 *
 * A calendar's zone is read off its actor alone. A Schedule can also carry a zone per
 * service in its scheduling parameters, but nothing here names a service to pick between
 * them, and while a Schedule holds a single actor the actor's own zone is the one those
 * parameters are likely to agree with anyway.
 *
 * An actor that could not be read is reported as unknown rather than passed over. A
 * caller may be entitled to read a Schedule without being entitled to read its actor,
 * and the grid is drawn either way, so saying nothing would let times kept elsewhere be
 * read as the viewer's own. An actor that was read and simply names no zone is not that
 * case, and is passed over as before.
 *
 * @param candidates - The calendars on show.
 * @returns The zones that could be read, and whether any could not.
 */
export function getCalendarTimezones(candidates: readonly ScheduleCandidate[]): CalendarTimezones {
  const timezones: string[] = [];
  let anyUnknown = false;

  for (const candidate of candidates) {
    if (!candidate.actorResource) {
      anyUnknown = true;
      continue;
    }
    const timezone = getExtensionValue(candidate.actorResource, TimezoneExtensionURI);
    if (typeof timezone === 'string') {
      timezones.push(timezone);
    }
  }

  return { timezones, anyUnknown };
}
