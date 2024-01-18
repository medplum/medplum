import { ContentType, deepClone } from '@medplum/core';
import { Binary, Bundle, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { initAppServices, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';
import { systemRepo } from './repo';
import { RewriteMode, rewriteAttachments } from './rewrite';

describe('URL rewrite', () => {
  let config: MedplumServerConfig;
  let binary: Binary;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initAppServices(config);

    const resource = await withTestContext(() =>
      systemRepo.createResource({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      })
    );
    binary = resource;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Null', async () => {
    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, null);
    expect(result).toBeNull();
  });

  test('Undefined', async () => {
    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, undefined);
    expect(result).toBeUndefined();
  });

  test('Binary', async () => {
    const input = {
      resourceType: 'Binary',
      contentType: ContentType.TEXT,
      id: '123',
      extension: [
        {
          url: 'Binary/123',
        },
      ],
    };

    const output = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, input);
    expect(output).toMatchObject(input);
  });

  test('Other URL', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: 'https://example.com/profile/123/picture.jpg',
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
    expect(result).toMatchObject(practitioner);
  });

  test('Reference string', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `Binary/${binary.id}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('Reference string with version', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `Binary/${binary.id}/_history/${binary.meta?.versionId}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('Reference not found', () =>
    withTestContext(async () => {
      const id = randomUUID();

      const practitioner: Practitioner = {
        resourceType: 'Practitioner',
        photo: [
          {
            contentType: 'image/jpeg',
            url: `Binary/${id}`,
          },
        ],
      };

      const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
      expect(result).toBeDefined();
      expect(result.resourceType).toBe('Practitioner');
      expect(result.photo).toBeDefined();
      expect(result.photo?.length).toBe(1);
      expect(result.photo?.[0]?.url).toBe(`Binary/${id}`);
    }));

  test('URL', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `${config.baseUrl}fhir/R4/Binary/${binary.id}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('URL with version', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `${config.baseUrl}fhir/R4/Binary/${binary.id}/_history/${binary.meta?.versionId}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('FHIR URL to reference', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `${config.baseUrl}fhir/R4/Binary/${binary.id}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.REFERENCE, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);
    expect(result.photo?.[0]?.url).toBe(`Binary/${binary.id}`);
  });

  test('Storage URL to reference', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `${config.storageBaseUrl}${binary.id}`,
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.REFERENCE, systemRepo, practitioner);
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).toBeDefined();
    expect(result.photo?.length).toBe(1);
    expect(result.photo?.[0]?.url).toBe(`Binary/${binary.id}`);
  });

  test('Consistent results', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: `Binary/${binary.id}`,
        },
      ],
    };

    const bundle: Bundle = deepClone({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: practitioner }, { resource: practitioner }],
    });

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, bundle);
    const url1 = (result.entry?.[0]?.resource as Practitioner).photo?.[0]?.url;
    const url2 = (result.entry?.[1]?.resource as Practitioner).photo?.[0]?.url;
    expect(url1).toBeDefined();
    expect(url1).toBe(url2);
  });
});
