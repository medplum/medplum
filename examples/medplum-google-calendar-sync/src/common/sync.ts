// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Mirrors one Appointment or Slot to every connected practitioner it concerns. Shared by the
 * sync Bot (one source per Subscription delivery) and the range sync (many sources per run),
 * so a `SyncSession` caches per-run state: the OAuth client and one access token per
 * practitioner.
 */

import { assertCurrentProject, projectQuery } from './project';
import { ownershipStore } from './ownership';
import type { OwnershipStore } from './ownership';
import { readCredential } from './credentials';
import type { BotEvent, MedplumClient } from '@medplum/core';
import {
  extractServiceTypeReferences,
  isGone,
  isNotFound,
  normalizeErrorString,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  Appointment,
  HealthcareService,
  Patient,
  PractitionerRole,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { EVENT_PROPERTY, IMPORT_IDENTIFIER_SYSTEM, SECRET } from './constants';
import type { CalendarConnection } from './connection';
import { findConnection, readConnection, updateConnection } from './connection';
import type { ConnectionLease } from './lease';
import { withConnectionLease } from './lease';
import { randomUUID } from 'node:crypto';
import type { SyncRange } from './range-sync';
import type { OutboundWork } from './state';
import { readState, withState } from './state';
import { readProjectCeiling } from './configuration';
import type { UpsertOutcome } from './google-calendar';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar';
import type { GoogleOAuthClient } from './google-oauth';
import { getOAuthClient, GoogleOAuthError, refreshAccessToken } from './google-oauth';
import type { GoogleCalendarEvent } from './mapping';
import {
  buildAppointmentEvent,
  buildSlotEvent,
  MIRRORED_APPOINTMENT_STATUSES,
  resolveDetailLevel,
  toGoogleEventId,
} from './mapping';

/** The Appointment or Slot to mirror. `deleted` means the event must go for everyone. */
export interface SyncSource {
  resource: Appointment | Slot;
  deleted: boolean;
}

export type SyncOutcome = UpsertOutcome | 'deleted' | 'not-connected' | 'reauth-required' | 'unmappable' | 'error';

export interface SyncResult {
  practitionerRef: string;
  outcome: SyncOutcome;
  error?: string;
}

/** Google and OAuth, injectable so tests never touch the network. */
export interface SyncDeps {
  refreshAccessToken: typeof refreshAccessToken;
  createCalendarClient: (
    accessToken: string,
    beforeRequest?: () => Promise<void>,
    ownership?: OwnershipStore
  ) => Pick<GoogleCalendarClient, 'upsertEvent' | 'deleteOwnedEvent' | 'listEvents'>;
}

const DEFAULT_DEPS: SyncDeps = {
  refreshAccessToken,
  createCalendarClient: (accessToken, beforeRequest, ownership) =>
    new GoogleCalendarClient(accessToken, { beforeRequest, ownership }),
};

/** A recipient after PractitionerRoles have been resolved; `declined` means their event must go. */
interface Recipient {
  practitioner: string;
  declined: boolean;
}

/**
 * Whether a Medplum read failed because the resource doesn't exist (404) or was deleted
 * (410), as opposed to a transient or permission failure. Only the former may be treated as
 * "the event must go".
 * @param err - The error a Medplum call threw.
 * @returns True for 404 and 410.
 */
export function isResourceGone(err: unknown): boolean {
  return err instanceof OperationOutcomeError && (isNotFound(err.outcome) || isGone(err.outcome));
}

/**
 * The customer project a resource belongs to. Shared Bots run on behalf of many projects,
 * so the resource is the reliable source.
 * @param resource - Any resource read from the customer project.
 * @returns The project ID.
 */
export function getProjectId(resource: Resource): string {
  const projectId = resource.meta?.project;
  if (!projectId) {
    throw new Error(`${resource.resourceType}/${resource.id} has no meta.project`);
  }
  return projectId;
}

export class SyncSession {
  private lease?: ConnectionLease;
  private outboundRequestAtStart?: string;
  private ceilingAtStart?: string;
  private readonly oauth: GoogleOAuthClient;
  private readonly detailCeiling: string | undefined;
  private readonly appointmentUrlTemplate: string | undefined;
  private readonly accessTokens = new Map<string, string>();

  constructor(
    readonly medplum: MedplumClient,
    secrets: BotEvent['secrets'],
    readonly projectId: string,
    private readonly deps: SyncDeps = DEFAULT_DEPS
  ) {
    this.oauth = getOAuthClient(secrets);
    this.detailCeiling = secrets?.[SECRET.detailLevel]?.valueString?.trim() || undefined;
    this.appointmentUrlTemplate = secrets?.[SECRET.appointmentUrl]?.valueString?.trim() || undefined;
  }

  async withConnection<T>(
    connection: CalendarConnection,
    work: (current: CalendarConnection) => Promise<T>
  ): Promise<T> {
    await assertCurrentProject(this.medplum, connection.basic);
    if (connection.basic.meta?.project !== this.projectId) {
      throw new Error('Source and connection projects differ');
    }
    if (this.lease) {
      if (this.lease.id !== connection.basic.id) {
        throw new Error('Cannot switch connections inside a lease');
      }
      return work(connection);
    }
    return withConnectionLease(this.medplum, connection.basic.id, async (lease) => {
      this.lease = lease;
      try {
        this.outboundRequestAtStart = readState(await lease.read()).outboundRequest;
        const level = await readProjectCeiling(this.medplum, this.detailCeiling);
        this.ceilingAtStart = level;
        await lease.mutate((basic) => withState(basic, { ...readState(basic), projectDetailLevel: level }));
        const current = readConnection(await lease.read());
        if (!current) {
          throw new Error('Calendar connection is invalid');
        }
        const retryAt = Date.parse(readState(current.basic).outboundRetryAt ?? '');
        if (retryAt > Date.now()) {
          throw new GoogleApiError(429, 'rateLimitExceeded', 'Google Calendar retry is deferred', retryAt);
        }
        try {
          return await work(current);
        } catch (err) {
          if (err instanceof GoogleApiError && err.retryAt) {
            await lease.mutate((basic) =>
              withState(basic, {
                ...readState(basic),
                outboundRetryAt: new Date(err.retryAt as number).toISOString(),
                outboundError: 'outbound-quota',
              })
            );
          }
          throw err;
        }
      } finally {
        this.lease = undefined;
      }
    });
  }

  async beginWork(range: SyncRange, resume: boolean): Promise<OutboundWork> {
    const saved = await this.requireLease().mutate((basic) => {
      const state = readState(basic);
      if (!resume || !state.outboundWork || state.outboundWork.request !== state.outboundRequest) {
        state.outboundWork = {
          start: state.requestedRangeStart ?? range.start.toISOString(),
          end: state.requestedRangeEnd ?? range.end.toISOString(),
          phase: 'discover',
          errors: 0,
          request: state.outboundRequest ?? '',
        };
      }
      return withState(basic, state);
    });
    return readState(saved).outboundWork as OutboundWork;
  }

  async workState(): Promise<OutboundWork | undefined> {
    return readState(await this.requireLease().read()).outboundWork;
  }

  async checkpoint(phase: 'discover' | 'repair', cursor?: string, failed = false): Promise<void> {
    await this.requireLease().mutate((basic) => {
      const state = readState(basic);
      if (state.outboundWork) {
        state.outboundWork = {
          ...state.outboundWork,
          phase,
          cursor,
          errors: state.outboundWork.errors + (failed ? 1 : 0),
        };
      }
      return withState(basic, state);
    });
  }

  async yieldWork(): Promise<boolean> {
    if (Date.now() < this.requireLease().deadline - 60_000) {
      return false;
    }
    await this.requireLease().mutate((basic) => {
      const state = readState(basic);
      if (state.outboundWork && state.outboundWork.request !== state.outboundRequest) {
        state.outboundWork = undefined;
      }
      state.outboundRequest = randomUUID();
      if (state.outboundWork) {
        state.outboundWork.request = state.outboundRequest;
      }
      return withState(basic, state);
    });
    return true;
  }

  async finishWork(): Promise<number> {
    let errors = 0;
    await this.requireLease().mutate((basic) => {
      const state = readState(basic);
      errors = state.outboundWork?.errors ?? 0;
      state.outboundWork = undefined;
      return withState(basic, state);
    });
    return errors;
  }

  async recordOutbound(complete: boolean, error?: string): Promise<void> {
    if (!this.lease) {
      throw new Error('Outbound state requires a connection lease');
    }
    const ceilingStillCurrent = this.ceilingAtStart === (await readProjectCeiling(this.medplum, this.detailCeiling));
    await this.lease.mutate((basic) => {
      const state = readState(basic);
      state.outboundError = error;
      if (!error) {
        state.lastOutbound = new Date().toISOString();
        state.outboundRetryAt = undefined;
        if (complete) {
          state.outboundCompleted = this.outboundRequestAtStart;
        }
        if (complete && ceilingStillCurrent && state.outboundRequest === this.outboundRequestAtStart) {
          state.privacyPending = false;
          state.requestedRangeStart = undefined;
          state.requestedRangeEnd = undefined;
        }
      }
      return withState(basic, state);
    });
  }

  /**
   * Mirrors one source to each practitioner it names, and removes it from practitioners the
   * previous version named who are no longer on it. One practitioner's failure never blocks
   * another's; failures come back as `error` results.
   * @param source - The Appointment or Slot.
   * @returns One result per practitioner considered.
   */
  async syncSource(source: SyncSource): Promise<SyncResult[]> {
    if (isImportedSlot(source.resource)) {
      return [];
    }
    const eventId = source.resource.id ? toGoogleEventId(source.resource.id) : undefined;
    if (!eventId) {
      console.warn(`${source.resource.resourceType}/${source.resource.id} has no usable id; skipped`);
      return [];
    }

    const mirrorable = !source.deleted && (await this.isMirrorable(source.resource));
    const recipients = await this.resolveRecipients(source.resource);
    const named = new Set(recipients.map((r) => r.practitioner));
    for (const practitioner of await this.previousRecipients(source)) {
      if (!named.has(practitioner)) {
        recipients.push({ practitioner, declined: true });
      }
    }

    const results: SyncResult[] = [];
    for (const recipient of recipients) {
      try {
        results.push(
          await this.syncRecipient(source, recipient.practitioner, eventId, !mirrorable || recipient.declined)
        );
      } catch (err) {
        results.push({ practitionerRef: recipient.practitioner, outcome: 'error', error: normalizeErrorString(err) });
      }
    }
    return results;
  }

  /**
   * Mirrors one source to one already-loaded connection, for the range sync, which walks
   * one practitioner's sources. The caller has already decided the source belongs to them.
   * @param source - The Appointment or Slot.
   * @param connection - The practitioner's active connection.
   * @returns The outcome.
   */
  async syncForConnection(source: SyncSource, connection: CalendarConnection): Promise<SyncOutcome> {
    if (!this.lease) {
      return this.withConnection(connection, (current) => this.syncForConnection(source, current));
    }
    if (connection.status !== 'active') {
      return 'reauth-required';
    }
    await this.lease.check();
    const accessToken = await this.accessTokenFor(connection);
    if (!accessToken) {
      return 'reauth-required';
    }
    const event = await this.buildEvent(source.resource, connection);
    return event
      ? this.deps
          .createCalendarClient(
            accessToken,
            () => this.requireLease().check(),
            ownershipStore(this.requireLease(), connection)
          )
          .upsertEvent(event)
      : 'unmappable';
  }

  /**
   * Repair every existing owned mirror, including sources outside the discovery horizon.
   * @param connection - Connection whose owned events are being repaired.
   * @returns Per-outcome counts; errors are not counted as successful repairs.
   */
  async reconcileExisting(connection: CalendarConnection): Promise<Record<string, number>> {
    this.requireLease();
    const counts: Record<string, number> = { repaired: 0, deleted: 0, errors: 0 };
    const token = await this.accessTokenFor(connection);
    if (!token) {
      return { ...counts, 'reauth-required': 1 };
    }
    const calendar = this.deps.createCalendarClient(
      token,
      () => this.requireLease().check(),
      ownershipStore(this.requireLease(), connection)
    );
    const events = await calendar.listEvents([`${EVENT_PROPERTY.project}=${this.projectId}`]);
    const work = await this.workState();
    for (const event of events.sort((a, b) => a.id.localeCompare(b.id))) {
      if (work?.cursor && event.id.localeCompare(work.cursor) <= 0) {
        continue;
      }
      if (await this.yieldWork()) {
        return { ...counts, pending: 1 };
      }
      let failed = false;
      try {
        const owner = event.extendedProperties?.private;
        if (owner?.[EVENT_PROPERTY.connection] && owner[EVENT_PROPERTY.connection] !== connection.basic.id) {
          const desiredIdentity = {
            ...event,
            extendedProperties: { private: { ...owner, [EVENT_PROPERTY.connection]: connection.basic.id } },
          };
          if (
            !(await ownershipStore(this.requireLease(), connection).ownsPrevious?.(
              desiredIdentity,
              owner[EVENT_PROPERTY.connection]
            ))
          ) {
            continue;
          }
        }
        if (!owner?.[EVENT_PROPERTY.connection]) {
          throw new Error('Legacy mirror requires connection ownership migration');
        }
        const sourceRef = owner?.[EVENT_PROPERTY.source];
        const match = sourceRef?.match(/^(Appointment|Slot)\/([A-Za-z0-9.-]+)$/);
        if (!match || owner[EVENT_PROPERTY.project] !== this.projectId || toGoogleEventId(match[2]) !== event.id) {
          throw new Error('Invalid mirror ownership or identity');
        }
        let resource: Appointment | Slot | undefined;
        try {
          resource = await this.medplum.readResource(match[1] as 'Appointment' | 'Slot', match[2], {
            cache: 'no-cache',
          });
        } catch (err) {
          if (!isResourceGone(err)) {
            throw err;
          }
        }
        if (!resource || !(await this.isMirroredFor({ resource, deleted: false }, connection.practitionerRef))) {
          await calendar.deleteOwnedEvent(event.id, owner);
          counts.deleted++;
          continue;
        }
        // Keep an earlier privacy level for historical mirrors when the ceiling is raised.
        // Legacy events have no level marker, so their safe migration is busy-only.
        const historical = Date.parse(resource.end ?? '') < Date.now();
        const previousLevel = historical ? (owner.medplumDetail ?? 'busy-only') : undefined;
        const desired = await this.buildEvent(resource, connection, previousLevel);
        if (!desired) {
          throw new Error('Source has an invalid time interval');
        }
        await calendar.upsertEvent(desired);
        counts.repaired++;
      } catch (err) {
        counts.errors++;
        failed = true;
        if (err instanceof GoogleApiError && err.retryAt) {
          throw err;
        }
        console.warn(`Owned mirror repair failed: ${normalizeErrorString(err)}`);
      } finally {
        await this.checkpoint('repair', event.id, failed);
      }
    }
    return counts;
  }

  /**
   * Whether this source currently belongs on this practitioner's calendar.
   * @param source - The Appointment or Slot.
   * @param practitionerRef - `Practitioner/<id>`.
   * @returns True when the practitioner is a non-declined recipient and the source is mirrorable.
   */
  async isMirroredFor(source: SyncSource, practitionerRef: string): Promise<boolean> {
    if (source.deleted || !(await this.isMirrorable(source.resource))) {
      return false;
    }
    const recipient = (await this.resolveRecipients(source.resource)).find((r) => r.practitioner === practitionerRef);
    return recipient !== undefined && !recipient.declined;
  }

  private async syncRecipient(
    source: SyncSource,
    practitionerRef: string,
    eventId: string,
    remove: boolean
  ): Promise<SyncResult> {
    const connection = await findConnection(this.medplum, practitionerRef);
    if (!connection) {
      return { practitionerRef, outcome: 'not-connected' };
    }
    return this.withConnection(connection, async (connection) => {
      try {
        source = {
          resource: await this.medplum.readResource(source.resource.resourceType, source.resource.id as string, {
            cache: 'no-cache',
          }),
          deleted: false,
        };
      } catch (err) {
        if (!isResourceGone(err)) {
          throw err;
        }
        source = { ...source, deleted: true };
      }
      remove = !(await this.isMirroredFor(source, practitionerRef));
      if (connection.status !== 'active') {
        return { practitionerRef, outcome: 'reauth-required' };
      }
      const accessToken = await this.accessTokenFor(connection);
      if (!accessToken) {
        return { practitionerRef, outcome: 'reauth-required' };
      }
      const calendar = this.deps.createCalendarClient(
        accessToken,
        () => this.requireLease().check(),
        ownershipStore(this.requireLease(), connection)
      );
      if (remove) {
        await calendar.deleteOwnedEvent(eventId, {
          [EVENT_PROPERTY.project]: this.projectId,
          [EVENT_PROPERTY.connection]: connection.basic.id,
          [EVENT_PROPERTY.source]: `${source.resource.resourceType}/${source.resource.id}`,
        });
        return { practitionerRef, outcome: 'deleted' };
      }
      const event = await this.buildEvent(source.resource, connection);
      return { practitionerRef, outcome: event ? await calendar.upsertEvent(event) : 'unmappable' };
    });
  }

  /**
   * Appointments by status; Slots when they are blocked time: `busy-unavailable`, not scoped
   * to one service, and not referenced by any Appointment. Buffers from `$book` and `$hold`
   * are busy-unavailable too and carry no marker; the Appointment reference is the only tell.
   * @param resource - The Appointment or Slot.
   * @returns True when it should have a Mirrored Event.
   */
  private async isMirrorable(resource: Appointment | Slot): Promise<boolean> {
    if (resource.resourceType === 'Appointment') {
      return MIRRORED_APPOINTMENT_STATUSES.has(resource.status);
    }
    if (isImportedSlot(resource) || resource.status !== 'busy-unavailable' || resource.serviceType?.length) {
      return false;
    }
    return (
      (await this.medplum.searchOne('Appointment', await projectQuery(this.medplum, `slot=Slot/${resource.id}`))) ===
      undefined
    );
  }

  /**
   * The practitioners a resource names, with PractitionerRoles resolved and duplicates
   * merged: a practitioner listed twice is a recipient unless every entry declined.
   * @param resource - The Appointment or Slot.
   * @returns The recipients.
   */
  private async resolveRecipients(resource: Appointment | Slot): Promise<Recipient[]> {
    const merged = new Map<string, boolean>();
    if (resource.resourceType === 'Appointment') {
      for (const participant of resource.participant ?? []) {
        const practitioner = await this.resolvePractitioner(participant.actor?.reference);
        if (practitioner) {
          const declined = participant.status === 'declined';
          merged.set(practitioner, (merged.get(practitioner) ?? true) && declined);
        }
      }
    } else if (resource.schedule?.reference) {
      try {
        const schedule = await this.medplum.readReference<Schedule>(
          { reference: resource.schedule.reference },
          { cache: 'no-cache' }
        );
        for (const actor of schedule.actor ?? []) {
          const practitioner = await this.resolvePractitioner(actor.reference);
          if (practitioner) {
            merged.set(practitioner, false);
          }
        }
      } catch (err) {
        if (!isResourceGone(err)) {
          throw err;
        }
      }
    }
    return [...merged].map(([practitioner, declined]) => ({ practitioner, declined }));
  }

  /**
   * Practitioners the previous version named. A practitioner taken off an Appointment, or a
   * Slot moved to another Schedule, isn't visible in the current version; history is.
   * @param source - The current version.
   * @returns Practitioner references from the previous version, or none when unavailable.
   */
  private async previousRecipients(source: SyncSource): Promise<string[]> {
    if (source.deleted || !source.resource.id) {
      return [];
    }
    try {
      const history = await this.medplum.readHistory(source.resource.resourceType, source.resource.id, { count: 2 });
      const previous = history.entry?.[1]?.resource;
      return previous ? (await this.resolveRecipients(previous)).map((r) => r.practitioner) : [];
    } catch (err) {
      console.warn(
        `History unavailable for ${source.resource.resourceType}/${source.resource.id}: ${normalizeErrorString(err)}`
      );
      return [];
    }
  }

  // `Practitioner/<id>` for a Practitioner or PractitionerRole reference; undefined for anything else.
  private async resolvePractitioner(reference: string | undefined): Promise<string | undefined> {
    if (!reference || reference.startsWith('Practitioner/')) {
      return reference;
    }
    if (!reference.startsWith('PractitionerRole/')) {
      return undefined;
    }
    try {
      const role = await this.medplum.readReference<PractitionerRole>({ reference }, { cache: 'no-cache' });
      return role.practitioner?.reference?.startsWith('Practitioner/') ? role.practitioner.reference : undefined;
    } catch (err) {
      if (!isResourceGone(err)) {
        throw err;
      }
      return undefined;
    }
  }

  // Patients and the HealthcareService are read only when the level reveals them.
  private async buildEvent(
    resource: Appointment | Slot,
    connection: CalendarConnection,
    previousLevel?: string
  ): Promise<GoogleCalendarEvent | undefined> {
    if (resource.resourceType === 'Slot') {
      const event = buildSlotEvent(resource, this.projectId);
      if (event) {
        event.extendedProperties.private[EVENT_PROPERTY.connection] = connection.basic.id;
      }
      return event;
    }
    const level = resolveDetailLevel(
      resolveDetailLevel(
        readState(connection.basic).projectDetailLevel ?? this.detailCeiling,
        connection.eventDetailLevel
      ),
      previousLevel
    );
    const patients: Patient[] = [];
    let service: HealthcareService | undefined;
    if (level !== 'busy-only') {
      for (const participant of resource.participant ?? []) {
        if (participant.actor?.reference?.startsWith('Patient/')) {
          const patient = await this.readOrWarn<Patient>(participant.actor.reference);
          if (patient) {
            patients.push(patient);
          }
        }
      }
      // The referenced HealthcareService names the visit type; text on the Appointment is only a fallback.
      const [serviceRef] = extractServiceTypeReferences(resource.serviceType);
      if (level !== 'initials' && serviceRef?.reference) {
        service = await this.readOrWarn<HealthcareService>(serviceRef.reference);
      }
    }
    const event = buildAppointmentEvent(resource, {
      projectId: this.projectId,
      level,
      appointmentUrlTemplate: this.appointmentUrlTemplate,
      patients,
      service,
    });
    if (event) {
      event.extendedProperties.private.medplumDetail = level;
      event.extendedProperties.private[EVENT_PROPERTY.connection] = connection.basic.id;
    }
    return event;
  }

  private async readOrWarn<T extends Resource>(reference: string): Promise<T | undefined> {
    try {
      return await this.medplum.readReference<T>({ reference });
    } catch (err) {
      console.warn(`${reference} unreadable: ${normalizeErrorString(err)}`);
      return undefined;
    }
  }

  private requireLease(): ConnectionLease {
    if (!this.lease) {
      throw new Error('Google writes require a connection lease');
    }
    return this.lease;
  }

  /**
   * One access token per practitioner per run. On `invalid_grant` the connection is paused
   * (`reauth-required`) and the caller sees `undefined`.
   * @param connection - The practitioner's active connection.
   * @returns An access token, or undefined when the practitioner must reconnect.
   */
  private async accessTokenFor(connection: CalendarConnection): Promise<string | undefined> {
    const cached = this.accessTokens.get(connection.practitionerRef);
    if (cached) {
      return cached;
    }
    try {
      const tokens = await this.deps.refreshAccessToken(this.oauth, await readCredential(this.medplum, connection));
      this.accessTokens.set(connection.practitionerRef, tokens.access_token);
      return tokens.access_token;
    } catch (err) {
      if (err instanceof GoogleOAuthError && err.isInvalidGrant) {
        console.warn(`${connection.practitionerRef}: Google refresh token rejected; reconnect required`);
        await updateConnection(this.medplum, connection, { status: 'reauth-required' }, this.lease);
        return undefined;
      }
      throw err;
    }
  }
}

/**
 * Imported Slots are never outbound sources, including deletion notifications.
 * @param resource - Candidate outbound source.
 * @returns True when the Slot carries the import namespace.
 */
export function isImportedSlot(resource: Appointment | Slot): boolean {
  return (
    resource.resourceType === 'Slot' &&
    Boolean(resource.identifier?.some((id) => id.system === IMPORT_IDENTIFIER_SYSTEM))
  );
}
