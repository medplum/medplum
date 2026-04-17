// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './admit-patient';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;

const { mockListParticipants, mockUpdateParticipant } = vi.hoisted(() => ({
  mockListParticipants: vi.fn().mockResolvedValue([
    { identity: 'Patient/pt-1', metadata: JSON.stringify({ role: 'patient' }) },
    { identity: 'Practitioner/pr-1', metadata: JSON.stringify({ role: 'provider' }) },
  ]),
  mockUpdateParticipant: vi.fn().mockResolvedValue({}),
}));

vi.mock('livekit-server-sdk', () => {
  const RoomServiceClient = vi.fn();
  RoomServiceClient.prototype.listParticipants = mockListParticipants;
  RoomServiceClient.prototype.updateParticipant = mockUpdateParticipant;
  return { RoomServiceClient };
});

const secrets = {
  LIVEKIT_API_KEY: { valueString: 'devkey' },
  LIVEKIT_API_SECRET: { valueString: 'secret' },
  LIVEKIT_HOST: { valueString: 'http://localhost:7880' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListParticipants.mockResolvedValue([
    { identity: 'Patient/pt-1', metadata: JSON.stringify({ role: 'patient' }) },
    { identity: 'Practitioner/pr-1', metadata: JSON.stringify({ role: 'provider' }) },
  ]);
});

test('Admits patient — transitions encounter to in-progress', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [
      { url: EXT.roomName, valueString: 'encounter-test' },
      { url: EXT.waitingRoomStatus, valueCode: 'waiting' },
    ],
  });

  await handler(medplum, { bot, input: { encounterId: encounter.id }, contentType, secrets });

  const updated = await medplum.readResource('Encounter', encounter.id);
  expect(updated.status).toBe('in-progress');
  const waitStatus = updated.extension?.find((e) => e.url === EXT.waitingRoomStatus)?.valueCode;
  expect(waitStatus).toBe('admitted');
});

test('Upgrades patient participant permissions', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-test' }],
  });

  await handler(medplum, { bot, input: { encounterId: encounter.id }, contentType, secrets });

  expect(mockUpdateParticipant).toHaveBeenCalledWith('encounter-test', 'Patient/pt-1', undefined, {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  expect(mockUpdateParticipant).toHaveBeenCalledTimes(1);
});

test('Throws when no room exists on encounter', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await expect(
    handler(medplum, { bot, input: { encounterId: encounter.id }, contentType, secrets })
  ).rejects.toThrow('No video room');
});

test('Throws when LiveKit secrets are missing', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-test' }],
  });

  await expect(
    handler(medplum, { bot, input: { encounterId: encounter.id }, contentType, secrets: {} })
  ).rejects.toThrow('Missing LiveKit secrets');
});

test('Handles participants without metadata gracefully', async () => {
  mockListParticipants.mockResolvedValueOnce([
    { identity: 'unknown-1', metadata: undefined },
    { identity: 'Patient/pt-1', metadata: JSON.stringify({ role: 'patient' }) },
  ]);

  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    extension: [{ url: EXT.roomName, valueString: 'encounter-test' }],
  });

  await handler(medplum, { bot, input: { encounterId: encounter.id }, contentType, secrets });
  expect(mockUpdateParticipant).toHaveBeenCalledTimes(1);
});
