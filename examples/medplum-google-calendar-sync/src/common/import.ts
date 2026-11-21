// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import type { Schedule, Slot } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import { EVENT_PROPERTY, IMPORT_IDENTIFIER_SYSTEM } from './constants';
import type { GoogleCalendarClient, RemoteCalendarEvent } from './google-calendar';
import { projectQuery } from './project';
import type { SyncRange } from './range-sync';
import { ifMatch } from './versioning';

/** v1 + base64url(JSON tuple): delimiters in vendor IDs cannot alias another identity. */
export interface ImportedIdentity {
  connectionId: string;
  calendarId: string;
  eventId: string;
  scheduleRef: string;
}

export function importIdentifier(identity: ImportedIdentity): string {
  return (
    'v1.' +
    Buffer.from(
      JSON.stringify([identity.connectionId, identity.calendarId, identity.eventId, identity.scheduleRef])
    ).toString('base64url')
  );
}

export function readImportedIdentity(slot: Slot): ImportedIdentity | undefined {
  const ids = slot.identifier?.filter((id) => id.system === IMPORT_IDENTIFIER_SYSTEM) ?? [];
  if (ids.length !== 1 || !ids[0].value?.startsWith('v1.')) {
    return undefined;
  }
  try {
    const parts: unknown = JSON.parse(Buffer.from(ids[0].value.slice(3), 'base64url').toString());
    if (!Array.isArray(parts) || parts.length !== 4 || !parts.every((p) => typeof p === 'string' && p.length > 0)) {
      return undefined;
    }
    const [connectionId, calendarId, eventId, scheduleRef] = parts as string[];
    const identity = { connectionId, calendarId, eventId, scheduleRef };
    return importIdentifier(identity) === ids[0].value && /^Schedule\/[A-Za-z0-9.-]+$/.test(scheduleRef)
      ? identity
      : undefined;
  } catch {
    return undefined;
  }
}

export interface BusyInterval {
  eventId: string;
  start: string;
  end: string;
}

/**
 * Exclusions are intentional; malformed timed data aborts the snapshot instead of deleting blocks.
 * @param event - A Google event or expanded recurring occurrence.
 * @param projectId - Current project, whose own mirrors must be excluded.
 * @returns Its UTC busy interval, or undefined for an excluded event.
 */
export function busyInterval(event: RemoteCalendarEvent, projectId?: string): BusyInterval | undefined {
  if (
    event.status === 'cancelled' ||
    event.transparency === 'transparent' ||
    event.start?.date ||
    event.end?.date ||
    event.attendees?.some((a) => a.self && a.responseStatus === 'declined') ||
    (projectId &&
      event.extendedProperties?.private?.[EVENT_PROPERTY.project] === projectId &&
      event.extendedProperties.private[EVENT_PROPERTY.source])
  ) {
    return undefined;
  }
  const start = Date.parse(event.start?.dateTime ?? '');
  const end = Date.parse(event.end?.dateTime ?? '');
  if (!event.id || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Google returned a malformed timed event; imported blocks retained');
  }
  if (end === start) {
    return undefined;
  }
  return { eventId: event.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/**
 * Complete reads are required before any import mutation. Role read failures propagate.
 * @param medplum - Customer-project client.
 * @param practitionerRef - Practitioner whose Schedules are covered.
 * @returns Active Schedules referencing the practitioner directly or through a role.
 */
export async function practitionerSchedules(
  medplum: MedplumClient,
  practitionerRef: string
): Promise<WithId<Schedule>[]> {
  const actorRefs = new Set([practitionerRef]);
  for await (const page of medplum.searchResourcePages(
    'PractitionerRole',
    await projectQuery(medplum, {
      practitioner: practitionerRef,
      _count: '200',
    })
  )) {
    for (const role of page) {
      actorRefs.add(`PractitionerRole/${role.id}`);
    }
  }
  const schedules: WithId<Schedule>[] = [];
  for await (const page of medplum.searchResourcePages(
    'Schedule',
    await projectQuery(medplum, {
      actor: [...actorRefs].join(','),
      _count: '200',
    })
  )) {
    // R4 Schedule.active defaults to true when omitted.
    schedules.push(...page.filter((s) => s.active !== false && s.actor.some((a) => actorRefs.has(a.reference ?? ''))));
  }
  return schedules;
}

export async function importedSlots(medplum: MedplumClient, connectionId: string): Promise<WithId<Slot>[]> {
  const slots: WithId<Slot>[] = [];
  for await (const page of medplum.searchResourcePages(
    'Slot',
    await projectQuery(medplum, { identifier: `${IMPORT_IDENTIFIER_SYSTEM}|`, _count: '200' })
  )) {
    for (const slot of page) {
      const identity = readImportedIdentity(slot);
      if (identity?.connectionId === connectionId) {
        slots.push(slot);
      } else if (!identity) {
        console.warn(`Imported Slot ${slot.id} has an invalid identity; retained for administrator repair`);
      }
    }
  }
  return slots;
}

/**
 * Reconcile a bounded, complete Google snapshot. The caller must serialize work for this
 * connection, including disconnect. No incremental cursor is advanced by this implementation.
 * All required reads and upserts finish before removal; failures preserve existing blocks.
 * @param medplum - Client with write access limited to imported Slots.
 * @param calendar - Google snapshot reader.
 * @param connection - Active connection owned by this worker.
 * @param range - Complete snapshot coverage.
 * @param beforeWrite - Checks the worker still owns the connection and may write.
 * @returns Completed import counts.
 */
export async function importBusyTime(
  medplum: MedplumClient,
  calendar: Pick<GoogleCalendarClient, 'listBusyEvents'>,
  connection: CalendarConnection,
  range: SyncRange,
  beforeWrite: () => Promise<void>
): Promise<{ createdOrUpdated: number; removed: number }> {
  if (connection.status !== 'active') {
    throw new Error('Connection is not active');
  }
  const snapshot = await calendar.listBusyEvents(range.start.toISOString(), range.end.toISOString());
  const schedules = await practitionerSchedules(medplum, connection.practitionerRef);
  const previous = await importedSlots(medplum, connection.basic.id);
  // Invalid identities are project-level diagnostics, not attributed to every connection.
  const intervals = snapshot.events
    .map((event) => busyInterval(event, connection.basic.meta?.project))
    .filter((i): i is BusyInterval => Boolean(i))
    .filter((i) => Date.parse(i.end) > range.start.getTime() && Date.parse(i.start) < range.end.getTime());
  const desired = new Map<string, Slot>();
  for (const interval of intervals) {
    for (const schedule of schedules) {
      const identity = {
        connectionId: connection.basic.id,
        calendarId: snapshot.calendarId,
        eventId: interval.eventId,
        scheduleRef: `Schedule/${schedule.id}`,
      };
      const value = importIdentifier(identity);
      const slot: Slot = {
        resourceType: 'Slot',
        identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value }],
        schedule: { reference: identity.scheduleRef },
        status: 'busy-unavailable',
        start: interval.start,
        end: interval.end,
      };
      const duplicate = desired.get(value);
      if (duplicate && (duplicate.start !== slot.start || duplicate.end !== slot.end)) {
        throw new Error('Google returned inconsistent duplicate occurrences');
      }
      desired.set(value, slot);
    }
  }
  const oldById = new Map(
    previous.map((slot) => [importIdentifier(readImportedIdentity(slot) as ImportedIdentity), slot])
  );
  let createdOrUpdated = 0;
  for (const [value, slot] of desired) {
    const old = oldById.get(value);
    if (old && sameBlock(old, slot)) {
      continue;
    }
    await beforeWrite();
    // Conditional create closes the race with another delivery. Updates are version guarded.
    const stored =
      old ??
      (await medplum.createResourceIfNoneExist(
        slot,
        await projectQuery(medplum, { identifier: `${IMPORT_IDENTIFIER_SYSTEM}|${value}` })
      ));
    if (!sameBlock(stored, slot)) {
      if (readImportedIdentity(stored)?.connectionId !== connection.basic.id) {
        throw new Error('Imported Slot ownership mismatch');
      }
      await beforeWrite();
      await medplum.updateResource({ ...slot, id: stored.id, meta: stored.meta }, ifMatch(stored));
    }
    createdOrUpdated++;
  }
  let removed = 0;
  for (const old of previous) {
    const identity = readImportedIdentity(old) as ImportedIdentity;
    const value = importIdentifier(identity);
    if (desired.has(value)) {
      continue;
    }
    // Remove elapsed blocks and absent blocks inside the snapshot. Retain future blocks beyond it.
    // Inactive Schedules can be cleaned regardless of the snapshot range.
    const scheduleStillActive = schedules.some((s) => `Schedule/${s.id}` === identity.scheduleRef);
    const covered = Date.parse(old.start) < range.end.getTime();
    if (!covered && scheduleStillActive) {
      continue;
    }
    await beforeWrite();
    await medplum.deleteResource('Slot', old.id, ifMatch(old));
    removed++;
  }
  return { createdOrUpdated, removed };
}

function sameBlock(a: Slot, b: Slot): boolean {
  return (
    Object.keys(a).every((key) =>
      ['resourceType', 'id', 'meta', 'identifier', 'schedule', 'status', 'start', 'end'].includes(key)
    ) &&
    a.status === b.status &&
    a.start === b.start &&
    a.end === b.end &&
    a.schedule.reference === b.schedule.reference &&
    !a.serviceType?.length &&
    !a.comment &&
    JSON.stringify(a.identifier) === JSON.stringify(b.identifier)
  );
}
