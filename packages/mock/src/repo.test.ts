import { Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { MockClient } from './client';
import { HomerSimpson } from './mocks';

describe('Mock Repo', () => {
  test('Create resource with ID', async () => {
    const client = new MockClient();
    const id = randomUUID();
    const result = await client.createResource({
      resourceType: 'Patient',
      id,
    });
    expect(result.id).toBe(id);
  });

  test('Create resource without ID', async () => {
    const client = new MockClient();
    const result = await client.createResource<Patient>({
      resourceType: 'Patient',
    });
    expect(result.id).toBeDefined();
  });

  test('Create resource with version ID', async () => {
    const client = new MockClient();
    const id = randomUUID();
    const versionId = randomUUID();
    const result = await client.createResource({
      resourceType: 'Patient',
      id,
      meta: {
        versionId,
      },
    });
    expect(result.id).toBe(id);
    expect(result.meta.versionId).toBe(versionId);
  });

  test('Create resource without ID', async () => {
    const client = new MockClient();
    const result = await client.createResource<Patient>({
      resourceType: 'Patient',
    });
    expect(result.id).toBeDefined();
    expect(result.meta?.versionId).toBeDefined();
  });

  test('Read Homer history', async () => {
    const client = new MockClient();
    const result = await client.readHistory('Patient', '123');
    expect(result).toBeDefined();
    expect(result.entry?.[0]?.resource).toMatchObject(HomerSimpson);
  });

  test('Search by name', async () => {
    const client = new MockClient();
    const result = await client.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: 'Simpson',
        },
      ],
    });
    expect(result).toBeDefined();
    expect(result.entry?.length).toBe(2);
  });
});
