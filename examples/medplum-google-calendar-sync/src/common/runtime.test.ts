// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { operationIdentity } from '../test-auth';
import { BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM } from './constants';

import {
  AccessPolicyInteraction,
  evalFhirPath,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  OperationOutcomeError,
  preconditionFailed,
  satisfiedAccessPolicy,
} from '@medplum/core';
import type { BotEvent, MedplumClient, WithId } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Appointment, Basic, Bundle, Resource, Schedule, SearchParameter, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { handler as disconnect } from '../bots/google-calendar-disconnect-bot';
import { findConnection, saveConnection, updateConnection } from './connection';
import type { CalendarConnection } from './connection';
import { runInbound } from './inbound';
import { importedSlots } from './import';
import {
  ensureInboundPolicy,
  notificationSubscription,
  ORDINARY_SLOT_POLICY_SNIPPET,
  transitionExpression,
} from './install';
import { ConnectionBusyError, LEASE_MS, LEASE_URL, withConnectionLease } from './lease';
import { authorizedStatus } from './operations';
import { readState, requestSync, withState } from './state';
import { ensureWatch, receiveNotification } from './watch';

const PRACTITIONER = 'Practitioner/test-practitioner';
const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'client' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'secret' },
  GOOGLE_CALENDAR_WEBHOOK_URL: { name: 'webhook', valueString: 'https://api.medplum.test/webhook/customer-membership' },
};
const event: BotEvent = { bot: { reference: 'Bot/import' }, input: {}, contentType: 'application/fhir+json', secrets };

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

// MockClient does not enforce If-Match. This adapter models the server's atomic version check;
// separate server/deployment validation is still required for the actual authorization boundary.
function enforceVersions(medplum: MockClient): void {
  const update = medplum.updateResource.bind(medplum);
  let queue: Promise<unknown> = Promise.resolve();
  vi.spyOn(medplum, 'updateResource').mockImplementation(
    (resource: Resource, options?: Parameters<MedplumClient['updateResource']>[1]) => {
      const next = queue.then(async () => {
        const expected = new Headers(options?.headers).get('If-Match');
        if (expected && resource.id) {
          const current = await medplum.readResource(resource.resourceType, resource.id);
          if (expected !== `W/"${current.meta?.versionId}"`) {
            throw new OperationOutcomeError(preconditionFailed);
          }
        }
        return update(resource, options);
      });
      queue = next.catch(() => undefined);
      return next;
    }
  );
}

describe('calendar runtime', () => {
  let medplum: MockClient;
  let connection: CalendarConnection;
  let schedule: WithId<Schedule>;
  let appointment: WithId<Appointment>;
  let tokenRevoked: boolean;
  let snapshotFails: boolean;
  let watch: { id: string; token: string };
  let requests: { url: string; method: string }[];
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    for (const file of ['profiles-types', 'profiles-resources', 'profiles-medplum']) {
      indexStructureDefinitionBundle(readJson(`fhir/r4/${file}.json`) as Bundle);
    }
    for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(file) as Bundle<SearchParameter>);
    }
  });
  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'project', name: 'Calendar test' } });
    enforceVersions(medplum);
    connection = await saveConnection(medplum, {
      practitionerRef: PRACTITIONER,
      accountSub: 'google-sub',
      refreshToken: 'refresh-secret',
    });
    connection.basic = await medplum.updateResource({
      ...connection.basic,
      meta: { ...connection.basic.meta, project: 'project' },
    });
    schedule = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: PRACTITIONER }],
    });
    appointment = await medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: new Date(Date.now() + 60 * 60_000).toISOString(),
      end: new Date(Date.now() + 90 * 60_000).toISOString(),
      participant: [{ actor: { reference: PRACTITIONER }, status: 'accepted' }],
    });
    tokenRevoked = false;
    snapshotFails = false;
    requests = [];
    watch = { id: '', token: '' };
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('oauth2.googleapis.com/token')) {
        return tokenRevoked
          ? response(400, { error: 'invalid_grant' })
          : response(200, { access_token: 'access', expires_in: 3600, scope: '', token_type: 'Bearer' });
      }
      if (url.includes('/revoke')) {
        return response(tokenRevoked ? 400 : 200);
      }
      if (url.endsWith('/events/watch')) {
        const body = JSON.parse(String(init?.body));
        watch = { id: body.id, token: body.token };
        return response(200, {
          id: body.id,
          resourceId: 'google-resource',
          expiration: String(Date.now() + 7 * 24 * 60 * 60_000),
        });
      }
      if (url.includes('/channels/stop')) {
        return response(204);
      }
      if (url.endsWith('/calendars/primary')) {
        return response(200, { id: 'calendar@workspace.example' });
      }
      if (url.includes('/events?') && new URL(url).searchParams.has('timeMin')) {
        if (snapshotFails) {
          return response(403, { error: { message: 'unavailable', errors: [{ reason: 'forbidden' }] } });
        }
        return response(200, {
          items: [
            { id: 'google-occurrence', start: { dateTime: appointment.start }, end: { dateTime: appointment.end } },
          ],
        });
      }
      if (url.includes('/events?')) {
        return response(200, { items: [] });
      }
      throw new Error(`Unexpected test request: ${url}`);
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const current = async (): Promise<WithId<Basic>> =>
    medplum.readResource('Basic', connection.basic.id, { cache: 'no-cache' });
  const headers = (number = '2'): NonNullable<BotEvent['headers']> => ({
    'x-goog-channel-id': watch.id,
    'x-goog-channel-token': watch.token,
    'x-goog-resource-id': 'google-resource',
    'x-goog-message-number': number,
    'x-goog-resource-state': 'exists',
  });

  test('imports, records freshness/conflicts, and does not emit workflow resources', async () => {
    const tasks = await medplum.searchResources('Task');
    await runInbound(medplum, event, connection.basic.id);
    const state = readState(await current());
    expect(state.lastInbound).toBeTruthy();
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0].appointment).toBe(`Appointment/${appointment.id}`);
    expect(await importedSlots(medplum, connection.basic.id)).toHaveLength(1);
    expect(JSON.stringify(await current())).not.toContain(watch.token);
    const revision = state.conflictsRevision;
    await runInbound(medplum, event, connection.basic.id);
    expect(readState(await current()).conflictsRevision).toBe(revision);
    expect(await medplum.searchResources('Task')).toEqual(tasks);
    expect(await medplum.searchResources('DetectedIssue')).toHaveLength(0);
  });

  test('headers authenticate routing; duplicate and out-of-order notifications do not queue again', async () => {
    await runInbound(medplum, event, connection.basic.id);
    const before = readState(await current()).inboundRequest;
    expect(await receiveNotification(medplum, { ...headers(), 'x-goog-channel-token': 'wrong' })).toMatchObject({
      issue: [{ code: 'forbidden' }],
    });
    expect(readState(await current()).inboundRequest).toBe(before);
    expect(
      await receiveNotification(medplum, { ...headers(), 'x-goog-resource-id': 'another-calendar' })
    ).toBeDefined();
    expect(await receiveNotification(medplum, { ...headers(), 'x-goog-channel-token': [watch.token] })).toBeDefined();
    expect(
      await receiveNotification(medplum, { ...headers('10'), 'x-goog-resource-uri': 'https://untrusted.example' })
    ).toBeUndefined();
    const requested = readState(await current()).inboundRequest;
    expect(requested).not.toBe(before);
    await receiveNotification(medplum, headers('10'));
    await receiveNotification(medplum, headers('9'));
    expect(readState(await current()).inboundRequest).toBe(requested);
    expect(requests.some((r) => r.url.includes('untrusted'))).toBe(false);
  });

  test('the authenticated initial callback may arrive before watch registration returns', async () => {
    await withConnectionLease(medplum, connection.basic.id, async (lease) => {
      await ensureWatch(
        lease,
        {
          watchEvents: async (id, token) => {
            watch = { id, token };
            expect(
              await receiveNotification(medplum, { ...headers('1'), 'x-goog-resource-state': 'sync' })
            ).toBeUndefined();
            return { id, resourceId: 'google-resource', expiration: String(Date.now() + 7 * 24 * 60 * 60_000) };
          },
          stopChannel: async () => undefined,
        },
        'https://api.medplum.test/webhook/member'
      );
    });
    expect(readState(await current()).channels[0].resourceId).toBe('google-resource');
  });

  test('renews before expiry and retires the old channel only after registration', async () => {
    await runInbound(medplum, event, connection.basic.id);
    const old = watch.id;
    await withConnectionLease(medplum, connection.basic.id, async (lease) => {
      await lease.mutate((basic) => {
        const state = readState(basic);
        state.channels[0].expires = new Date(Date.now() + 60_000).toISOString();
        return withState(basic, state);
      });
    });
    requests = [];
    await runInbound(medplum, event, connection.basic.id);
    expect(watch.id).not.toBe(old);
    expect(readState(await current()).channels.map((c) => c.id)).toEqual([watch.id]);
    expect(requests.findIndex((r) => r.url.includes('/events/watch'))).toBeLessThan(
      requests.findIndex((r) => r.url.includes('/channels/stop'))
    );
  });

  test('an outage or revocation preserves blocks, conflicts and last successful import', async () => {
    await runInbound(medplum, event, connection.basic.id);
    const before = readState(await current());
    const slots = await importedSlots(medplum, connection.basic.id);
    snapshotFails = true;
    await expect(runInbound(medplum, event, connection.basic.id)).rejects.toMatchObject({ status: 403 });
    expect(readState(await current())).toMatchObject({
      conflicts: before.conflicts,
      lastInbound: before.lastInbound,
      inboundError: 'inbound-error',
    });
    tokenRevoked = true;
    await runInbound(medplum, event, connection.basic.id);
    expect((await findConnection(medplum, PRACTITIONER))?.status).toBe('reauth-required');
    expect(await importedSlots(medplum, connection.basic.id)).toEqual(slots);
    expect(readState(await current()).conflicts).toEqual(before.conflicts);
  });

  test('disconnect is queued, then removes watches and imported Slots without changing the appointment', async () => {
    await runInbound(medplum, event, connection.basic.id);
    await operationIdentity(
      medplum,
      { ...event, requester: { reference: PRACTITIONER } },
      BOT_IDENTIFIER_VALUE.disconnect
    );
    const result = await disconnect(medplum, {
      ...event,
      requester: { reference: PRACTITIONER },
      input: { resourceType: 'Parameters' },
    });
    expect(result.parameter).toContainEqual({ name: 'status', valueCode: 'disconnecting' });
    expect(await importedSlots(medplum, connection.basic.id)).toHaveLength(1);
    await runInbound(medplum, event, connection.basic.id);
    expect(await findConnection(medplum, PRACTITIONER)).toBeUndefined();
    expect(await importedSlots(medplum, connection.basic.id)).toHaveLength(0);
    expect(await medplum.readResource('Appointment', appointment.id)).toEqual(appointment);
    expect(requests.some((r) => r.url.includes('/channels/stop'))).toBe(true);
  });

  test('partial disconnect retains checkpoints and resumes without redoing Google cleanup', async () => {
    await runInbound(medplum, event, connection.basic.id);
    await operationIdentity(
      medplum,
      { ...event, requester: { reference: PRACTITIONER } },
      BOT_IDENTIFIER_VALUE.disconnect
    );
    await disconnect(medplum, {
      ...event,
      requester: { reference: PRACTITIONER },
      input: { resourceType: 'Parameters' },
    });
    const remove = medplum.deleteResource.bind(medplum);
    const spy = vi.spyOn(medplum, 'deleteResource').mockImplementation(async (type, id, options) => {
      if (type === 'Slot') {
        throw new Error('Slot removal unavailable');
      }
      return remove(type, id, options);
    });
    await expect(runInbound(medplum, event, connection.basic.id)).rejects.toThrow('Slot removal unavailable');
    expect(readState(await current()).googleCleaned).toBe(true);
    expect(await importedSlots(medplum, connection.basic.id)).toHaveLength(1);
    spy.mockRestore();
    requests = [];
    await runInbound(medplum, event, connection.basic.id);
    expect(requests.some((r) => r.url.includes('/events?') || r.url.includes('/token'))).toBe(false);
    expect(await findConnection(medplum, PRACTITIONER)).toBeUndefined();
  });

  test('mutually exclusive workers reject concurrent work; request markers survive a worker state update', async () => {
    await withConnectionLease(medplum, connection.basic.id, async (lease) => {
      await expect(withConnectionLease(medplum, connection.basic.id, async () => undefined)).rejects.toBeInstanceOf(
        ConnectionBusyError
      );
      await requestSync(medplum, connection.basic.id, ['inbound']);
      const requested = readState(await current()).inboundRequest;
      await lease.mutate((basic) => withState(basic, { ...readState(basic), lastOutbound: new Date().toISOString() }));
      expect(readState(await current()).inboundRequest).toBe(requested);
    });
    expect((await current()).extension?.some((e) => e.url === LEASE_URL)).toBe(false);
  });

  test('expired workers cannot write after a replacement takes the lease', async () => {
    let time = Date.now();
    await withConnectionLease(
      medplum,
      connection.basic.id,
      async (old) => {
        time += LEASE_MS + 1;
        await withConnectionLease(
          medplum,
          connection.basic.id,
          async (replacement) => {
            await expect(old.check()).rejects.toThrow('deadline');
            await replacement.check();
          },
          () => time
        );
      },
      () => time
    );
  });

  test('status omits credentials and filters references through the caller’s permissions', async () => {
    await runInbound(medplum, event, connection.basic.id);
    const status = await authorizedStatus(medplum, await findConnection(medplum, PRACTITIONER));
    expect(status.parameter).toContainEqual({ name: 'activeConflictCount', valueInteger: 1 });
    expect(JSON.stringify(status)).not.toMatch(/refresh-secret|tokenHash|calendar@workspace/);
    await medplum.deleteResource('Appointment', appointment.id);
    const hidden = await authorizedStatus(medplum, await findConnection(medplum, PRACTITIONER));
    expect(hidden.parameter).toContainEqual({ name: 'activeConflictCount', valueInteger: 0 });
  });

  test('work and conflict transition expressions ignore unrelated connection writes', async () => {
    const previous = await current();
    await requestSync(medplum, connection.basic.id, ['inbound']);
    const updated = await current();
    const evaluate = (field: string, before: Basic, after: Basic): unknown[] =>
      evalFhirPath(transitionExpression(field), after, {
        '%previous': { type: 'Basic', value: before },
        '%current': { type: 'Basic', value: after },
      });
    expect(evaluate('inboundRequest', previous, updated)).toEqual([true]);
    expect(evaluate('outboundRequest', previous, updated)).toEqual([false]);
    expect(evaluate('inboundRequest', updated, updated)).toEqual([false]);
    await runInbound(medplum, event, connection.basic.id);
    const opened = await current();
    expect(evaluate('conflictsRevision', updated, opened)).toEqual([true]);
    await medplum.updateResource({ ...appointment, status: 'cancelled' });
    await runInbound(medplum, event, connection.basic.id);
    expect(evaluate('conflictsRevision', opened, await current())).toEqual([true]);
    expect(readState(await current()).conflicts).toEqual([]);
  });

  test('import policy permits owned Slots only and denies Appointment/Schedule mutations', async () => {
    const policy = await ensureInboundPolicy(medplum);
    const ordinary: Slot = {
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: appointment.start as string,
      end: appointment.end as string,
    };
    const owned = { ...ordinary, identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'owned' }] };
    for (const interaction of [
      AccessPolicyInteraction.CREATE,
      AccessPolicyInteraction.UPDATE,
      AccessPolicyInteraction.DELETE,
    ]) {
      expect(satisfiedAccessPolicy(ordinary, interaction, policy)).toBeUndefined();
      expect(satisfiedAccessPolicy(owned, interaction, policy)).toBeDefined();
      expect(satisfiedAccessPolicy(appointment, interaction, policy)).toBeUndefined();
      expect(satisfiedAccessPolicy(schedule, interaction, policy)).toBeUndefined();
    }
    expect(satisfiedAccessPolicy(owned, AccessPolicyInteraction.READ, policy)).toBeDefined();
  });
  test('ordinary Slot writers cannot assign or retain the reserved identifier', async () => {
    const policy = { resourceType: 'AccessPolicy' as const, resource: ORDINARY_SLOT_POLICY_SNIPPET };
    const slot: Slot = {
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: appointment.start as string,
      end: appointment.end as string,
    };
    const forged = { ...slot, identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'forged' }] };
    for (const action of [
      AccessPolicyInteraction.CREATE,
      AccessPolicyInteraction.UPDATE,
      AccessPolicyInteraction.DELETE,
    ]) {
      expect(satisfiedAccessPolicy(slot, action, policy)).toBeDefined();
      expect(satisfiedAccessPolicy(forged, action, policy)).toBeUndefined();
    }
    expect(satisfiedAccessPolicy(forged, AccessPolicyInteraction.READ, policy)).toBeDefined();
  });

  test('reauth notifications fire only on the transition', async () => {
    const before = await current();
    await updateConnection(medplum, (await findConnection(medplum, PRACTITIONER)) as CalendarConnection, {
      status: 'reauth-required',
    });
    const after = await current();
    const expression = notificationSubscription('Bot/customer-workflow', 'reauth').extension?.find((e) => e.valueString)
      ?.valueString as string;
    const evaluate = (previous: Basic, current: Basic): unknown[] =>
      evalFhirPath(expression, current, {
        '%previous': { type: 'Basic', value: previous },
        '%current': { type: 'Basic', value: current },
      });
    expect(evaluate(before, after)).toEqual([true]);
    expect(evaluate(after, after)).toEqual([false]);
    expect(evaluate(after, before)).toEqual([false]);
  });

  test('lease release rebases after a webhook changes the version', async () => {
    const spy = vi.mocked(medplum.updateResource);
    const update = spy.getMockImplementation();
    if (!update) {
      throw new Error('Missing version adapter');
    }
    let interfere = true;
    spy.mockImplementation(async (resource, options) => {
      if (interfere && resource.resourceType === 'Basic' && !resource.extension?.some((e) => e.url === LEASE_URL)) {
        interfere = false;
        await requestSync(medplum, connection.basic.id, ['inbound']);
      }
      return update(resource, options);
    });
    const before = readState(await current()).inboundRequest;
    await withConnectionLease(medplum, connection.basic.id, async () => undefined);
    expect(readState(await current()).inboundRequest).not.toBe(before);
    expect((await current()).extension?.some((e) => e.url === LEASE_URL)).toBe(false);
  });

  test('a long import yields after completed writes and resumes the remaining Slots', async () => {
    await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: PRACTITIONER }],
    });
    let time = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    const create = vi.mocked(medplum.createResourceIfNoneExist).getMockImplementation()?.bind(medplum);
    if (!create) {
      throw new Error('Missing test project stamping');
    }
    let advance = true;
    vi.spyOn(medplum, 'createResourceIfNoneExist').mockImplementation(async (resource, query, options) => {
      const stored = await create(resource, query, options);
      if (resource.resourceType === 'Slot' && advance) {
        time += 7 * 60_000;
        advance = false;
      }
      return stored;
    });
    await runInbound(medplum, event, connection.basic.id);
    const first = await importedSlots(medplum, connection.basic.id);
    expect(first).toHaveLength(1);
    expect(readState(await current()).inboundError).toBe('inbound-pending');
    expect(readState(await current()).lastInbound).toBeUndefined();
    await runInbound(medplum, event, connection.basic.id);
    const final = await importedSlots(medplum, connection.basic.id);
    expect(final).toHaveLength(2);
    expect(final.some((s) => s.id === first[0].id)).toBe(true);
    expect(readState(await current()).inboundError).toBeUndefined();
    expect(readState(await current()).lastInbound).toBeTruthy();
  });

  test('a late notification after disconnect cannot revive the connection', async () => {
    await runInbound(medplum, event, connection.basic.id);
    await operationIdentity(
      medplum,
      { ...event, requester: { reference: PRACTITIONER } },
      BOT_IDENTIFIER_VALUE.disconnect
    );
    await disconnect(medplum, {
      ...event,
      requester: { reference: PRACTITIONER },
      input: { resourceType: 'Parameters' },
    });
    expect(await receiveNotification(medplum, headers())).toMatchObject({ issue: [{ code: 'forbidden' }] });
    expect((await findConnection(medplum, PRACTITIONER))?.status).toBe('disconnecting');
  });
});
