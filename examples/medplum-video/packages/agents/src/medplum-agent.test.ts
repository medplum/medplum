// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { MedplumBaseAgent } from './medplum-agent';

test('onRoomJoined extracts encounter context from metadata', async () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);

  await agent.onRoomJoined(
    JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' })
  );

  expect((agent as any).encounterId).toBe('enc-1');
  expect((agent as any).patientReference).toBe('Patient/pt-1');
});

test('onRoomJoined handles undefined metadata', async () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);

  await agent.onRoomJoined(undefined);

  expect((agent as any).encounterId).toBeUndefined();
  expect((agent as any).patientReference).toBeUndefined();
});

test('writeTranscriptChunk creates Communication resource', async () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  await (agent as any).writeTranscriptChunk('patient', 'I have a headache');

  const comms = await medplum.searchResources('Communication', {
    encounter: 'Encounter/enc-1',
  });
  expect(comms.length).toBe(1);
  expect(comms[0].payload?.[0]?.contentString).toBe('I have a headache');
});

test('writeTranscriptChunk skips when no encounterId', async () => {
  const medplum = new MockClient();
  const createSpy = vi.spyOn(medplum, 'createResource');
  const agent = new MedplumBaseAgent(medplum as any);

  await (agent as any).writeTranscriptChunk('patient', 'test');

  expect(createSpy).not.toHaveBeenCalled();
});

test('writeDocument creates Binary + DocumentReference', async () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  const doc = await (agent as any).writeDocument('Test Note', '# Note', '75476-2', 'ai-clinical-note');

  expect(doc.resourceType).toBe('DocumentReference');
  expect(doc.docStatus).toBe('preliminary');
  expect(doc.subject?.reference).toBe('Patient/pt-1');
  expect(doc.content?.[0]?.attachment?.contentType).toBe('text/markdown');
});

test('writeDocument throws without encounter context', async () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);

  await expect(
    (agent as any).writeDocument('Test', '# Test', '75476-2', 'test')
  ).rejects.toThrow('Cannot write document without encounter and patient context');
});

test('Default instructions are set', () => {
  const medplum = new MockClient();
  const agent = new MedplumBaseAgent(medplum as any);
  expect(agent.instructions).toContain('healthcare AI assistant');
});
