// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { expect, test, vi, beforeEach } from 'vitest';
import { ScribeAgent } from './scribe-agent';
import { IntakeAgent } from './intake-agent';
import { CodingAgent } from './coding-agent';

vi.mock('@medplum/core', () => {
  const MedplumClient = vi.fn();
  MedplumClient.prototype.startClientLogin = vi.fn().mockResolvedValue({});
  MedplumClient.prototype.createResource = vi.fn().mockResolvedValue({});
  MedplumClient.prototype.searchResources = vi.fn().mockResolvedValue([]);
  return { MedplumClient };
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDPLUM_CLIENT_ID = 'test-id';
  process.env.MEDPLUM_CLIENT_SECRET = 'test-secret';
});

test('entrypoint creates ScribeAgent by default', async () => {
  const { entrypoint } = await import('./entrypoint');
  const agent = await entrypoint();
  expect(agent).toBeInstanceOf(ScribeAgent);
});

test('entrypoint creates IntakeAgent from metadata', async () => {
  const { entrypoint } = await import('./entrypoint');
  const agent = await entrypoint(JSON.stringify({ agentType: 'intake' }));
  expect(agent).toBeInstanceOf(IntakeAgent);
});

test('entrypoint creates CodingAgent from metadata', async () => {
  const { entrypoint } = await import('./entrypoint');
  const agent = await entrypoint(JSON.stringify({ agentType: 'coding' }));
  expect(agent).toBeInstanceOf(CodingAgent);
});

test('entrypoint falls back to scribe for unknown type', async () => {
  const { entrypoint } = await import('./entrypoint');
  const agent = await entrypoint(JSON.stringify({ agentType: 'unknown' }));
  expect(agent).toBeInstanceOf(ScribeAgent);
});
