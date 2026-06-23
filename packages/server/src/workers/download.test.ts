// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { DocumentReference, Media } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import type { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { findAndExecDownloadJob, mockFetchResponse } from './test-utils';

let repo: Repository;
const fetchMock = jest.spyOn(globalThis, 'fetch');

describe('Download Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    fetchMock.mockClear();
    getConfig().autoDownloadEnabled = true;
  });

  test('Download external URL', () =>
    withTestContext(
      async () => {
        const url = 'https://example.com/download';

        const media = await repo.createResource<Media>({
          resourceType: 'Media',
          status: 'completed',
          content: {
            contentType: ContentType.TEXT,
            url,
          },
        });
        expect(media).toBeDefined();

        fetchMock.mockImplementation(() =>
          Promise.resolve(
            new Response('foo', {
              status: 200,
              headers: {
                'content-disposition': 'attachment; filename=download',
                'content-type': ContentType.TEXT,
              },
            })
          )
        );

        await findAndExecDownloadJob(media, 'create');

        expect(fetchMock).toHaveBeenCalledWith(url, {
          headers: {
            'x-trace-id': '00-12345678901234567890123456789012-3456789012345678-01',
            traceparent: '00-12345678901234567890123456789012-3456789012345678-01',
          },
        });

        const updatedMedia = await repo.readResource<Media>('Media', media.id);
        expect(updatedMedia.content?.url).toMatch(/^Binary\//);
        expect(updatedMedia.meta?.author?.reference).toBe('system');
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Ignore media missing URL', () =>
    withTestContext(async () => {
      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: '',
        },
      });
      expect(media).toBeDefined();
      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore HTTP URL', () =>
    withTestContext(async () => {
      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'http://localhost/download',
        },
      });
      expect(media).toBeDefined();
      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');
    }));

  test('Retry on 400', () =>
    withTestContext(async () => {
      const url = 'https://example.com/download';

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url,
        },
      });
      expect(media).toBeDefined();

      fetchMock
        .mockImplementationOnce(() => Promise.resolve(mockFetchResponse(400, 'Bad Request')))
        .mockImplementationOnce(() => Promise.resolve(mockFetchResponse(200, '')));

      const jobs = await findAndExecDownloadJob(media, 'create');
      expect(jobs).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }));

  test('Retry on exception', () =>
    withTestContext(async () => {
      const url = 'https://example.com/download';

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url,
        },
      });
      expect(media).toBeDefined();

      fetchMock
        .mockImplementationOnce(() => {
          throw new Error();
        })
        .mockImplementationOnce(() => Promise.resolve(mockFetchResponse(200, '')));

      const jobs = await findAndExecDownloadJob(media, 'create');
      expect(jobs).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }));

  test('Stop retries if Resource deleted', () =>
    withTestContext(async () => {
      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });

      // At this point the job should be in the queue
      // But let's delete the resource
      await repo.deleteResource('Media', media.id);

      await findAndExecDownloadJob(media, 'create');

      // Fetch should not have been called
      expect(fetchMock).not.toHaveBeenCalled();
    }));

  test('Stop if URL changed', () =>
    withTestContext(async () => {
      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();

      // At this point the job should be in the queue
      // But let's change the URL to an internal Binary resource
      await repo.updateResource({
        ...(media as Media),
        content: {
          contentType: ContentType.TEXT,
          url: 'Binary/' + randomUUID(),
        },
      });

      await findAndExecDownloadJob(media, 'create');

      // Fetch should not have been called
      expect(fetchMock).not.toHaveBeenCalled();
    }));

  test('Ignore if disabled', () =>
    withTestContext(async () => {
      const config = getConfig();
      config.autoDownloadEnabled = false;

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();
      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore if disabled in project', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        project: {
          setting: [
            {
              name: 'autoDownloadEnabled',
              valueBoolean: false,
            },
          ],
        },
      });

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();
      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore if matches URL prefix', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        project: {
          setting: [
            {
              name: 'autoDownloadIgnoredUrlPrefixes',
              valueString: 'https://ignore.example.com',
            },
          ],
        },
      });

      const media1 = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://ignore.example.com/download',
        },
      });
      expect(media1).toBeDefined();
      await expect(findAndExecDownloadJob(media1, 'create')).rejects.toThrow('Job not found');

      // Ensure that other URLs still work
      const media2 = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media2).toBeDefined();
      await findAndExecDownloadJob(media2, 'create');
    }));

  test('Ignore if does not match allowed URL prefix', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        project: {
          setting: [
            {
              name: 'autoDownloadAllowedUrlPrefixes',
              valueString: 'https://allowed.example.com',
            },
          ],
        },
      });

      const media1 = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://ignore.example.com/download',
        },
      });
      expect(media1).toBeDefined();
      await expect(findAndExecDownloadJob(media1, 'create')).rejects.toThrow('Job not found');

      // Ensure that other URLs still work
      const media2 = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://allowed.example.com/download',
        },
      });
      expect(media2).toBeDefined();
      await findAndExecDownloadJob(media2, 'create');
    }));

  test('Stop retries if auto download disabled', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true, membership: { admin: true } });

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();

      // At this point the job should be in the queue
      // But let's disable auto download in the project
      await repo.updateResource({
        ...project,
        setting: [{ name: 'autoDownloadEnabled', valueBoolean: false }],
      });

      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');

      // Fetch should not have been called
      expect(fetchMock).not.toHaveBeenCalled();
    }));

  test('Does not enqueue when mutating non-URL fields', () =>
    withTestContext(async () => {
      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();
      await findAndExecDownloadJob(media, 'create');

      await repo.updateResource<Media>({
        ...media,
        status: 'in-progress',
      });

      await findAndExecDownloadJob(media, 'update');
    }));

  test('Updates only matching attachment paths', () =>
    withTestContext(async () => {
      const firstUrl = 'https://example.com/download-1';
      const secondUrl = 'https://example.com/download-2';

      const doc = await repo.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          {
            attachment: {
              contentType: ContentType.TEXT,
              url: firstUrl,
            },
          },
          {
            attachment: {
              contentType: ContentType.TEXT,
              url: secondUrl,
            },
          },
        ],
      });
      expect(doc).toBeDefined();

      fetchMock.mockImplementation((url: string | URL | Request) =>
        url === firstUrl
          ? Promise.resolve(
              new Response('foo1', {
                status: 200,
                headers: {
                  'content-disposition': 'attachment; filename=download-1',
                  'content-type': ContentType.TEXT,
                },
              })
            )
          : Promise.resolve(
              new Response('foo2', {
                status: 200,
                headers: {
                  'content-disposition': 'attachment; filename=download-2',
                  'content-type': ContentType.TEXT,
                },
              })
            )
      );

      const jobs1 = await findAndExecDownloadJob(doc, 'create', firstUrl);
      expect(jobs1).toHaveLength(1);

      const afterFirstDownload = await repo.readResource<DocumentReference>('DocumentReference', doc.id);
      expect(afterFirstDownload.content?.[0]?.attachment?.url).toMatch(/^Binary\//);
      expect(afterFirstDownload.content?.[1]?.attachment?.url).toBe(secondUrl);
      expect(afterFirstDownload.meta?.author?.reference).toBe('system');

      const jobs2 = await findAndExecDownloadJob(doc, 'create', secondUrl);
      expect(jobs2).toHaveLength(1);

      const afterSecondDownload = await repo.readResource<DocumentReference>('DocumentReference', doc.id);
      expect(afterSecondDownload.content?.[0]?.attachment?.url).toBe(afterFirstDownload.content[0].attachment.url);
      expect(afterSecondDownload.content?.[1]?.attachment?.url).toMatch(/^Binary\//);
      expect(afterSecondDownload.meta?.author?.reference).toBe('system');
    }));

  test('Stop retries if ignored url prefixes changes', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true, membership: { admin: true } });

      const media = await repo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: ContentType.TEXT,
          url: 'https://example.com/download',
        },
      });
      expect(media).toBeDefined();

      // At this point the job should be in the queue
      // But let's change the ignored URL prefixes in the project
      await repo.updateResource({
        ...project,
        setting: [{ name: 'autoDownloadIgnoredUrlPrefixes', valueString: 'https://example.com' }],
      });

      await expect(findAndExecDownloadJob(media, 'create')).rejects.toThrow('Job not found');

      // Fetch should not have been called
      expect(fetchMock).not.toHaveBeenCalled();
    }));
});
