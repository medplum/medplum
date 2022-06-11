import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { Repository, systemRepo } from '../fhir/repo';
import { initBinaryStorage } from '../fhir/storage';
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

  test('Custom table layouts', async () => {
    const layoutNames = [
      'noBorders',
      'headerLineOnly',
      'lightHorizontalLines',
      'medplumNoBorders',
      'medplumMetadata',
      'medplumObservations',
    ];

    const content: Content[] = layoutNames
      .map((name) => [
        {
          text: name,
        },
        {
          layout: name,
          table: {
            body: [
              ['First', 'Second', 'Third', 'The last one'],
              ['Value 1', 'Value 2', 'Value 3', 'Value 4'],
              ['Value 1', 'Value 2', 'Value 3', 'Value 4'],
            ],
          },
        },
      ])
      .flat();

    const docDefinition: TDocumentDefinitions = {
      content,
    };

    const binary = await createPdf(systemRepo, 'custom-table.pdf', docDefinition);
    expect(binary).toBeDefined();
  });
});
