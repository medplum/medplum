// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type { Parameters, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarConnection } from '../common/connection';
import { findConnection, saveConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { readCredential } from '../common/credentials';
import { withConnectionLease } from '../common/lease';
import { readState, withState } from '../common/state';
import { empty, operationIdentity } from '../test-auth';
import { handler } from './google-calendar-connect-bot';

const PROJECT_ID = 'proj-1';
const SCOPE =
  'openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendars.readonly';

const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

function idToken(claims: Record<string, unknown>): string {
  const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function params(values: Record<string, string>): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: Object.entries(values).map(([name, valueString]) => ({ name, valueString })),
  };
}

const CODE_VALUES = { code: 'c', codeVerifier: 'v', redirectUri: 'https://app.example/cb' };
const CODE_PARAMS = params(CODE_VALUES);

async function requireConnection(medplum: MockClient, practitionerRef: string): Promise<CalendarConnection> {
  const connection = await findConnection(medplum, practitionerRef);
  if (!connection) {
    throw new Error('Expected a connection');
  }
  return connection;
}

describe('google-calendar-connect-bot', () => {
  let medplum: MockClient;
  let practitioner: Practitioner;
  let event: (input: Parameters) => BotEvent<Parameters>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: PROJECT_ID },
      name: [{ family: 'Rivera' }],
    });
    event = (input) => ({
      bot: { reference: 'Bot/connect' },
      contentType: 'application/fhir+json',
      input,
      secrets,
      requester: { reference: `Practitioner/${practitioner.id}` },
    });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});
    await operationIdentity(medplum, event(empty), BOT_IDENTIFIER_VALUE.connect);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockGoogle(tokenBody: unknown, ...rest: Response[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi
      .fn(async (url: RequestInfo | URL) => {
        if ((url instanceof Request ? url.url : String(url)).includes('/revoke')) {
          return json(200, {});
        }
        throw new Error('Unexpected Google request');
      })
      .mockResolvedValueOnce(json(200, tokenBody));
    for (const response of rest) {
      fetchMock.mockResolvedValueOnce(response);
    }
    globalThis.fetch = fetchMock;
    return fetchMock;
  }

  test('a busy reconnect reports a retry message without exchanging or revoking the grant', async () => {
    const connection = await saveConnection(medplum, {
      practitionerRef: `Practitioner/${practitioner.id}`,
      accountSub: 'sub',
      refreshToken: 'stored',
    });
    globalThis.fetch = vi.fn();
    await withConnectionLease(medplum, connection.basic.id, async () => {
      await expect(handler(medplum, event(CODE_PARAMS))).rejects.toThrow('try reconnecting again in a few minutes');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await readCredential(medplum, connection)).toBe('stored');
  });

  test('stores the connection and starts the backfill', async () => {
    mockGoogle({
      access_token: 'at',
      refresh_token: 'rt-1',
      expires_in: 3599,
      scope: SCOPE,
      token_type: 'Bearer',
      id_token: idToken({ sub: 'sub-1', email: 'dr@clinic.example', hd: 'clinic.example' }),
    });

    const result = await handler(medplum, event(params({ ...CODE_VALUES, eventDetailLevel: 'initials' })));

    expect(result.parameter).toEqual(
      expect.arrayContaining([
        { name: 'connected', valueBoolean: true },
        { name: 'status', valueCode: 'active' },
        { name: 'email', valueString: 'dr@clinic.example' },
        { name: 'eventDetailLevel', valueCode: 'initials' },
      ])
    );
    const practitionerRef = `Practitioner/${practitioner.id}`;
    const stored = await requireConnection(medplum, practitionerRef);
    expect(stored.accountSub).toBe('sub-1');
    expect(await readCredential(medplum, stored)).toBe('rt-1');
    expect(JSON.stringify(stored.basic)).not.toContain('rt-1');
    expect(readState(stored.basic).inboundRequest).toBeTruthy();
    expect(readState(stored.basic).outboundRequest).toBeTruthy();
    expect(medplum.executeBot).not.toHaveBeenCalled();
  });

  test('reconnect during paused cleanup keeps disconnecting and clears the revoked-credential pause', async () => {
    const practitionerRef = `Practitioner/${practitioner.id}`;
    const saved = await saveConnection(medplum, { practitionerRef, accountSub: 'sub-1', refreshToken: 'rt-old' });
    await updateConnection(medplum, saved, { status: 'disconnecting' });
    const basic = await medplum.readResource('Basic', saved.basic.id);
    await medplum.updateResource(withState(basic, { ...readState(basic), inboundError: 'reauth-required' }));
    mockGoogle({
      access_token: 'at',
      refresh_token: 'rt-new',
      expires_in: 3599,
      scope: SCOPE,
      token_type: 'Bearer',
      id_token: idToken({ sub: 'sub-1' }),
    });
    await handler(medplum, event(CODE_PARAMS));
    const current = await requireConnection(medplum, practitionerRef);
    expect(current.status).toBe('disconnecting');
    expect(readState(current.basic).inboundError).toBeUndefined();
    expect(readState(current.basic).credentialRevoked).toBe(false);
  });

  test('reconnecting restores active status without creating workflow resources', async () => {
    const practitionerRef = `Practitioner/${practitioner.id}`;
    const saved = await saveConnection(medplum, { practitionerRef, accountSub: 'sub-1', refreshToken: 'rt-old' });
    await updateConnection(medplum, saved, { status: 'reauth-required' });
    mockGoogle({
      access_token: 'at',
      refresh_token: 'rt-1',
      expires_in: 3599,
      scope: SCOPE,
      token_type: 'Bearer',
      id_token: idToken({ sub: 'sub-1', email: 'dr@clinic.example' }),
    });

    await handler(medplum, event(CODE_PARAMS));

    expect((await findConnection(medplum, practitionerRef))?.status).toBe('active');
  });

  test('refuses a grant without calendar scope or without a refresh token', async () => {
    mockGoogle({ access_token: 'at', refresh_token: 'rt', expires_in: 1, scope: 'openid email', token_type: 'Bearer' });
    await expect(handler(medplum, event(CODE_PARAMS))).rejects.toThrow('did not grant');
    mockGoogle({ access_token: 'at', expires_in: 1, scope: SCOPE, token_type: 'Bearer' });
    await expect(handler(medplum, event(CODE_PARAMS))).rejects.toThrow('no refresh token');
    expect(await findConnection(medplum, `Practitioner/${practitioner.id}`)).toBeUndefined();
  });

  test('revokes a failed first-connect grant when the placeholder exists but the credential is absent', async () => {
    const create = vi.mocked(medplum.createResourceIfNoneExist).getMockImplementation()?.bind(medplum);
    if (!create) {
      throw new Error('Missing project-stamping adapter');
    }
    vi.spyOn(medplum, 'createResourceIfNoneExist').mockImplementation(async (resource, query, options) => {
      if (resource.resourceType === 'Basic' && resource.code.coding?.some((c) => c.code === 'calendar-credential')) {
        throw new Error('credential write failed');
      }
      return create(resource, query, options);
    });
    const fetch = mockGoogle({
      access_token: 'at',
      refresh_token: 'unused',
      scope: SCOPE,
      id_token: idToken({ sub: 'sub' }),
    });
    await expect(handler(medplum, event(CODE_PARAMS))).rejects.toThrow('credential write failed');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain('/revoke');
  });

  test('requires the code parameters and a Practitioner requester', async () => {
    await expect(handler(medplum, event(params({ code: 'c' })))).rejects.toThrow('Required parameters missing');
    await expect(handler(medplum, { ...event(CODE_PARAMS), requester: { reference: 'Patient/x' } })).rejects.toThrow(
      'Only a Practitioner'
    );
  });

  test('requires explicit disconnect before switching Google accounts', async () => {
    const practitionerRef = `Practitioner/${practitioner.id}`;
    await saveConnection(medplum, { practitionerRef, accountSub: 'old-sub', refreshToken: 'rt-old' });
    const fetchMock = mockGoogle({
      access_token: 'at',
      refresh_token: 'rt-new',
      scope: SCOPE,
      id_token: idToken({ sub: 'new-sub', email: 'new@clinic.example' }),
    });
    await expect(handler(medplum, event(CODE_PARAMS))).rejects.toThrow('Disconnect the existing Google account');
    expect((await requireConnection(medplum, practitionerRef)).accountSub).toBe('old-sub');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/revoke');
    expect(new URLSearchParams(fetchMock.mock.calls[1][1]?.body as string).get('token')).toBe('rt-new');
  });
});
