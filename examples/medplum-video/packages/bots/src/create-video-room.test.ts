// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './create-video-room';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;

const { mockCreateRoom } = vi.hoisted(() => ({
  mockCreateRoom: vi.fn().mockResolvedValue({ sid: 'RM_test_sid_123' }),
}));

vi.mock('livekit-server-sdk', () => {
  const RoomServiceClient = vi.fn();
  RoomServiceClient.prototype.createRoom = mockCreateRoom;
  return { RoomServiceClient };
});

const secrets = {
  LIVEKIT_API_KEY: { valueString: 'devkey' },
  LIVEKIT_API_SECRET: { valueString: 'secret' },
  LIVEKIT_HOST: { valueString: 'http://localhost:7880' },
};

function makeEncounter(overrides?: Partial<Encounter>): Encounter {
  return {
    resourceType: 'Encounter',
    id: 'enc-test-1',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    participant: [{ individual: { reference: 'Practitioner/pr-1' } }],
    period: { start: '2026-03-13T10:00:00Z' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('Creates room for scheduled encounter', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource(
    makeEncounter({ appointment: [{ reference: 'Appointment/appt-1' }] })
  );

  await handler(medplum, { bot, input: encounter, contentType, secrets });

  expect(mockCreateRoom).toHaveBeenCalledWith(
    expect.objectContaining({
      name: `encounter-${encounter.id}`,
      emptyTimeout: 900,
      maxParticipants: 10,
    })
  );

  const updated = await medplum.readResource('Encounter', encounter.id);
  const roomName = updated.extension?.find((e) => e.url === EXT.roomName)?.valueString;
  const visitMode = updated.extension?.find((e) => e.url === EXT.visitMode)?.valueCode;
  expect(roomName).toBe(`encounter-${encounter.id}`);
  expect(visitMode).toBe('scheduled');
});

test('Creates room for ad-hoc encounter (no Appointment)', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource(makeEncounter());

  await handler(medplum, { bot, input: encounter, contentType, secrets });

  expect(mockCreateRoom).toHaveBeenCalled();
  const updated = await medplum.readResource('Encounter', encounter.id);
  const visitMode = updated.extension?.find((e) => e.url === EXT.visitMode)?.valueCode;
  expect(visitMode).toBe('ad-hoc');
});

test('Skips room creation if room already exists', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource(
    makeEncounter({
      extension: [{ url: EXT.roomName, valueString: 'encounter-existing' }],
    })
  );

  const logSpy = vi.spyOn(console, 'log');
  await handler(medplum, { bot, input: encounter, contentType, secrets });

  expect(mockCreateRoom).not.toHaveBeenCalled();
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('skipping'));
});

test('Throws if LiveKit secrets are missing', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource(makeEncounter());

  await expect(handler(medplum, { bot, input: encounter, contentType, secrets: {} })).rejects.toThrow(
    'Missing LiveKit secrets'
  );
});

test('Respects custom grace period from extension', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource(
    makeEncounter({
      extension: [{ url: EXT.gracePeriod, valueInteger: 30 }],
    })
  );

  await handler(medplum, { bot, input: encounter, contentType, secrets });

  expect(mockCreateRoom).toHaveBeenCalledWith(
    expect.objectContaining({ emptyTimeout: 1800 })
  );
});
