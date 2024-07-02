import { CodeSystem } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { DatabaseMode, getDatabasePool } from '../../database';
import { withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';

describe('Coding lookup table', () => {
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Indexes codings from complete CodeSystem resource', () =>
    withTestContext(async () => {
      const codeSystem: CodeSystem = {
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'complete',
        url: 'http://example.com/complete-code-system',
        concept: [
          { code: 'AB', display: 'Ambulance' },
          { code: 'CD', display: 'Cardiology', concept: [{ code: 'F', display: 'Fibrillation' }] },
          { code: 'E', display: 'Emergency' },
        ],
      };

      const systemResource = await systemRepo.createResource(codeSystem);

      const db = getDatabasePool(DatabaseMode.READER);
      const results = await db.query('SELECT id, code, display FROM "Coding" WHERE system = $1', [systemResource.id]);
      expect(results.rows.map((r) => `${r.code} (${r.display})`).sort()).toEqual([
        'AB (Ambulance)',
        'CD (Cardiology)',
        'E (Emergency)',
        'F (Fibrillation)',
      ]);

      const codingId = results.rows.find((r) => r.code === 'F').id;
      const properties = await db.query('SELECT target FROM "Coding_Property" WHERE coding = $1 AND value = $2', [
        codingId,
        'CD',
      ]);
      expect(properties.rowCount).toEqual(1);
      const targetId = results.rows.find((r) => r.code === 'CD').id;
      expect(properties.rows[0].target).toEqual(targetId);
    }));

  test('Omits codings from incomplete CodeSystem resource', () =>
    withTestContext(async () => {
      const codeSystem: CodeSystem = {
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'fragment',
        url: 'http://example.com/partial-code-system',
        concept: [
          { code: 'AB', display: 'Ambulance' },
          { code: 'CD', display: 'Cardiology', concept: [{ code: 'F', display: 'Fibrillation' }] },
          { code: 'E', display: 'Emergency' },
        ],
      };

      const systemResource = await systemRepo.createResource(codeSystem);

      const db = getDatabasePool(DatabaseMode.READER);
      const results = await db.query('SELECT code, display FROM "Coding" WHERE system = $1', [systemResource.id]);
      expect(results.rowCount).toEqual(0);
    }));
});
