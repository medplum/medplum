import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage, Repository, systemRepo } from '../fhir';
import { createPdf } from './pdf';

const binaryDir = mkdtempSync(__dirname + sep + 'binary-');

const dd: TDocumentDefinitions = { content: ['Hello world'] };

describe('Binary', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initBinaryStorage('file:' + binaryDir);
  });

  afterAll(async () => {
    await closeDatabase();
    rmSync(binaryDir, { recursive: true, force: true });
  });

  test('Create PDF', async () => {
    const binary = await createPdf(systemRepo, 'test.pdf', dd);
    expect(binary).toBeDefined();
  });

  test('Missing values', () => {
    expect(() => createPdf(null as unknown as Repository, 'test.pdf', dd)).rejects.toThrow('Missing repository');
    expect(() => createPdf(systemRepo, 'x', null as unknown as TDocumentDefinitions)).rejects.toThrow(
      'Missing document definition'
    );
  });

  test('Custom font', async () => {
    const custom: TDocumentDefinitions = {
      defaultStyle: {
        font: 'Avenir',
      },
      content: ['Hello world'],
    };
    const binary = await createPdf(systemRepo, 'custom-font.pdf', custom);
    expect(binary).toBeDefined();
  });
});
