import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './create-pdf';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';

const medplum = new MockClient();

describe('Create PDF', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Create PDF', async () => {
    const media = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: 'Hello',
      contentType: 'text/plain',
      secrets: {},
    });
    expect(media).toBeDefined();
    expect(media.resourceType).toEqual('Media');
    expect(media.content.contentType).toEqual('application/pdf');
    expect(media.content.url).toMatch('Binary');

    // TODO: Commenting this out until MockClient.createPDF is fixed to savePDFs properly
    // const binary = await medplum.readReference({ reference: media.content.url });
    // expect(binary).toBeDefined();
  });
});
