// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type * as ImportedModule0 from '../common/range-sync';
import { findConnection, saveConnection, updateConnection } from '../common/connection';
import { readState } from '../common/state';
import { operationIdentity, empty } from '../test-auth';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';

import type { BotEvent } from '@medplum/core';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, Parameters, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarConnection } from '../common/connection';
import { handler } from './google-calendar-sync-range-bot';

const { syncRange } = vi.hoisted(() => ({
  syncRange:
    vi.fn<
      (session: unknown, connection: unknown, range: ImportedModule0.SyncRange) => Promise<Record<string, number>>
    >(),
}));

vi.mock('../common/range-sync', async (importOriginal) => {
  const original = await importOriginal<typeof ImportedModule0>();
  return { ...original, syncRange };
});

const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

const COUNTS: Record<string, number> = { candidates: 2, inserted: 2, errors: 0 };

describe('google-calendar-sync-range-bot', () => {
  let medplum: MockClient;
  let practitionerRef: string;
  let event: (input?: Parameters) => BotEvent<Parameters | undefined>;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    syncRange.mockReset();
    syncRange.mockResolvedValue(COUNTS);
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: 'proj-1' },
    });
    practitionerRef = `Practitioner/${practitioner.id}`;
    event = (input) => ({
      bot: { reference: 'Bot/sync-range' },
      contentType: 'application/fhir+json',
      input,
      secrets,
      requester: { reference: practitionerRef },
    });
    await operationIdentity(medplum, event(empty), BOT_IDENTIFIER_VALUE.syncRange);
  });

  // The server stamps meta.project on the Basic; MockClient doesn't, so the test does.
  async function connected(): Promise<CalendarConnection> {
    const saved = await saveConnection(medplum, { practitionerRef, accountSub: 's', refreshToken: 'rt' });
    const basic = await medplum.updateResource({ ...saved.basic, meta: { ...saved.basic.meta, project: 'proj-1' } });
    return { ...saved, basic };
  }

  test('refuses when not connected', async () => {
    await expect(handler(medplum, event())).rejects.toThrow('not connected');
    expect(syncRange).not.toHaveBeenCalled();
  });

  test('refuses a paused connection with a reconnect message', async () => {
    const saved = await connected();
    await updateConnection(medplum, saved, { status: 'reauth-required' });
    await expect(handler(medplum, event())).rejects.toThrow('reconnect it first');
    expect(syncRange).not.toHaveBeenCalled();
  });

  test('queues the requested range without calling Google and rejects concurrent range requests', async () => {
    await connected();
    const input: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'start', valueString: '2026-11-01T00:00:00Z' },
        { name: 'end', valueString: '2026-11-30T00:00:00Z' },
      ],
    };
    const result = await handler(medplum, event(input));
    expect(result.parameter).toContainEqual({ name: 'queued', valueBoolean: true });
    const connection = await findConnection(medplum, practitionerRef);
    expect(connection && readState(connection.basic)).toMatchObject({
      requestedRangeStart: '2026-11-01T00:00:00.000Z',
      requestedRangeEnd: '2026-11-30T00:00:00.000Z',
    });
    expect(syncRange).not.toHaveBeenCalled();
    await expect(handler(medplum, event(input))).rejects.toThrow('already pending');
  });
});
