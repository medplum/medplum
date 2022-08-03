import { Binary, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { systemRepo } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';

describe('URL rewrite', () => {
  let config: MedplumServerConfig;
  let binary: Binary;

  beforeAll(async () => {
    config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();

    const resource = await systemRepo.createResource({
      resourceType: 'Binary',
    });
    binary = resource;
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
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

  test('Reference not found', async () => {
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
  });

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
});
