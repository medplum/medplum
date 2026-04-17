// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './on-video-room-ended';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;
const secrets = {};

test('Transitions encounter to finished when room ends', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-13T10:00:00Z' },
  });

  await handler(medplum, {
    bot,
    input: { roomName: `encounter-${encounter.id}` },
    contentType,
    secrets,
  });

  const updated = await medplum.readResource('Encounter', encounter.id);
  expect(updated.status).toBe('finished');
  expect(updated.period?.end).toBeDefined();
});

test('Skips if encounter is already finished', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-13T10:00:00Z', end: '2026-03-13T10:30:00Z' },
  });

  await handler(medplum, {
    bot,
    input: { roomName: `encounter-${encounter.id}` },
    contentType,
    secrets,
  });

  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already finished'));
});

test('Skips if no roomName in payload', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');

  await handler(medplum, { bot, input: {}, contentType, secrets });
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No roomName'));
});

test('Handles non-existent encounter gracefully', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');

  await handler(medplum, {
    bot,
    input: { roomName: 'encounter-nonexistent-id' },
    contentType,
    secrets,
  });

  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
});
