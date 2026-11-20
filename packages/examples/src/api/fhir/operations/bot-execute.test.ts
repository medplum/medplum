// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { afterEach, expect, test, vi } from 'vitest';
import { getCompletedBotOutput, waitForBotJob } from './bot-execute.js';

const output: Parameters = {
  resourceType: 'Parameters',
  parameter: [{ name: 'responseBody', valueBoolean: false }],
};
const job = (status: AsyncJob['status'], result: Parameters = output): AsyncJob => ({
  resourceType: 'AsyncJob',
  status,
  request: 'https://example.com/fhir/R4/Bot/example/$execute',
  requestTime: '2026-01-01T00:00:00Z',
  output: result,
});

afterEach(() => vi.useRealTimers());

test('output inspection preserves a false result and rejects an error within a completed job', () => {
  expect(getCompletedBotOutput(job('completed'))).toBe(output);
  const errorOutput: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'outcome',
        resource: {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'processing', details: { text: 'Bot failed' } }],
        },
      },
    ],
  };
  expect(() => getCompletedBotOutput(job('completed', errorOutput))).toThrow('Bot failed');
  expect(() => getCompletedBotOutput({ ...job('completed'), output: undefined })).toThrow('no output');
});

test.each(['error', 'cancelled'] as const)('polling stops on %s without resubmitting', async (status) => {
  const get = vi.fn().mockResolvedValue(job(status));
  const client = { get } as unknown as MedplumClient;
  await expect(waitForBotJob(client, 'https://example.com/job/status')).rejects.toThrow(status);
  expect(get).toHaveBeenCalledTimes(1);
});

test('polling waits between attempts and stops immediately on completion', async () => {
  vi.useFakeTimers();
  const get = vi.fn().mockResolvedValueOnce(job('accepted')).mockResolvedValue(job('completed'));
  const pending = waitForBotJob({ get } as unknown as MedplumClient, 'https://example.com/job/status');
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe(output);
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenLastCalledWith('https://example.com/job/status', {
    cache: 'no-cache',
    pollStatusOnAccepted: false,
  });
  expect(vi.getTimerCount()).toBe(0);
});

test('polling limit retains the status URL without another invocation or delay', async () => {
  const get = vi.fn().mockResolvedValue(job('accepted'));
  await expect(waitForBotJob({ get } as unknown as MedplumClient, 'https://example.com/job/status', 1)).rejects.toThrow(
    'retain https://example.com/job/status'
  );
  expect(get).toHaveBeenCalledTimes(1);
});

test('transport errors propagate instead of being interpreted as completion', async () => {
  const get = vi.fn().mockRejectedValue(new Error('Network unavailable'));
  await expect(waitForBotJob({ get } as unknown as MedplumClient, 'https://example.com/job/status')).rejects.toThrow(
    'Network unavailable'
  );
});
