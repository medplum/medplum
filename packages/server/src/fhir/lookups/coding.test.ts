import { CodeSystem } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { systemRepo } from '../repo';
import { getClient } from '../../database';
import { withTestContext } from '../../test.setup';

describe('Coding lookup table', () => {
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

      const db = getClient();
      const results = await db.query('SELECT code, display FROM "Coding" WHERE system = $1', [systemResource.id]);
      expect(results.rows.map((r) => `${r.code} (${r.display})`).sort()).toEqual([
        'AB (Ambulance)',
        'CD (Cardiology)',
        'E (Emergency)',
        'F (Fibrillation)',
      ]);
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

      const db = getClient();
      const results = await db.query('SELECT code, display FROM "Coding" WHERE system = $1', [systemResource.id]);
      expect(results.rowCount).toEqual(0);
    }));
});
