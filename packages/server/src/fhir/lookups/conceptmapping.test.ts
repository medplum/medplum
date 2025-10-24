// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LOINC, SNOMED } from '@medplum/core';
import type { ConceptMap } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';

describe('ConceptMapping lookup table', () => {
  const systemRepo = getSystemRepo();

  const conceptMap: ConceptMap = {
    resourceType: 'ConceptMap',
    status: 'active',
    group: [
      {
        source: SNOMED,
        target: LOINC,
        element: [
          {
            code: '271649006',
            target: [
              {
                code: '8480-6',
                equivalence: 'equivalent',
              },
            ],
          },
          {
            code: '271650006',
            target: [
              {
                code: '8462-4',
                equivalence: 'equivalent',
              },
            ],
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Indexes mappings from ConceptMap resource', () =>
    withTestContext(async () => {
      const systemResource = await systemRepo.createResource(conceptMap);

      const db = getDatabasePool(DatabaseMode.READER);
      const results = await db.query(
        'SELECT "sourceCode", "targetCode" FROM "ConceptMapping" WHERE "conceptMap" = $1',
        [systemResource.id]
      );
      expect(results.rows.map((r) => `${r.sourceCode} => ${r.targetCode}`).sort()).toStrictEqual([
        `271649006 => 8480-6`,
        `271650006 => 8462-4`,
      ]);
    }));

  test('Retains existing mappings when none in resource', () =>
    withTestContext(async () => {
      const systemResource = await systemRepo.createResource(conceptMap);
      await systemRepo.updateResource({ ...systemResource, group: undefined });

      const db = getDatabasePool(DatabaseMode.READER);
      const results = await db.query(
        'SELECT "sourceCode", "targetCode" FROM "ConceptMapping" WHERE "conceptMap" = $1',
        [systemResource.id]
      );
      expect(results.rows.map((r) => `${r.sourceCode} => ${r.targetCode}`).sort()).toStrictEqual([
        `271649006 => 8480-6`,
        `271650006 => 8462-4`,
      ]);
    }));

  test('Deletes lookup table rows with resource', async () => {
    const resource = await systemRepo.createResource(conceptMap);
    await systemRepo.deleteResource(resource.resourceType, resource.id);

    const db = getDatabasePool(DatabaseMode.READER);
    const results = await db.query('SELECT "sourceCode", "targetCode" FROM "ConceptMapping" WHERE "conceptMap" = $1', [
      resource.id,
    ]);
    expect(results.rows).toHaveLength(0);
  });
});
