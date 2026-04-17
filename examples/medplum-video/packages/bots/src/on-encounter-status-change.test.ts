// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './on-encounter-status-change';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;

const { mockDeleteRoom } = vi.hoisted(() => ({
  mockDeleteRoom: vi.fn().mockResolvedValue({}),
}));

vi.mock('livekit-server-sdk', () => {
  const RoomServiceClient = vi.fn();
  RoomServiceClient.prototype.deleteRoom = mockDeleteRoom;
  return { RoomServiceClient };
});

const secrets = {
  LIVEKIT_API_KEY: { valueString: 'devkey' },
  LIVEKIT_API_SECRET: { valueString: 'secret' },
  LIVEKIT_HOST: { valueString: 'http://localhost:7880' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('Logs when encounter becomes in-progress', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('in-progress'));
});

test('Deletes LiveKit room when encounter finishes', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-room-1' }],
    period: { start: '2026-03-13T10:00:00Z' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(mockDeleteRoom).toHaveBeenCalledWith('encounter-room-1');
});

test('Sets period.end when encounter finishes without one', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-13T10:00:00Z' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  const updated = await medplum.readResource('Encounter', encounter.id);
  expect(updated.period?.end).toBeDefined();
});

test('Handles room deletion failure gracefully', async () => {
  mockDeleteRoom.mockRejectedValueOnce(new Error('Room not found'));
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-gone' }],
    period: { start: '2026-03-13T10:00:00Z' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('may already be closed'));
});

test('Skips room deletion if no room name on encounter', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-13T10:00:00Z' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(mockDeleteRoom).not.toHaveBeenCalled();
});
