import { indexSearchParameterBundle, indexStructureDefinitionBundle, OperationOutcomeError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { MockClient } from './client';
import { HomerSimpson } from './mocks';

describe('Mock Repo', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

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
    const result = await client.search('Patient', 'name:contains=Simpson');
    expect(result).toBeDefined();
    expect(result.entry?.length).toBe(2);
  });

  test('Search with comma', async () => {
    const client = new MockClient();
    const result = await client.search('Patient', 'name:contains=Homer,Simpson');
    expect(result).toBeDefined();
    expect(result.entry?.length).toBe(2);
  });

  test('Delete resource', async () => {
    const client = new MockClient();
    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
    });

    const resource2 = await client.readResource('Patient', resource1.id as string);
    expect(resource2).toBeDefined();
    expect(resource2.id).toEqual(resource1.id);

    await client.deleteResource('Patient', resource1.id as string);

    try {
      await client.readResource('Patient', resource1.id as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Date filters', async () => {
    const client = new MockClient();

    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    const result1 = await client.searchResources(
      'Slot',
      new URLSearchParams([
        ['start', 'gt' + month.toISOString()],
        ['start', 'lt' + new Date(month.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString()],
      ])
    );
    expect(result1).toBeDefined();
    expect(result1.length).toBeGreaterThanOrEqual(1);
  });
});
