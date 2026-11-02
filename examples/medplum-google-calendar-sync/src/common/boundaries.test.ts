// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import { AccessPolicyInteraction, satisfiedAccessPolicy } from '@medplum/core';
import type { Basic, Parameters, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { operationIdentity } from '../test-auth';
import { requireOperationBot } from './authorization';
import { readProjectCeiling, writeProjectCeiling } from './configuration';
import { findConnection, saveConnection } from './connection';
import { BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM, GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { CREDENTIAL_SEARCH, migrateCredential, readCredential, TOKEN_URL } from './credentials';
import { importedSlots } from './import';
import { withConnectionLease } from './lease';
import {
  auditPolicyGrants,
  ensureInboundPolicy,
  ensureSyncAccessPolicy,
  ORDINARY_SLOT_POLICY_SNIPPET,
  PRACTITIONER_POLICY_SNIPPET,
} from './policies';

let medplum: MockClient;
beforeEach(() => {
  medplum = new MockClient({ project: { resourceType: 'Project', id: 'customer-a', name: 'a' } });
});
const args = { practitionerRef: 'Practitioner/doctor', accountSub: 'sub', refreshToken: 'private-token' };

test('moves credentials under a lease, preserves identity and can resume after a connection-write failure', async () => {
  const connection = await saveConnection(medplum, args);
  expect(JSON.stringify(connection.basic)).not.toContain('private-token');
  expect(await readCredential(medplum, connection)).toBe('private-token');
  await medplum.updateResource({
    ...connection.basic,
    extension: [...(connection.basic.extension ?? []), { url: TOKEN_URL, valueString: 'legacy-token' }],
  });
  const update = medplum.updateResource.bind(medplum);
  let fail = true;
  vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource, options) => {
    if (
      fail &&
      resource.resourceType === 'Basic' &&
      resource.id === connection.basic.id &&
      !resource.extension?.some((e) => e.url === TOKEN_URL)
    ) {
      fail = false;
      throw new Error('injected interruption');
    }
    return update(resource, options);
  });
  await expect(withConnectionLease(medplum, connection.basic.id, migrateCredential)).rejects.toThrow('interruption');
  await withConnectionLease(medplum, connection.basic.id, migrateCredential);
  const migrated = await findConnection(medplum, args.practitionerRef);
  expect(migrated?.basic.id).toBe(connection.basic.id);
  expect(JSON.stringify(migrated?.basic)).not.toContain('legacy-token');
  expect(migrated && (await readCredential(medplum, migrated))).toBe('legacy-token');
  expect(await medplum.searchResources('Basic', CREDENTIAL_SEARCH)).toHaveLength(1);
});
test('practitioner and webhook policies deny credential and historical-token access', async () => {
  const connection = await saveConnection(medplum, args);
  const [credential] = await medplum.searchResources('Basic', CREDENTIAL_SEARCH);
  const practitionerPolicy = {
    resourceType: 'AccessPolicy' as const,
    resource: PRACTITIONER_POLICY_SNIPPET.map((r) => ({
      ...r,
      criteria: r.criteria?.replace('%profile', args.practitionerRef),
    })),
  };
  const webhook = await ensureInboundPolicy(medplum, true);
  for (const action of [
    AccessPolicyInteraction.READ,
    AccessPolicyInteraction.UPDATE,
    AccessPolicyInteraction.DELETE,
    AccessPolicyInteraction.HISTORY,
    AccessPolicyInteraction.VREAD,
  ]) {
    expect(satisfiedAccessPolicy(credential, action, practitionerPolicy)).toBeUndefined();
    expect(satisfiedAccessPolicy(credential, action, webhook)).toBeUndefined();
  }
  for (const action of [
    AccessPolicyInteraction.UPDATE,
    AccessPolicyInteraction.DELETE,
    AccessPolicyInteraction.HISTORY,
    AccessPolicyInteraction.VREAD,
  ]) {
    expect(satisfiedAccessPolicy(connection.basic, action, practitionerPolicy)).toBeUndefined();
  }
  expect(satisfiedAccessPolicy(connection.basic, AccessPolicyInteraction.READ, practitionerPolicy)).toBeUndefined();
  expect(satisfiedAccessPolicy(connection.basic, AccessPolicyInteraction.HISTORY, webhook)).toBeUndefined();
});
test('linked Basic visibility cannot select foreign settings or connections', async () => {
  const foreign: Basic = {
    resourceType: 'Basic',
    meta: { project: 'shared' },
    code: { coding: [{ system: N, code: 'calendar-settings' }] },
    identifier: [{ system: `${N}/settings`, value: 'project' }],
    extension: [{ url: `${N}/project-detail-level`, valueCode: 'full' }],
  };
  const shared = await medplum.createResource(foreign);
  await writeProjectCeiling(medplum, 'initials');
  await writeProjectCeiling(medplum, 'busy-only');
  expect(await readProjectCeiling(medplum)).toBe('busy-only');
  expect((await medplum.readResource('Basic', shared.id)).extension).toEqual(foreign.extension);
  expect(await medplum.searchResources('Basic', `code=${N}|calendar-settings`)).toHaveLength(2);
  const connection = await saveConnection(medplum, args);
  medplum.mock.setProject({ resourceType: 'Project', id: 'customer-b', name: 'b' });
  expect(await findConnection(medplum, args.practitionerRef)).toBeUndefined();
  await expect(withConnectionLease(medplum, connection.basic.id, async () => undefined)).rejects.toThrow(
    'different project'
  );
});
test('a broad Slot grant preceding the snippet defeats it and must be replaced', () => {
  const slot: Slot = {
    resourceType: 'Slot',
    status: 'busy-unavailable',
    schedule: { reference: 'Schedule/s' },
    start: '2026-11-01T10:00:00Z',
    end: '2026-11-01T11:00:00Z',
    identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'forged' }],
  };
  const policy = {
    resourceType: 'AccessPolicy' as const,
    resource: [{ resourceType: 'Slot' as const }, ...(ORDINARY_SLOT_POLICY_SNIPPET ?? [])],
  };
  expect(satisfiedAccessPolicy(slot, AccessPolicyInteraction.CREATE, policy)).toBeDefined();
});
test('malformed identifiers are retained and reported without aborting unrelated scans', async () => {
  const slot = await medplum.createResource<Slot>({
    resourceType: 'Slot',
    status: 'busy-unavailable',
    schedule: { reference: 'Schedule/s' },
    start: '2026-11-01T10:00:00Z',
    end: '2026-11-01T11:00:00Z',
    identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'broken' }],
  });
  const repair = vi.fn();
  expect(await importedSlots(medplum, 'unrelated', repair)).toEqual([]);
  expect(repair).toHaveBeenCalledWith(slot);
  expect(await medplum.readResource('Slot', slot.id)).toBeDefined();
});
test('mutations reject caller fallback, missing membership, and cross-project practitioner', async () => {
  const event: BotEvent<Parameters> = {
    bot: { reference: 'Bot/connect' },
    requester: { reference: args.practitionerRef },
    contentType: 'application/fhir+json',
    input: { resourceType: 'Parameters' },
    secrets: {},
  };
  await expect(requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect)).rejects.toThrow(
    'restricted Bot membership'
  );
  await operationIdentity(medplum, event, BOT_IDENTIFIER_VALUE.connect);
  expect(await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect)).toBe(args.practitionerRef);
  await medplum.updateResource({
    ...(await medplum.readResource('Practitioner', 'doctor')),
    meta: { project: 'other' },
  });
  await expect(requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect)).rejects.toThrow('different project');
});

test.each([
  { resourceType: 'Basic' as const, readonly: true },
  { resourceType: '*' as const, readonly: true },
  { resourceType: 'Slot' as const, criteria: 'Slot?status=busy-unavailable' },
  { resourceType: 'Basic' as const, criteria: 'Basic?_compartment=Patient/x', readonly: true },
])('audit warns about grants that could bypass ownership or credential boundaries: %j', async (entry) => {
  const policy = await medplum.createResource({ resourceType: 'AccessPolicy', resource: [entry] });
  const member = await medplum.createResource({
    resourceType: 'ProjectMembership',
    user: { reference: 'User/u' },
    project: { reference: 'Project/customer-a' },
    profile: { reference: 'Practitioner/p' },
    accessPolicy: { reference: `AccessPolicy/${policy.id}` },
  });
  expect(await auditPolicyGrants(medplum, 'customer-a')).toContain(`ProjectMembership/${member.id}`);
});

test('audit accepts only the published restricted caller snippets without warning', async () => {
  const policy = await medplum.createResource({
    resourceType: 'AccessPolicy',
    resource: [...PRACTITIONER_POLICY_SNIPPET, ...(ORDINARY_SLOT_POLICY_SNIPPET ?? [])],
  });
  const member = await medplum.createResource({
    resourceType: 'ProjectMembership',
    user: { reference: 'User/u' },
    project: { reference: 'Project/customer-a' },
    profile: { reference: 'Practitioner/p' },
    accessPolicy: { reference: `AccessPolicy/${policy.id}` },
  });
  expect(await auditPolicyGrants(medplum, 'customer-a')).not.toContain(`ProjectMembership/${member.id}`);
});

test('credential migration adds the missing legacy connection identity without replacing its resource', async () => {
  const connection = await saveConnection(medplum, args);
  await medplum.updateResource({
    ...connection.basic,
    meta: { ...connection.basic.meta, profile: [] },
    identifier: connection.basic.identifier?.filter((i) => i.system !== `${N}/connection`),
    extension: [...(connection.basic.extension ?? []), { url: TOKEN_URL, valueString: 'legacy-token' }],
  });
  await withConnectionLease(medplum, connection.basic.id, migrateCredential);
  const saved = await medplum.readResource('Basic', connection.basic.id);
  expect(saved.identifier).toContainEqual({ system: `${N}/connection`, value: args.practitionerRef });
  expect(saved.extension?.some((e) => e.url === TOKEN_URL)).toBe(false);
});

test('operation authorization accepts the server session summary and rejects a missing effective policy', async () => {
  const event = {
    bot: { reference: 'Bot/connect' },
    requester: { reference: args.practitionerRef },
    input: { resourceType: 'Parameters' },
    contentType: 'application/fhir+json',
    secrets: {},
  } as BotEvent;
  await operationIdentity(medplum, event, BOT_IDENTIFIER_VALUE.connect);
  expect(medplum.getProjectMembership()?.project).toBeUndefined();
  expect(medplum.getProjectMembership()?.accessPolicy).toBeUndefined();
  await expect(requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect)).resolves.toBe(args.practitionerRef);
  vi.mocked(medplum.getAccessPolicy).mockReturnValue(undefined);
  await expect(requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect)).rejects.toThrow(
    'restricted Bot membership'
  );
});

test('dispatcher can create async jobs without reading or changing other jobs', async () => {
  const policy = await ensureSyncAccessPolicy(medplum);
  const job = {
    resourceType: 'AsyncJob' as const,
    status: 'accepted' as const,
    request: 'https://example.com/fhir/R4/Bot/$execute',
    requestTime: '2026-01-01T00:00:00Z',
  };
  expect(satisfiedAccessPolicy(job, AccessPolicyInteraction.CREATE, policy)).toBeDefined();
  for (const action of [AccessPolicyInteraction.READ, AccessPolicyInteraction.UPDATE, AccessPolicyInteraction.DELETE]) {
    expect(satisfiedAccessPolicy(job, action, policy)).toBeUndefined();
  }
});
