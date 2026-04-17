// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { ScribeAgent } from './scribe-agent';

test('ScribeAgent has scribe-specific instructions', () => {
  const medplum = new MockClient();
  const agent = new ScribeAgent(medplum as any);
  expect(agent.instructions).toContain('medical scribe');
  expect(agent.instructions).toContain('Chief Complaint');
});

test('handleTranscription writes Communication and buffers segment', async () => {
  const medplum = new MockClient();
  const createSpy = vi.spyOn(medplum, 'createResource');
  const agent = new ScribeAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  await agent.handleTranscription('patient', 'I have a headache');
  await agent.handleTranscription('provider', 'How long?');

  const commCalls = createSpy.mock.calls.filter(
    (call) => (call[0] as any).resourceType === 'Communication'
  );
  expect(commCalls.length).toBe(2);

  expect((agent as any).transcriptBuffer).toHaveLength(2);
  expect((agent as any).transcriptBuffer[0].speaker).toBe('patient');
  expect((agent as any).transcriptBuffer[1].speaker).toBe('provider');
});

test('generateClinicalNote creates transcript and note DocumentReferences', async () => {
  const medplum = new MockClient();
  const createSpy = vi.spyOn(medplum, 'createResource');
  const agent = new ScribeAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  await agent.handleTranscription('patient', 'Headache for 3 days');
  await agent.handleTranscription('provider', 'Any other symptoms?');

  createSpy.mockClear();
  await agent.generateClinicalNote();

  const docCalls = createSpy.mock.calls.filter(
    (call) => (call[0] as any).resourceType === 'DocumentReference'
  );
  expect(docCalls.length).toBe(2);
});

test('onRoomJoined logs scribe mode', async () => {
  const medplum = new MockClient();
  const agent = new ScribeAgent(medplum as any);

  const consoleSpy = vi.spyOn(console, 'log');
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1' }));

  expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('listening mode'));
});
