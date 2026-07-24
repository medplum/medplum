// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Mock } from 'vitest';
import { vi } from 'vitest';

export class Queue {
  add = vi.fn().mockImplementation(async (jobName: string, jobData: any, options: any) => ({
    id: '123',
    name: jobName,
    data: jobData,
    opts: options,
  })) as Mock;
  obliterate = vi.fn().mockResolvedValue(undefined) as Mock;
  upsertJobScheduler = vi.fn().mockResolvedValue(undefined) as Mock;
  removeJobScheduler = vi.fn().mockResolvedValue(undefined) as Mock;
  close = vi.fn().mockResolvedValue(undefined) as Mock;
  getWaitingCount = vi.fn().mockResolvedValue(0) as Mock;
  getDelayedCount = vi.fn().mockResolvedValue(0) as Mock;
  setGlobalConcurrency = vi.fn().mockResolvedValue(0) as Mock;
  removeGlobalConcurrency = vi.fn().mockResolvedValue(0) as Mock;
}
export const Worker = vi.fn().mockImplementation(function Worker() {
  return {
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}) as Mock;
export const DelayedError = class DelayedError extends Error {};
export const Job = vi.fn().mockImplementation(function Job(
  _queue: unknown,
  name: string,
  data: unknown,
  opts?: { attempts?: number }
) {
  return {
    name,
    data,
    opts,
    token: undefined as string | undefined,
    attemptsMade: 0,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    changePriority: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateData: vi.fn().mockResolvedValue(undefined),
  };
}) as Mock;
export class UnrecoverableError extends Error {}
