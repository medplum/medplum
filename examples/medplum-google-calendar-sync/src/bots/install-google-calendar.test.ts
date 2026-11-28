// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, ResourceArray } from '@medplum/core';
import { isOk } from '@medplum/core';
import type { Bot, ExtractResource, OperationOutcome, Parameters, Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { INSTALL_SYSTEM } from '../common/constants';
import { LEASE_URL } from '../common/lease';
import { readState } from '../common/state';
import { connect } from '../test-auth';
import { handler } from './install-google-calendar';

function outcome(result: Parameters): OperationOutcome {
  return result.parameter?.find((p) => p.name === 'outcome')?.resource as OperationOutcome;
}

const REQUIRED = { GOOGLE_CALENDAR_CLIENT_ID: 'cid', GOOGLE_CALENDAR_CLIENT_SECRET: 'secret-1' };

describe('install-google-calendar', () => {
  let medplum: MockClient;
  let project: Project;
  let syncBot: Bot;
  let importBot: Bot;
  let webhookBot: Bot;
  let event: (input: Parameters) => BotEvent<Parameters>;

  async function install(values: Record<string, string>): Promise<Parameters> {
    const current = await medplum.readResource('Project', project.id as string);
    await medplum.updateResource({
      ...current,
      secret: [
        ...(current.secret ?? []).filter((s) => !Object.hasOwn(values, s.name)),
        ...Object.entries(values).map(([name, valueString]) => ({ name, valueString })),
      ],
    });
    return handler(medplum, event({ resourceType: 'Parameters' }));
  }

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    project = await medplum.createResource<Project>({
      resourceType: 'Project',
      name: 'Customer',
      features: ['bots', 'cron'],
    });
    medplum.mock.setProject(project);
    for (const value of [
      'google-calendar-connect-bot',
      'google-calendar-settings-bot',
      'google-calendar-disconnect-bot',
    ]) {
      await medplum.createResource<Bot>({
        resourceType: 'Bot',
        name: value,
        runAsUser: false,
        identifier: [{ system: 'https://www.medplum.com/bots', value }],
      });
    }
    vi.spyOn(medplum, 'getProfileAsync').mockResolvedValue({
      resourceType: 'Practitioner',
      id: 'admin',
      meta: { project: project.id },
    });
    syncBot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'sync',
      identifier: [{ system: 'https://www.medplum.com/bots', value: 'google-calendar-sync-bot' }],
    });
    importBot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'import',
      identifier: [{ system: 'https://www.medplum.com/bots', value: 'google-calendar-import-bot' }],
    });
    webhookBot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'webhook',
      publicWebhook: true,
      identifier: [{ system: 'https://www.medplum.com/bots', value: 'google-calendar-webhook-bot' }],
    });
    event = (input) => ({
      bot: { reference: 'Bot/install' },
      contentType: 'application/fhir+json',
      input,
      secrets: {},
    });
  });

  // Install keys policies and subscriptions by tag, and memberships by identifier.
  function ours<T extends 'Subscription' | 'AccessPolicy' | 'ProjectMembership' | 'Cron'>(
    type: T
  ): Promise<ResourceArray<ExtractResource<T>>> {
    const byTag = type === 'Subscription' || type === 'AccessPolicy';
    return medplum.searchResources(type, byTag ? { _tag: `${INSTALL_SYSTEM}|` } : { identifier: `${INSTALL_SYSTEM}|` });
  }

  test('reinstall queues privacy work without taking a busy worker lease', async () => {
    const connection = await connect(medplum, 'Practitioner/p', 'sub', 'synthetic');
    const held = {
      url: LEASE_URL,
      extension: [
        { url: 'owner', valueString: 'worker' },
        { url: 'expires', valueInstant: new Date(Date.now() + 60_000).toISOString() },
      ],
    };
    await medplum.updateResource({ ...connection.basic, extension: [...(connection.basic.extension ?? []), held] });
    await install(REQUIRED);
    const saved = await medplum.readResource('Basic', connection.basic.id);
    expect(saved.extension?.find((e) => e.url === LEASE_URL)).toEqual(held);
    expect(readState(saved).privacyPending).toBe(true);
    expect(readState(saved).outboundRequest).toBeTruthy();
  });

  test('requires the client credentials as project secrets, and a true/false detail switch', async () => {
    await expect(install({ GOOGLE_CALENDAR_CLIENT_ID: 'cid' })).rejects.toThrow(
      'GOOGLE_CALENDAR_CLIENT_SECRET is not a project secret'
    );
    await expect(install({ ...REQUIRED, GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS: 'initials' })).rejects.toThrow(
      'must be true or false'
    );
  });

  test('installs from the Google client a customer admin entered as project secrets', async () => {
    const stored = await medplum.readResource('Project', project.id as string);
    await medplum.updateResource({
      ...stored,
      secret: [
        { name: 'GOOGLE_CALENDAR_CLIENT_ID', valueString: 'console-cid' },
        { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', valueString: 'console-secret' },
      ],
    });
    const result = await handler(medplum, event({ resourceType: 'Parameters' }));
    expect(isOk(outcome(result))).toBe(true);
    const after = await medplum.readResource('Project', project.id as string);
    expect(after.secret).toEqual(
      expect.arrayContaining([
        { name: 'GOOGLE_CALENDAR_CLIENT_ID', valueString: 'console-cid' },
        { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', valueString: 'console-secret' },
        expect.objectContaining({ name: 'GOOGLE_CALENDAR_WEBHOOK_URL' }),
      ])
    );
  });

  test('requires the bots feature and the shared Bots', async () => {
    await medplum.updateResource({ ...project, features: [] });
    await expect(install(REQUIRED)).rejects.toThrow('"bots" feature');
    await medplum.updateResource({ ...project, features: ['bots', 'cron'] });
    await medplum.deleteResource('Bot', syncBot.id as string);
    await expect(install(REQUIRED)).rejects.toThrow('google-calendar-sync-bot not found');
  });

  test('wires the project up, and re-running repairs rather than duplicates', async () => {
    const first = await install({ ...REQUIRED, GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS: 'true' });
    expect(isOk(outcome(first))).toBe(true);
    expect(outcome(first).issue[0].details?.text).toContain('subject=%profile');
    expect(outcome(first).issue[0].details?.text).toMatch(/Reconcile runs hourly \(\d+ \* \* \* \*\)/);

    const stored = await medplum.readResource('Project', project.id as string);
    expect(stored.secret).toEqual(
      expect.arrayContaining([
        { name: 'GOOGLE_CALENDAR_CLIENT_ID', valueString: 'cid' },
        { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', valueString: 'secret-1' },
        { name: 'GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS', valueString: 'true' },
      ])
    );

    // MockClient seeds sample resources of these types, so only ours are counted.
    const subscriptions = await ours('Subscription');
    expect(subscriptions).toHaveLength(4);
    expect(
      subscriptions
        .filter((s) => ['Appointment', 'Slot'].includes(s.criteria))
        .every((s) => s.channel?.endpoint === `Bot/${syncBot.id}`)
    ).toBe(true);
    expect(
      subscriptions
        .find((s) => s.criteria === 'Appointment')
        ?.extension?.filter((e) => e.valueCode)
        .map((e) => e.valueCode)
    ).toEqual(['create', 'update', 'delete']);
    const memberships = await ours('ProjectMembership');
    expect(memberships).toHaveLength(6);
    expect(memberships.map((m) => m.profile.reference)).toEqual(
      expect.arrayContaining([`Bot/${syncBot.id}`, `Bot/${importBot.id}`, `Bot/${webhookBot.id}`])
    );
    const crons = await ours('Cron');
    expect(crons).toHaveLength(2);
    expect(crons[0]).toMatchObject({ active: true, targetReference: { reference: `Bot/${syncBot.id}` } });
    expect(memberships.some((m) => `ProjectMembership/${m.id}` === crons[0].onBehalfOf?.reference)).toBe(true);
    const policies = await ours('AccessPolicy');
    expect(policies).toHaveLength(4);
    expect(memberships.every((m) => policies.some((p) => m.accessPolicy?.reference === `AccessPolicy/${p.id}`))).toBe(
      true
    );

    // Rotate the client secret: replaced in place, nothing else duplicated.
    await install({ ...REQUIRED, GOOGLE_CALENDAR_CLIENT_SECRET: 'secret-2' });
    const rotated = await medplum.readResource('Project', project.id as string);
    expect(rotated.secret?.find((s) => s.name === 'GOOGLE_CALENDAR_CLIENT_SECRET')?.valueString).toBe('secret-2');
    expect(rotated.secret).toHaveLength(4);
    expect(await ours('Subscription')).toHaveLength(4);
    expect(await ours('ProjectMembership')).toHaveLength(6);
    expect(await ours('Cron')).toHaveLength(2);
  });

  test('repointing an existing Cron at the shared Bot passes through inactive so the scheduler re-registers it', async () => {
    const retired = await medplum.createResource<Bot>({ resourceType: 'Bot', name: 'retired reconcile' });
    const member = await medplum.createResource({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${project.id}` },
      user: { reference: `Bot/${retired.id}` },
      profile: { reference: `Bot/${retired.id}` },
    });
    const stale = await medplum.createResource({
      resourceType: 'Cron',
      identifier: [{ system: INSTALL_SYSTEM, value: 'work-cron' }],
      active: true,
      cronString: '* * * * *',
      targetReference: { reference: `Bot/${retired.id}` },
      onBehalfOf: { reference: `ProjectMembership/${member.id}` },
    });
    await install(REQUIRED);
    const current = await medplum.readResource('Cron', stale.id);
    expect(current).toMatchObject({ active: true, targetReference: { reference: `Bot/${syncBot.id}` } });
    const versions = (await medplum.readHistory('Cron', stale.id)).entry?.map((e) => e.resource) ?? [];
    expect(versions.some((v) => v?.active === false)).toBe(true);

    // A second install changes nothing, so it does not bounce the schedule.
    await install(REQUIRED);
    const again = (await medplum.readHistory('Cron', stale.id)).entry?.length ?? 0;
    expect(again).toBe(versions.length + 1);
  });

  test('refuses to install without the cron feature', async () => {
    await medplum.updateResource({ ...project, features: ['bots'] });
    await expect(install(REQUIRED)).rejects.toThrow('"cron" feature');
    expect(await ours('Cron')).toHaveLength(0);
  });
  test('adopts the home-project Bot membership instead of creating a second identity', async () => {
    const membership = await medplum.createResource({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${project.id}` },
      user: { reference: `Bot/${syncBot.id}` },
      profile: { reference: `Bot/${syncBot.id}` },
    });
    await install(REQUIRED);
    const matches = await medplum.searchResources('ProjectMembership', { profile: `Bot/${syncBot.id}` });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(membership.id);
    expect(matches[0].accessPolicy?.reference).toBeTruthy();
    expect(matches[0].admin).toBe(false);
  });
});
