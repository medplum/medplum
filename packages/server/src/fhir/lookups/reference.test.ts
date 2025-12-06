// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { getSystemRepo } from '../repo';
import { lookupTables } from '../searchparameter';
import type { ReferenceTableRow } from './reference';
import { ReferenceTable } from './reference';

describe('batchIndexResources', () => {
  const systemRepo = getSystemRepo();
  let refTable: ReferenceTable;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    const maybeTable = lookupTables.find((table) => table instanceof ReferenceTable);
    if (!maybeTable) {
      throw new Error('ReferenceTable not found in lookupTables');
    }
    refTable = maybeTable;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function sortFn(a: ReferenceTableRow, b: ReferenceTableRow): number {
    return a.code.localeCompare(b.code);
  }

  test('create, update, delete', async () => {
    const patient1 = randomUUID();
    const patient2 = randomUUID();
    const encounterId = randomUUID();

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      subject: { reference: 'Patient/' + patient1 },
      status: 'registered',
      code: { coding: [{ system: 'http://loinc.org', code: '3141-9' }] },
    });

    const createRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
    expect(createRows).toHaveLength(2);
    expect(createRows.sort(sortFn)).toStrictEqual([
      {
        resourceId: obs.id,
        code: 'patient',
        targetId: patient1,
      },
      {
        resourceId: obs.id,
        code: 'subject',
        targetId: patient1,
      },
    ]);

    await systemRepo.updateResource<Observation>({
      ...obs,
      subject: { reference: 'Patient/' + patient2 },
      encounter: { reference: 'Encounter/' + encounterId },
    });

    const updateRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
    expect(updateRows).toHaveLength(3);
    expect(updateRows.sort(sortFn)).toStrictEqual([
      {
        resourceId: obs.id,
        code: 'encounter',
        targetId: encounterId,
      },
      {
        resourceId: obs.id,
        code: 'patient',
        targetId: patient2,
      },
      {
        resourceId: obs.id,
        code: 'subject',
        targetId: patient2,
      },
    ]);

    await systemRepo.deleteResource('Observation', obs.id);
    const deleteRows = await refTable.getExistingRows(systemRepo.getDatabaseClient(DatabaseMode.WRITER), [obs]);
    expect(deleteRows).toHaveLength(0);
  });
});
