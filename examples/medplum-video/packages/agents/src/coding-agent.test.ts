// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { CodingAgent } from './coding-agent';

test('CodingAgent has coding-specific instructions', () => {
  const medplum = new MockClient();
  const agent = new CodingAgent(medplum as any);
  expect(agent.instructions).toContain('medical coding');
  expect(agent.instructions).toContain('ICD-10');
  expect(agent.instructions).toContain('CPT');
});

test('CodingAgent extends MedplumBaseAgent', async () => {
  const medplum = new MockClient();
  const agent = new CodingAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  expect((agent as any).encounterId).toBe('enc-1');
  expect((agent as any).patientReference).toBe('Patient/pt-1');
});
