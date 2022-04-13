import { MedplumClient } from './client';
import { allOk, assertOk, badRequest } from './outcomes';
import { LegacyRepositoryClient } from './repo';
import { Operator } from './search';

describe('LegacyRepositoryClient', () => {
  test('Create success', async () => {
    const client = new LegacyRepositoryClient({
      createResource: async (resource: any) => resource,
    } as unknown as MedplumClient);
    const [outcome, result] = await client.createResource({ resourceType: 'Patient' });
    assertOk(outcome, result);
  });

  test('Create failure', async () => {
    const client = new LegacyRepositoryClient({
      createResource: () => Promise.reject(badRequest('Resource already exists')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.createResource({ resourceType: 'Patient' });
    expect(outcome).toMatchObject(badRequest('Resource already exists'));
    expect(result).toBeUndefined();
  });

  test('Read success', async () => {
    const client = new LegacyRepositoryClient({
      readResource: () => Promise.resolve({ resourceType: 'Patient' }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readResource('Patient', '123');
    assertOk(outcome, result);
  });

  test('Read failure', async () => {
    const client = new LegacyRepositoryClient({
      readResource: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readResource('Patient', '123');
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Read reference success', async () => {
    const client = new LegacyRepositoryClient({
      readReference: () => Promise.resolve({ resourceType: 'Patient' }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readReference({ reference: 'Patient/123' });
    assertOk(outcome, result);
  });

  test('Read reference failure', async () => {
    const client = new LegacyRepositoryClient({
      readReference: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readReference({ reference: 'Patient/123' });
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Read history success', async () => {
    const client = new LegacyRepositoryClient({
      readHistory: () =>
        Promise.resolve({ resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Patient' } }] }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readHistory('Patient', '123');
    assertOk(outcome, result);
  });

  test('Read history failure', async () => {
    const client = new LegacyRepositoryClient({
      readHistory: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readHistory('Patient', '123');
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Read version success', async () => {
    const client = new LegacyRepositoryClient({
      readVersion: () => Promise.resolve({ resourceType: 'Patient' }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readVersion('Patient', '123', '456');
    assertOk(outcome, result);
  });

  test('Read version failure', async () => {
    const client = new LegacyRepositoryClient({
      readVersion: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.readVersion('Patient', '123', '456');
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Update success', async () => {
    const client = new LegacyRepositoryClient({
      updateResource: async (resource: any) => resource,
    } as unknown as MedplumClient);
    const [outcome, result] = await client.updateResource({ resourceType: 'Patient' });
    assertOk(outcome, result);
  });

  test('Update failure', async () => {
    const client = new LegacyRepositoryClient({
      updateResource: () => Promise.reject(badRequest('Bad request')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.updateResource({ resourceType: 'Patient' });
    expect(outcome).toMatchObject(badRequest('Bad request'));
    expect(result).toBeUndefined();
  });

  test('Delete success', async () => {
    const client = new LegacyRepositoryClient({
      deleteResource: () => Promise.resolve(allOk),
    } as unknown as MedplumClient);
    const [outcome] = await client.deleteResource('Patient', '123');
    assertOk(outcome, {});
  });

  test('Delete failure', async () => {
    const client = new LegacyRepositoryClient({
      deleteResource: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.deleteResource('Patient', '123');
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Patch success', async () => {
    const client = new LegacyRepositoryClient({
      patchResource: () => Promise.resolve({ resourceType: 'Patient' }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.patchResource('Patient', '123', []);
    assertOk(outcome, result);
  });

  test('Patch failure', async () => {
    const client = new LegacyRepositoryClient({
      patchResource: () => Promise.reject(badRequest('Resource not found')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.patchResource('Patient', '123', []);
    expect(outcome).toMatchObject(badRequest('Resource not found'));
    expect(result).toBeUndefined();
  });

  test('Search success', async () => {
    const client = new LegacyRepositoryClient({
      search: () => Promise.resolve({ resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Patient' } }] }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.search('Patient?name=eve');
    assertOk(outcome, result);
  });

  test('Search by request object success', async () => {
    const client = new LegacyRepositoryClient({
      search: () => Promise.resolve({ resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Patient' } }] }),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    });
    assertOk(outcome, result);
  });

  test('Search failure', async () => {
    const client = new LegacyRepositoryClient({
      search: () => Promise.reject(badRequest('Invalid search')),
    } as unknown as MedplumClient);
    const [outcome, result] = await client.search('Patient?name=eve');
    expect(outcome).toMatchObject(badRequest('Invalid search'));
    expect(result).toBeUndefined();
  });
});
