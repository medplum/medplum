import { assertOk } from '@medplum/core';
import { Media } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import fetch from 'node-fetch';
import { sep } from 'path';
import { Readable } from 'stream';
import { SpyInstance, vi } from 'vitest';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { Repository } from '../fhir/repo';
import { initBinaryStorage } from '../fhir/storage';
import { seedDatabase } from '../seed';
import { closeDownloadWorker, execDownloadJob, initDownloadWorker } from './download';

vi.mock('bullmq');
vi.mock('node-fetch');

const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let repo: Repository;

describe('Download Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initBinaryStorage('file:' + binaryDir);
    await initDownloadWorker(config.redis);

    repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });
  });

  afterAll(async () => {
    await closeDatabase();
    await closeDownloadWorker();
    await closeDownloadWorker(); // Double close to ensure quite ignore
    rmSync(binaryDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    (fetch as unknown as SpyInstance).mockClear();
  });

  test('Download external URL', async () => {
    const url = 'https://example.com/download';

    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url,
      },
    });

    expect(mediaOutcome.id).toEqual('created');
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    const body = new Readable();
    body.push('foo');
    body.push(null);

    (fetch as unknown as SpyInstance).mockImplementation(() => ({
      status: 200,
      headers: {
        get: vi.fn(),
      },
      body,
    }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    expect(fetch).toHaveBeenCalledWith(url);
  });

  test('Ignore media missing URL', async () => {
    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url: '',
      },
    });

    expect(mediaOutcome.id).toEqual('created');
    expect(media).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Retry on 400', async () => {
    const url = 'https://example.com/download';

    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url,
      },
    });

    expect(mediaOutcome.id).toEqual('created');
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as SpyInstance).mockImplementation(() => ({ status: 400 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
    const url = 'https://example.com/download';

    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url,
      },
    });

    expect(mediaOutcome.id).toEqual('created');
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as SpyInstance).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Stop retries if Resource deleted', async () => {
    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url: 'https://example.com/download',
      },
    });

    assertOk(mediaOutcome, media);
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the resource
    const [deleteOutcome] = await repo.deleteResource('Media', media?.id as string);
    assertOk(deleteOutcome, media);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Stop if URL changed', async () => {
    const queue = (Queue as unknown as SpyInstance<any[], Queue>).mock.results[0].value;
    queue.add.mockClear();

    const [mediaOutcome, media] = await repo.createResource<Media>({
      resourceType: 'Media',
      content: {
        contentType: 'text/plain',
        url: 'https://example.com/download',
      },
    });

    expect(mediaOutcome.id).toEqual('created');
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's change the URL to an internal Binary resource
    const [updateOutcome, updated] = await repo.updateResource({
      ...(media as Media),
      content: {
        contentType: 'text/plain',
        url: 'Binary/' + randomUUID(),
      },
    });
    assertOk(updateOutcome, updated);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });
});
