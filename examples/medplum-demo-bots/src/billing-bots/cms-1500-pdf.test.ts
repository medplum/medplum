import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Claim, HumanName, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { createWriteStream } from 'fs';
import PdfPrinter from 'pdfmake';
import { formatHumanName, getCms1500DocumentDefinition, handler } from './cms-1500-pdf';
import { fullAnswer } from './cms-1500-test-data';

describe('CMS 1500 PDF Bot', async () => {
  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
  });

  test.skip('Actual PDF', async () => {
    await medplum.executeBatch(fullAnswer);

    const claim = (await medplum.searchOne('Claim', {
      identifier: 'example-claim-cms1500',
    })) as Claim;

    const docDefinition = await getCms1500DocumentDefinition(medplum, claim);

    const printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    pdfDoc.pipe(createWriteStream(`cms-1500-${Date.now()}.pdf`));
    pdfDoc.end();
  });

  test('Fully answered CMS1500 pdf', async () => {
    await medplum.executeBatch(fullAnswer);

    const claim = (await medplum.searchOne('Claim', {
      identifier: 'example-claim-cms1500',
    })) as Claim;

    const response = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: claim,
      secrets: {},
      contentType: 'application/fhir+json',
    });

    expect(response).toBeDefined();
    expect(response.resourceType).toStrictEqual('Media');
    expect(response.content.contentType).toStrictEqual('application/pdf');
  });
});

describe('formatHumanName', () => {
  test('formats full name with middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael');
  });

  test('formats name without middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John'],
    };
    expect(formatHumanName(name)).toBe('Smith, John');
  });

  test('formats multiple middle names', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael', 'Robert'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael Robert');
  });

  test('formats family name only', () => {
    const name: HumanName = {
      family: 'Smith',
    };
    expect(formatHumanName(name)).toBe('Smith');
  });

  test('formats given names only', () => {
    const name: HumanName = {
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('John, Michael');
  });

  test('handles empty name', () => {
    const name: HumanName = {};
    expect(formatHumanName(name)).toBe('');
  });

  test('handles undefined fields', () => {
    const name: HumanName = {
      family: undefined,
      given: undefined,
    };
    expect(formatHumanName(name)).toBe('');
  });
});
