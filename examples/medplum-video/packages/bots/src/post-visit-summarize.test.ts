// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Communication, Encounter, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './post-visit-summarize';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;
const secrets = {};

test('Creates post-visit summary from transcript Communications', async () => {
  const medplum = new MockClient();
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-13T10:00:00Z', end: '2026-03-13T10:30:00Z' },
  });

  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'completed',
    encounter: { reference: `Encounter/${encounter.id}` },
    payload: [{ contentString: 'Patient reports headache' }],
    extension: [
      { url: EXT.transcriptSpeaker, valueString: 'patient' },
      { url: EXT.transcriptTimestamp, valueInstant: '2026-03-13T10:02:00Z' },
    ],
  });

  const createSpy = vi.spyOn(medplum, 'createResource');
  await handler(medplum, { bot, input: encounter, contentType, secrets });

  const docCreations = createSpy.mock.calls.filter(
    (call) => (call[0] as any).resourceType === 'DocumentReference'
  );
  expect(docCreations.length).toBe(1);
  const doc = docCreations[0][0] as any;
  expect(doc.docStatus).toBe('preliminary');
  expect(doc.subject?.reference).toBe('Patient/pt-1');
});

test('Skips when no transcript data exists', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No transcript data'));
});

test('Skips when AI note already exists from live session', async () => {
  const medplum = new MockClient();
  const logSpy = vi.spyOn(console, 'log');

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'completed',
    encounter: { reference: `Encounter/${encounter.id}` },
    payload: [{ contentString: 'test transcript' }],
  });

  // Mock the second searchResources call (DocumentReference) to return an existing note
  const originalSearch = medplum.searchResources.bind(medplum);
  vi.spyOn(medplum, 'searchResources').mockImplementation(async (resourceType: any, params: any) => {
    if (resourceType === 'DocumentReference') {
      return [{ resourceType: 'DocumentReference', status: 'preliminary' }] as any;
    }
    return originalSearch(resourceType, params);
  });

  await handler(medplum, { bot, input: encounter, contentType, secrets });
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('AI note already exists'));
});

test('Assembles transcript from multiple Communication resources', async () => {
  const medplum = new MockClient();

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    subject: { reference: 'Patient/pt-1' },
  });

  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'completed',
    encounter: { reference: `Encounter/${encounter.id}` },
    payload: [{ contentString: 'First segment' }],
    extension: [{ url: EXT.transcriptSpeaker, valueString: 'patient' }],
  });

  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'completed',
    encounter: { reference: `Encounter/${encounter.id}` },
    payload: [{ contentString: 'Second segment' }],
    extension: [{ url: EXT.transcriptSpeaker, valueString: 'provider' }],
  });

  const createSpy = vi.spyOn(medplum, 'createResource');
  await handler(medplum, { bot, input: encounter, contentType, secrets });

  const binaryCreations = createSpy.mock.calls.filter(
    (call) => (call[0] as any).resourceType === 'Binary'
  );
  expect(binaryCreations.length).toBe(1);
});
