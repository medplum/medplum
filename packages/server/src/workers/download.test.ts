import { assertOk } from '@medplum/core';
import { Media } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { mkdtempSync } from 'fs';
import fetch from 'node-fetch';
import { sep } from 'path';
import { Readable } from 'stream';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from '../fhir';
import { Repository } from '../fhir/repo';
import { seedDatabase } from '../seed';
import { closeDownloadWorker, execDownloadJob, initDownloadWorker } from './download';

jest.mock('bullmq');
jest.mock('node-fetch');

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
  });

  beforeEach(async () => {
    (fetch as any).mockClear();
  });

  test('Download external URL', async () => {
    const url = 'https://example.com/download';

    const queue = (Queue as any).mock.instances[0];
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

    (fetch as any).mockImplementation(() => ({
      status: 200,
      headers: {
        get: jest.fn(),
      },
      body,
    }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await execDownloadJob(job);

    expect(fetch).toHaveBeenCalledWith(url);
  });

  test('Ignore media missing URL', async () => {
    const queue = (Queue as any).mock.instances[0];
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

    const queue = (Queue as any).mock.instances[0];
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

    (fetch as any).mockImplementation(() => ({ status: 400 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
    const url = 'https://example.com/download';

    const queue = (Queue as any).mock.instances[0];
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

    (fetch as any).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Stop retries if Resource deleted', async () => {
    const queue = (Queue as any).mock.instances[0];
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
    // But let's delete the resource
    const [deleteOutcome] = await repo.deleteResource('Media', media?.id as string);
    assertOk(deleteOutcome);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Stop if URL changed', async () => {
    const queue = (Queue as any).mock.instances[0];
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
    const [updateOutcome] = await repo.updateResource({
      ...(media as Media),
      content: {
        contentType: 'text/plain',
        url: 'Binary/' + randomUUID(),
      },
    });
    assertOk(updateOutcome);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });
});
