import { ContentType, createReference, deepClone, getReferenceString } from '@medplum/core';
import { Binary, Bundle, Media, Patient, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { initAppServices, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';
import { Repository, getSystemRepo } from './repo';
import { RewriteMode, rewriteAttachments } from './rewrite';

describe('URL rewrite', () => {
  const systemRepo = getSystemRepo();
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

  test('Security context', async () => {
    const patient = await withTestContext(() => systemRepo.createResource<Patient>({ resourceType: 'Patient' }));

    const binaryWithSecurityContext = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
        securityContext: createReference(patient),
      })
    );

    const media = await withTestContext(() =>
      systemRepo.createResource<Media>({
        resourceType: 'Media',
        status: 'completed',
        content: { url: getReferenceString(binaryWithSecurityContext) },
      })
    );

    // Repo1: Can read both Binary and Patient
    // This should successfully rewrite the binary to a presigned URL
    const repo1 = new Repository({
      author: createReference(patient),
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary' }, { resourceType: 'Patient' }],
      },
    });
    const result1 = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo1, media);
    expect(result1.content?.url).not.toBe(`Binary/${binaryWithSecurityContext.id}`);
    expect(result1.content?.url).toContain('Expires=');

    // Repo2: Can only read Binary, not Patient
    // This should not rewrite the binary to a presigned URL
    const repo2 = new Repository({
      author: createReference(patient),
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary' }],
      },
    });
    const result2 = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo2, media);
    expect(result2.content?.url).toBe(`Binary/${binaryWithSecurityContext.id}`);
    expect(result2.content?.url).not.toContain('Expires=');

    // Repo3: AccessPolicy limits to specific Patient
    // This should successfully rewrite the binary to a presigned URL
    const repo3 = new Repository({
      author: createReference(patient),
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary' }, { resourceType: 'Patient', criteria: `Patient?_id=${patient.id}` }],
      },
    });
    const result3 = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo3, media);
    expect(result3.content?.url).not.toBe(`Binary/${binaryWithSecurityContext.id}`);
    expect(result3.content?.url).toContain('Expires=');

    // Repo3: AccessPolicy limits to different Patient
    // This should not rewrite the binary to a presigned URL
    const repo4 = new Repository({
      author: createReference(patient),
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary' }, { resourceType: 'Patient', criteria: `Patient?_id=${randomUUID()}` }],
      },
    });
    const result4 = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo4, media);
    expect(result4.content?.url).toBe(`Binary/${binaryWithSecurityContext.id}`);
    expect(result4.content?.url).not.toContain('Expires=');
  });
});
