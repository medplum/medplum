// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AsyncJob } from '@medplum/fhirtypes';
import { vi } from 'vitest';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { getJobSystemRepo, getTrackingAsyncJobExecutor } from './base';

const repoMocks = vi.hoisted(() => ({
  global: { clone: vi.fn(), readResource: vi.fn() },
  project: { clone: vi.fn(), readResource: vi.fn() },
  shard: { clone: vi.fn(), readResource: vi.fn() },
  getGlobalSystemRepo: vi.fn(),
  getProjectSystemRepo: vi.fn(),
  getShardSystemRepo: vi.fn(),
}));

vi.mock('../fhir/repo', () => ({
  getGlobalSystemRepo: repoMocks.getGlobalSystemRepo,
  getProjectSystemRepo: repoMocks.getProjectSystemRepo,
  getShardSystemRepo: repoMocks.getShardSystemRepo,
}));

describe('job repository routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.getGlobalSystemRepo.mockReturnValue(repoMocks.global);
    repoMocks.getProjectSystemRepo.mockResolvedValue(repoMocks.project);
    repoMocks.getShardSystemRepo.mockReturnValue(repoMocks.shard);
    repoMocks.global.clone.mockReturnValue(repoMocks.global);
    repoMocks.project.clone.mockReturnValue(repoMocks.project);
    repoMocks.shard.clone.mockReturnValue(repoMocks.shard);
  });

  test('routes project jobs by project ID', async () => {
    await expect(getJobSystemRepo({ kind: 'project', projectId: 'project-1' })).resolves.toBe(repoMocks.project);
    expect(repoMocks.getProjectSystemRepo).toHaveBeenCalledWith('project-1');
  });

  test('routes system project jobs to the global shard', async () => {
    await expect(getJobSystemRepo({ kind: 'project', system: true })).resolves.toBe(repoMocks.shard);
    expect(repoMocks.getShardSystemRepo).toHaveBeenCalledWith(GLOBAL_SHARD_ID);
  });

  test('routes shard jobs by shard ID', async () => {
    await expect(getJobSystemRepo({ kind: 'shard', shardId: 'shard-1' })).resolves.toBe(repoMocks.shard);
    expect(repoMocks.getShardSystemRepo).toHaveBeenCalledWith('shard-1');
  });

  test('rejects malformed serialized targets', async () => {
    await expect(getJobSystemRepo({} as never)).rejects.toThrow('Unsupported job target kind');
  });
});

describe('AsyncJob tracking', () => {
  const asyncJob: AsyncJob & { id: string } = {
    resourceType: 'AsyncJob',
    id: 'async-job-1',
    status: 'accepted',
    request: 'https://example.com',
    requestTime: '2026-09-18T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.getGlobalSystemRepo.mockReturnValue(repoMocks.global);
    repoMocks.getProjectSystemRepo.mockResolvedValue(repoMocks.project);
    repoMocks.getShardSystemRepo.mockReturnValue(repoMocks.shard);
    repoMocks.global.clone.mockReturnValue(repoMocks.global);
    repoMocks.project.clone.mockReturnValue(repoMocks.project);
    repoMocks.shard.clone.mockReturnValue(repoMocks.shard);
    repoMocks.global.readResource.mockResolvedValue(asyncJob);
    repoMocks.project.readResource.mockResolvedValue(asyncJob);
    repoMocks.shard.readResource.mockResolvedValue(asyncJob);
  });

  test('returns an executor bound to a project-owned AsyncJob', async () => {
    const exec = await getTrackingAsyncJobExecutor({
      owner: 'project',
      projectId: 'project-1',
      asyncJobId: asyncJob.id,
    });

    expect(repoMocks.getProjectSystemRepo).toHaveBeenCalledWith('project-1');
    expect(repoMocks.project.readResource).toHaveBeenCalledWith('AsyncJob', asyncJob.id);
    expect(exec.getAsyncJob()).toBe(asyncJob);
  });

  test('returns an executor bound to a system-owned AsyncJob', async () => {
    const exec = await getTrackingAsyncJobExecutor({ owner: 'system', asyncJobId: asyncJob.id });

    expect(repoMocks.getShardSystemRepo).toHaveBeenCalledWith(GLOBAL_SHARD_ID);
    expect(repoMocks.shard.readResource).toHaveBeenCalledWith('AsyncJob', asyncJob.id);
    expect(exec.getAsyncJob()).toBe(asyncJob);
  });
});
