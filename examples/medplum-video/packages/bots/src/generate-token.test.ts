// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './generate-token';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;

const { mockToJwt, mockAddGrant } = vi.hoisted(() => ({
  mockToJwt: vi.fn().mockResolvedValue('mock-jwt-token'),
  mockAddGrant: vi.fn(),
}));

vi.mock('livekit-server-sdk', () => {
  const AccessToken = vi.fn();
  AccessToken.prototype.addGrant = mockAddGrant;
  AccessToken.prototype.toJwt = mockToJwt;
  return { AccessToken };
});

const secrets = {
  LIVEKIT_API_KEY: { valueString: 'devkey' },
  LIVEKIT_API_SECRET: { valueString: 'secret' },
  LIVEKIT_WS_URL: { valueString: 'ws://localhost:7880' },
  MEDPLUM_PROFILE_REFERENCE: { valueString: 'Practitioner/pr-1' },
  MEDPLUM_PROFILE_DISPLAY: { valueString: 'Dr. Test' },
};

async function createEncounterWithRoom(medplum: MockClient, status: string = 'arrived'): Promise<Encounter> {
  return medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: status as Encounter['status'],
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-test-room' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('Generates token for provider with full permissions', async () => {
  const medplum = new MockClient();
  const encounter = await createEncounterWithRoom(medplum);

  const result = await handler(medplum, {
    bot,
    input: { encounterId: encounter.id, participantRole: 'provider' },
    contentType,
    secrets,
  });

  expect(result.token).toBe('mock-jwt-token');
  expect(result.roomName).toBe('encounter-test-room');
  expect(result.waitingRoom).toBe(false);
  expect(mockAddGrant).toHaveBeenCalledWith(
    expect.objectContaining({ canPublish: true, canSubscribe: true })
  );
});

test('Patient gets waiting-room-restricted token when encounter not in-progress', async () => {
  const medplum = new MockClient();
  const encounter = await createEncounterWithRoom(medplum, 'arrived');

  const result = await handler(medplum, {
    bot,
    input: { encounterId: encounter.id, participantRole: 'patient' },
    contentType,
    secrets,
  });

  expect(result.waitingRoom).toBe(true);
  expect(mockAddGrant).toHaveBeenCalledWith(
    expect.objectContaining({ canPublish: false, canSubscribe: true })
  );

  const updated = await medplum.readResource('Encounter', encounter.id);
  const waitStatus = updated.extension?.find((e) => e.url === EXT.waitingRoomStatus)?.valueCode;
  expect(waitStatus).toBe('waiting');
});

test('Patient gets full token when encounter is in-progress', async () => {
  const medplum = new MockClient();
  const encounter = await createEncounterWithRoom(medplum, 'in-progress');

  const result = await handler(medplum, {
    bot,
    input: { encounterId: encounter.id, participantRole: 'patient' },
    contentType,
    secrets,
  });

  expect(result.waitingRoom).toBe(false);
  expect(mockAddGrant).toHaveBeenCalledWith(
    expect.objectContaining({ canPublish: true })
  );
});

test('Throws when room not yet created', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await expect(
    handler(medplum, {
      bot,
      input: { encounterId: encounter.id, participantRole: 'provider' },
      contentType,
      secrets,
    })
  ).rejects.toThrow('Video room not yet created');
});

test('Throws when LiveKit secrets are missing', async () => {
  const medplum = new MockClient();
  const encounter = await createEncounterWithRoom(medplum);

  await expect(
    handler(medplum, {
      bot,
      input: { encounterId: encounter.id, participantRole: 'provider' },
      contentType,
      secrets: {},
    })
  ).rejects.toThrow('Missing LiveKit secrets');
});

test('Uses fallback identity when profile not in secrets', async () => {
  const medplum = new MockClient();
  const encounter = await createEncounterWithRoom(medplum);

  const { AccessToken } = await import('livekit-server-sdk');

  await handler(medplum, {
    bot,
    input: { encounterId: encounter.id, participantRole: 'provider' },
    contentType,
    secrets: {
      LIVEKIT_API_KEY: { valueString: 'devkey' },
      LIVEKIT_API_SECRET: { valueString: 'secret' },
      LIVEKIT_WS_URL: { valueString: 'ws://localhost:7880' },
    },
  });

  expect(AccessToken).toHaveBeenCalledWith(
    'devkey',
    'secret',
    expect.objectContaining({
      identity: expect.stringContaining('provider-'),
      name: 'Participant',
    })
  );
});
