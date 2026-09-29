// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Bundle, HealthcareService, Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { saveConfigChanges } from './configSave';

async function setup(): Promise<{
  medplum: MockClient;
  service: WithId<HealthcareService>;
  room: WithId<Location>;
}> {
  const medplum = new MockClient({ seedDefaultData: false });
  const service = await medplum.createResource<HealthcareService>({
    resourceType: 'HealthcareService',
    name: 'Consult',
  });
  const room = await medplum.createResource<Location>({ resourceType: 'Location', name: 'Room 3' });
  vi.spyOn(medplum, 'executeBatch');
  return { medplum, service, room };
}

function sentBundle(medplum: MockClient): Bundle {
  return vi.mocked(medplum.executeBatch).mock.calls[0][0];
}

describe('saveConfigChanges', () => {
  test('sends nothing when nothing changed', async () => {
    const { medplum, service } = await setup();

    const result = await saveConfigChanges(medplum, [{ stored: service, draft: { ...service } }]);

    expect(result).toEqual({ saved: [], failures: [] });
    expect(medplum.executeBatch).not.toHaveBeenCalled();
  });

  test('sends only the resources that changed, as one transaction conditional on the loaded version', async () => {
    const { medplum, service, room } = await setup();

    const result = await saveConfigChanges(medplum, [
      { stored: service, draft: { ...service, name: 'Initial Consult' } },
      { stored: room, draft: { ...room } },
    ]);

    const bundle = sentBundle(medplum);
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0].request).toEqual({
      method: 'PUT',
      url: `HealthcareService/${service.id}`,
      ifMatch: `W/"${service.meta?.versionId}"`,
    });
    expect(result.failures).toEqual([]);
    expect(result.saved).toHaveLength(1);
    expect((result.saved[0].resource as HealthcareService).name).toBe('Initial Consult');
  });

  test('creates a resource that has not been stored yet', async () => {
    const { medplum } = await setup();

    const result = await saveConfigChanges(medplum, [
      { draft: { resourceType: 'HealthcareService', name: 'Walk-in', active: true } },
    ]);

    expect(sentBundle(medplum).entry?.[0].request).toEqual({ method: 'POST', url: 'HealthcareService' });
    expect(result.saved[0].resource.id).toBeDefined();
    const found = await medplum.searchResources('HealthcareService', { name: 'Walk-in' }, { cache: 'no-cache' });
    expect(found).toHaveLength(1);
  });

  test('reports a conflict, and writes nothing over, a resource another system changed since it was loaded', async () => {
    const { medplum, service } = await setup();
    await medplum.updateResource({ ...service, name: 'Renamed elsewhere' });

    const result = await saveConfigChanges(medplum, [{ stored: service, draft: { ...service, name: 'Mine' } }]);

    expect(result.saved).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].conflict).toBe(true);
    const current = await medplum.readResource('HealthcareService', service.id, { cache: 'no-cache' });
    expect(current.name).toBe('Renamed elsewhere');
  });

  test('applied as a batch, keeps what landed and reports what did not', async () => {
    const { medplum, service, room } = await setup();
    await medplum.updateResource({ ...room, name: 'Renamed elsewhere' });

    const result = await saveConfigChanges(medplum, [
      { stored: service, draft: { ...service, name: 'Mine' } },
      { stored: room, draft: { ...room, name: 'Room 3A' } },
    ]);

    expect(result.saved.map(({ change }) => change.stored?.id)).toEqual([service.id]);
    expect(result.failures.map(({ change, conflict }) => [change.stored?.id, conflict])).toEqual([[room.id, true]]);
  });

  test('a transaction refused as a whole saves nothing and keeps every change', async () => {
    const { medplum, service, room } = await setup();
    vi.mocked(medplum.executeBatch).mockRejectedValueOnce(new OperationOutcomeError(badRequest('Rejected by policy')));

    const result = await saveConfigChanges(medplum, [
      { stored: service, draft: { ...service, name: 'Mine' } },
      { stored: room, draft: { ...room, name: 'Room 3A' } },
    ]);

    expect(result.saved).toEqual([]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.every(({ conflict, message }) => !conflict && message === 'Rejected by policy')).toBe(true);
  });
});
