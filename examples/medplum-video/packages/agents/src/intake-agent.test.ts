// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { IntakeAgent } from './intake-agent';

test('IntakeAgent has intake-specific instructions', () => {
  const medplum = new MockClient();
  const agent = new IntakeAgent(medplum as any);
  expect(agent.instructions).toContain('patient intake');
  expect(agent.instructions).toContain('medications');
});

test('saveIntakeData creates QuestionnaireResponse', async () => {
  const medplum = new MockClient();
  const createSpy = vi.spyOn(medplum, 'createResource');
  const agent = new IntakeAgent(medplum as any);
  await agent.onRoomJoined(JSON.stringify({ encounterId: 'enc-1', patientId: 'Patient/pt-1' }));

  await agent.saveIntakeData({
    'Reason for visit': 'Headache',
    'Current medications': 'Ibuprofen',
    'Allergies': 'None',
  });

  const qrCalls = createSpy.mock.calls.filter(
    (call) => (call[0] as any).resourceType === 'QuestionnaireResponse'
  );
  expect(qrCalls.length).toBe(1);
  const qr = qrCalls[0][0] as any;
  expect(qr.status).toBe('completed');
  expect(qr.item).toHaveLength(3);
  expect(qr.item[0].text).toBe('Reason for visit');
  expect(qr.item[0].answer[0].valueString).toBe('Headache');
});

test('saveIntakeData skips when no encounter context', async () => {
  const medplum = new MockClient();
  const createSpy = vi.spyOn(medplum, 'createResource');
  const agent = new IntakeAgent(medplum as any);

  await agent.saveIntakeData({ test: 'value' });

  expect(createSpy).not.toHaveBeenCalled();
});
