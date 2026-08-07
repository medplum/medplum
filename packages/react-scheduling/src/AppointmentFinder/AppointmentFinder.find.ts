// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { isDefined } from '@medplum/core';
import type { Appointment, Bundle } from '@medplum/fhirtypes';
import { MAX_FIND_WINDOW_DAYS, addDays, endOfDay } from './AppointmentFinder.times';

/** How many days one search covers, and how much further loading more reaches. */
export const DEFAULT_FIND_PAGE_DAYS = 14;

/**
 * The most days a page may cover. A day under the operation's limit, because a
 * page that ends at the close of a day spans an extra hour across a daylight
 * saving change and `$find` counts those hours.
 */
const MAX_PAGE_DAYS = MAX_FIND_WINDOW_DAYS - 1;

export interface FindWindow {
  readonly start: Date;
  readonly end: Date;
}

/**
 * How many times one `$find` request asks for.
 *
 * The operation's own default is 20, which is a morning rather than a page, and
 * it fills the window from the front: a request left at the default would answer
 * a fortnight with the first day of it and quietly leave the rest looking empty.
 * The ceiling the server allows is 1000.
 */
export const DEFAULT_FIND_COUNT = 500;

/** What one `$find` request asks for. */
export interface FindRequest {
  /** The service being booked, as a reference string. */
  readonly service: string;
  /** Schedules to intersect. A time is offered only when all of them are free. */
  readonly schedules: readonly string[];
  readonly start: Date;
  readonly end: Date;
  /** Most times to return. Defaults to `DEFAULT_FIND_COUNT`. */
  readonly count?: number;
}

export interface FindAppointmentsOptions {
  /** Aborts the request. */
  readonly signal?: AbortSignal;
}

/**
 * Runs one `Appointment/$find` request.
 *
 * Shared so that the two searches the finder runs — the times being read and the
 * scan behind the calendar's marks — ask in exactly the same way, and differ only
 * in the window and the count they pass.
 *
 * @param medplum - The Medplum client.
 * @param request - What to ask for.
 * @param options - Fetch options.
 * @returns The proposed appointments, and whether the count cut them short.
 */
export async function findAppointments(
  medplum: MedplumClient,
  request: FindRequest,
  options?: FindAppointmentsOptions
): Promise<{ appointments: Appointment[]; truncated: boolean }> {
  const count = request.count ?? DEFAULT_FIND_COUNT;
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.append('start', request.start.toISOString());
  url.searchParams.append('end', request.end.toISOString());
  url.searchParams.append('service-type-reference', request.service);
  for (const schedule of request.schedules) {
    url.searchParams.append('schedule', schedule);
  }
  url.searchParams.append('_count', count.toString());

  const bundle = await medplum.get<Bundle<Appointment>>(url, { signal: options?.signal });
  const appointments = (bundle.entry ?? []).map((entry) => entry.resource).filter(isDefined);
  // A full page means the window was answered as far as the count reached and no
  // further, which is not the same as there being nothing after it.
  return { appointments, truncated: appointments.length >= count };
}

/**
 * Returns one page of a search, working forwards from where it starts.
 *
 * `$find` refuses a range longer than 31 days, and a user is not asking to read
 * a month of times at once anyway, so a search runs a couple of weeks at a time
 * and reaches further out only when asked to. Pages end at the close of a day,
 * which keeps each one whole days long and lets how far the search has reached
 * be named as a date.
 *
 * @param start - Where the whole search begins.
 * @param end - Where the whole search ends, or undefined to keep reaching further out.
 * @param index - Which page to return, counting from zero.
 * @param pageDays - Days per page. Defaults to a fortnight, capped near the operation's limit.
 * @returns The window to search, or undefined once the range is used up.
 */
export function getFindWindow(
  start: Date,
  end: Date | undefined,
  index: number,
  pageDays = DEFAULT_FIND_PAGE_DAYS
): FindWindow | undefined {
  const days = Math.min(Math.max(Math.floor(pageDays), 1), MAX_PAGE_DAYS);
  // The first page opens at the requested instant, so a search starting midway
  // through today does not offer times that have already passed.
  const from = index <= 0 ? start : endOfDay(addDays(start, index * days - 1));
  const until = endOfDay(addDays(start, (index + 1) * days - 1));
  if (end && end < until) {
    return end > from ? { start: from, end } : undefined;
  }
  return { start: from, end: until };
}
