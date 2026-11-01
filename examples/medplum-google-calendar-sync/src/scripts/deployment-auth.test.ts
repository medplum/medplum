// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { assertDeploymentProject, cliAccessToken } from './deployment-auth';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

test('CLI authentication captures tokens and selects the requested profile and server', () => {
  vi.mocked(execFileSync).mockReturnValue('test-token\n');
  expect(cliAccessToken('https://example.com/', 'sandbox')).toBe('test-token');
  expect(execFileSync).toHaveBeenCalledWith(
    'medplum',
    ['--base-url', 'https://example.com/', '--profile', 'sandbox', 'token'],
    expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
  );
});

test('CLI failures do not expose captured secret output', () => {
  vi.mocked(execFileSync).mockImplementation(() => {
    throw new Error('private-token-in-output');
  });
  expect(() => cliAccessToken('https://example.com/')).toThrow(
    'Medplum CLI authentication failed. Run medplum login for the selected profile and retry.'
  );
  vi.mocked(execFileSync).mockReturnValue('Unauthenticated: run medplum login');
  expect(() => cliAccessToken('https://example.com/')).toThrow('no usable access token');
});

test('deployment rejects the wrong project before any resource write', async () => {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'getProfileAsync').mockResolvedValue({ resourceType: 'Practitioner', id: 'p' });
  vi.spyOn(medplum, 'getProject').mockReturnValue({ resourceType: 'Project', id: 'customer-staging' });
  const post = vi.spyOn(medplum, 'post');
  await expect(assertDeploymentProject(medplum, 'sandbox')).rejects.toThrow('no deployment was attempted');
  expect(post).not.toHaveBeenCalled();
  await expect(assertDeploymentProject(medplum, 'customer-staging')).resolves.toBeUndefined();
});
