import { assertOk, Binary, Practitioner } from '@medplum/core';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { seedDatabase } from '../seed';
import { repo } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';

describe('URL rewrite', () => {

  let config: MedplumServerConfig;
  let binary: Binary;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();

    const [outcome, resource] = await repo.createResource({
      resourceType: 'Binary',
    });
    assertOk(outcome);
    binary = resource as Binary;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Null', async () => {
    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, null);
    expect(result).toBeNull();
  });

  test('Undefined', async () => {
    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, undefined);
    expect(result).toBeUndefined();
  });

  test('Binary', async () => {
    const input = {
      resourceType: 'Binary',
      id: '123',
      extension: [{
        url: 'Binary/123',
      }]
    };

    const output = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, input);
    expect(output).toMatchObject(input);
  });

  test('Other URL', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{
        contentType: 'image/jpeg',
        url: 'https://example.com/profile/123/picture.jpg',
      }]
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, practitioner);
    expect(result).toMatchObject(practitioner);
  });

  test('Reference string', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{
        contentType: 'image/jpeg',
        url: `Binary/${binary.id}`,
      }]
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, practitioner);
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).not.toBeUndefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('Reference string with version', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{
        contentType: 'image/jpeg',
        url: `Binary/${binary.id}/_history/${binary.meta?.versionId}`
      }]
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, practitioner);
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).not.toBeUndefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('URL', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{
        contentType: 'image/jpeg',
        url: `${config.baseUrl}fhir/R4/Binary/${binary.id}`
      }]
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, practitioner);
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).not.toBeUndefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

  test('URL with version', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{
        contentType: 'image/jpeg',
        url: `${config.baseUrl}fhir/R4/Binary/${binary.id}/_history/${binary.meta?.versionId}`
      }]
    };

    const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, practitioner);
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Practitioner');
    expect(result.photo).not.toBeUndefined();
    expect(result.photo?.length).toBe(1);

    const url = new URL(result.photo?.[0]?.url as string);
    expect(url.searchParams.has('Expires')).toBe(true);
  });

});
