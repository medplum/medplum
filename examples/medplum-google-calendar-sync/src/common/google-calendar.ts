// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * A thin client for the Google Calendar events API on the practitioner's primary calendar:
 * plain `fetch`, no SDK, so Bots bundle nothing extra. Every write passes `sendUpdates=none`;
 * New mirrors have no attendees. Writes replace the whole event (PUT): patch keeps
 * omitted fields, which would let a location or description linger after a detail-level
 * downgrade.
 */

import type { OwnershipStore } from './ownership';
import { sleep } from '@medplum/core';
import type { GoogleCalendarEvent } from './mapping';
import { EVENT_PROPERTY } from './constants';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
/** Statuses retried with backoff: quota (Google uses 403 for some quota errors), rate limit, and server errors. */
const RETRYABLE_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const QUOTA_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);
const MAX_BACKOFF_MS = 32_000;

/** A failed Google API call, with the status and Google's `reason` for callers to branch on. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | undefined,
    message: string,
    readonly retryAt?: number
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }

  /**
   * 404 and 410: the event is gone, or was never there.
   * @returns True when the event doesn't exist.
   */
  get isNotFound(): boolean {
    return this.status === 404 || this.status === 410;
  }

  /**
   * 409: an event with this ID already exists, possibly as a deleted tombstone.
   * @returns True when the ID is taken.
   */
  get isDuplicate(): boolean {
    return this.status === 409 || this.reason === 'duplicate';
  }
}

/** What `upsertEvent` did. */
export type UpsertOutcome = 'inserted' | 'replaced';

interface GoogleErrorBody {
  error?: { message?: string; errors?: { reason?: string }[] };
}

async function readError(response: Response): Promise<GoogleApiError> {
  let body: GoogleErrorBody = {};
  try {
    body = (await response.json()) as GoogleErrorBody;
  } catch {
    // Not JSON; the status is all we have.
  }
  const reason = body.error?.errors?.[0]?.reason;
  const retryAfter = response.headers.get('retry-after');
  let retryAt: number | undefined;
  if (retryAfter) {
    retryAt = Number.isFinite(Number(retryAfter)) ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter);
  }
  // Error bodies can echo submitted event content. Keep logs to status and classification.
  return new GoogleApiError(
    response.status,
    reason,
    `Google Calendar ${response.status}: ${reason ?? 'request failed'}`,
    Number.isFinite(retryAt) ? retryAt : undefined
  );
}

export class GoogleCalendarClient {
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly beforeRequest?: () => Promise<void>;
  private readonly ownership?: OwnershipStore;

  constructor(
    private readonly accessToken: string,
    options?: {
      maxRetries?: number;
      fetch?: typeof fetch;
      beforeRequest?: () => Promise<void>;
      ownership?: OwnershipStore;
    }
  ) {
    this.beforeRequest = options?.beforeRequest;
    this.ownership = options?.ownership;
    this.maxRetries = options?.maxRetries ?? 3;
    this.fetchImpl = options?.fetch ?? globalThis.fetch;
  }

  /**
   * Reads one event. Deleted events come back with `status: cancelled`.
   * @param eventId - The event ID.
   * @returns The event, or undefined on 404/410.
   */
  async getEvent(eventId: string): Promise<GoogleCalendarEvent | undefined> {
    try {
      return await this.request<GoogleCalendarEvent>('GET', `${EVENTS_URL}/${encodeURIComponent(eventId)}`);
    } catch (err) {
      if (err instanceof GoogleApiError && err.isNotFound) {
        return undefined;
      }
      throw err;
    }
  }

  async insertEvent(event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>('POST', `${EVENTS_URL}?sendUpdates=none`, event);
  }

  /**
   * Replaces an event wholesale. Omitted fields are cleared, which is the point: a field a
   * practitioner edited, or one a lower detail level no longer sends, must not survive. A
   * deleted tombstone comes back to life when replaced with `status: confirmed`.
   * @param eventId - The event ID.
   * @param event - The full body.
   * @param etag - Version read during the ownership check.
   * @returns The stored event.
   */
  async updateEvent(eventId: string, event: GoogleCalendarEvent, etag?: string): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      'PUT',
      `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`,
      event,
      etag
    );
  }

  /**
   * Deletes an event. Already gone (404/410) counts as done.
   * @param eventId - The event ID.
   * @param etag - Version read during the ownership check.
   */
  async deleteEvent(eventId: string, etag?: string): Promise<void> {
    try {
      await this.request<undefined>(
        'DELETE',
        `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`,
        undefined,
        etag
      );
    } catch (err) {
      if (!(err instanceof GoogleApiError && err.isNotFound)) {
        throw err;
      }
    }
  }

  /**
   * Lists every event matching the private properties, following pagination.
   * @param privateExtendedProperty - `key=value` filters, ANDed by Google.
   * @returns Every matching event.
   */
  async listEvents(privateExtendedProperty: string[]): Promise<GoogleCalendarEvent[]> {
    const events: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ singleEvents: 'false', maxResults: '250' });
      for (const property of privateExtendedProperty) {
        query.append('privateExtendedProperty', property);
      }
      if (pageToken) {
        query.set('pageToken', pageToken);
      }
      const page = await this.request<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(
        'GET',
        `${EVENTS_URL}?${query.toString()}`
      );
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return events;
  }

  /**
   * Makes the calendar hold exactly `event`: insert, and when the ID is already taken (live
   * or as a deleted tombstone) replace it.
   * @param event - The body the mapping produced.
   * @returns What was done.
   */
  async upsertEvent(event: GoogleCalendarEvent): Promise<UpsertOutcome> {
    try {
      await this.insertEvent(event);
      await this.ownership?.remember(event);
      return 'inserted';
    } catch (err) {
      if (!(err instanceof GoogleApiError && err.isDuplicate)) {
        throw err;
      }
    }
    const existing = await this.getEvent(event.id);
    const properties = existing?.extendedProperties?.private;
    const strippedTombstone =
      existing?.status === 'cancelled' && !Object.values(EVENT_PROPERTY).some((key) => properties?.[key] !== undefined);
    if (!(strippedTombstone && (await this.ownership?.has(event)))) {
      assertEventOwnership(existing, event.extendedProperties.private);
    }
    await this.ownership?.remember(event);
    await this.updateEvent(event.id, event, requireEtag(existing));
    return 'replaced';
  }

  /**
   * Ownership and an ETag precondition protect against collisions and concurrent edits.
   * @param eventId - Event to remove.
   * @param owner - Expected project, source and connection properties.
   */
  async deleteOwnedEvent(eventId: string, owner: Record<string, string>): Promise<void> {
    const existing = await this.getEvent(eventId);
    if (!existing) {
      return;
    }
    assertEventOwnership(existing, owner);
    await this.deleteEvent(eventId, requireEtag(existing));
  }

  /**
   * A complete bounded snapshot, with recurring instances expanded by Google.
   * @param start - Inclusive horizon start.
   * @param end - Exclusive horizon end.
   * @returns All pages and the resolved calendar ID; never a partial snapshot.
   */
  async listBusyEvents(start: string, end: string): Promise<{ calendarId: string; events: RemoteCalendarEvent[] }> {
    const events: RemoteCalendarEvent[] = [];
    let pageToken: string | undefined;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams({ singleEvents: 'true', timeMin: start, timeMax: end, maxResults: '250' });
      if (pageToken) {
        if (seen.has(pageToken)) {
          throw new Error('Google repeated an event page token');
        }
        seen.add(pageToken);
        query.set('pageToken', pageToken);
      }
      const page = await this.request<{ summary?: string; items?: RemoteCalendarEvent[]; nextPageToken?: string }>(
        'GET',
        `${EVENTS_URL}?${query}`
      );
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    // Resolve the primary alias through calendars.get; event organizers may be invitation senders.
    const calendar = await this.request<{ id: string }>(
      'GET',
      'https://www.googleapis.com/calendar/v3/calendars/primary'
    );
    const calendarId = calendar.id;
    if (!calendarId || calendarId === 'primary') {
      throw new Error('Google did not return the primary calendar identity');
    }
    return { calendarId, events };
  }

  async watchEvents(
    id: string,
    token: string,
    address: string
  ): Promise<{ id: string; resourceId: string; expiration: string }> {
    return this.request('POST', `${EVENTS_URL}/watch`, {
      id,
      token,
      address,
      type: 'web_hook',
      params: { ttl: '604800' },
    });
  }

  async stopChannel(id: string, resourceId: string): Promise<void> {
    try {
      await this.request('POST', 'https://www.googleapis.com/calendar/v3/channels/stop', { id, resourceId });
    } catch (err) {
      if (!(err instanceof GoogleApiError && err.isNotFound)) {
        throw err;
      }
    }
  }

  private async request<T>(method: string, url: string, body?: unknown, etag?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.beforeRequest?.();
      const response = await this.fetchImpl(url, {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...(etag ? { 'If-Match': etag } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const text = await response.text();
        return text ? (JSON.parse(text) as T) : (undefined as T);
      }

      const error = await readError(response);
      const retryable =
        RETRYABLE_STATUSES.has(error.status) && (error.status !== 403 || QUOTA_REASONS.has(error.reason ?? ''));
      if (!retryable || attempt >= this.maxRetries) {
        throw error;
      }
      const retryMs = Math.max(0, (error.retryAt ?? 0) - Date.now());
      if (retryMs > MAX_BACKOFF_MS) {
        // Preserve the vendor deadline for the next worker instead of sleeping past our runtime budget.
        throw error;
      }
      const delayMs = Math.max(Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS), retryMs);
      console.warn(`Google Calendar ${method} ${error.status}; retrying in ${delayMs}ms (attempt ${attempt + 1})`);
      await sleep(delayMs);
    }
  }
}

/** Read shape: Google tombstones and all-day events omit fields required for outbound writes. */
export interface RemoteCalendarEvent {
  id: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

export function assertEventOwnership(event: GoogleCalendarEvent | undefined, owner: Record<string, string>): void {
  const props = event?.extendedProperties?.private;
  if (
    !props ||
    !owner[EVENT_PROPERTY.project] ||
    !owner[EVENT_PROPERTY.source] ||
    props[EVENT_PROPERTY.project] !== owner[EVENT_PROPERTY.project] ||
    props[EVENT_PROPERTY.source] !== owner[EVENT_PROPERTY.source] ||
    (owner[EVENT_PROPERTY.connection] !== undefined &&
      props[EVENT_PROPERTY.connection] !== owner[EVENT_PROPERTY.connection])
  ) {
    throw new Error('Google event identity collision: ownership does not match');
  }
}

function requireEtag(event: GoogleCalendarEvent | undefined): string {
  if (!event?.etag) {
    throw new Error('Google event has no ETag; refusing an unguarded write');
  }
  return event.etag;
}
