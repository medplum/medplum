import { Media } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import fetch from 'node-fetch';
import { sep } from 'path';
import { Readable } from 'stream';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { Repository } from '../fhir/repo';
import { closeDownloadWorker, execDownloadJob, getDownloadQueue } from './download';

jest.mock('node-fetch');

const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let repo: Repository;

describe('Download Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });
  });

  afterAll(async () => {
    await shutdownApp();
    await closeDownloadWorker(); // Double close to ensure quite ignore
    rmSync(binaryDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
  });

  test('Download external URL', async () => {
    const url = 'https://example.com/download';

    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url,
      },
    });
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    const body = new Readable();
    body.push('foo');
    body.push(null);

    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: {
        get(name: string): string | undefined {
          return {
            'content-disposition': 'attachment; filename=download',
            'content-type': 'text/plain',
          }[name];
        },
      },
      body,
    }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    expect(fetch).toHaveBeenCalledWith(url);
  });

  test('Ignore media missing URL', async () => {
    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url: '',
      },
    });
    expect(media).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Retry on 400', async () => {
    const url = 'https://example.com/download';

    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url,
      },
    });
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 400 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
    const url = 'https://example.com/download';

    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url,
      },
    });
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execDownloadJob(job)).rejects.toThrow();
  });

  test('Stop retries if Resource deleted', async () => {
    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url: 'https://example.com/download',
      },
    });

    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the resource
    await repo.deleteResource('Media', media.id as string);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Stop if URL changed', async () => {
    const queue = getDownloadQueue() as any;
    queue.add.mockClear();

    const media = await repo.createResource<Media>({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'text/plain',
        url: 'https://example.com/download',
      },
    });
    expect(media).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's change the URL to an internal Binary resource
    await repo.updateResource({
      ...(media as Media),
      content: {
        contentType: 'text/plain',
        url: 'Binary/' + randomUUID(),
      },
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execDownloadJob(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });
});
