import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Encounter, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import { handler } from './superbill';

const medplum = new MockClient();

describe('Superbill tests', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(() => {
    medplum.executeBatch(testData);
  });

  test('Show answers', async () => {
    const encounterData: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: {
        system: 'http://ama-assn.org/go/cpt',
        code: '99204',
        display: 'New patient office visit',
      },
      serviceType: {
        coding: [
          {
            system: 'http://ama-assn.org/go/cpt',
            code: '71045',
            display: 'Radiological examination, chest; single view ',
          },
        ],
      },
    };

    const encounter = await medplum.createResource(encounterData);

    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'encounters',
          answer: [{ valueReference: { reference: getReferenceString(encounter) } }],
        },
      ],
    };
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: response,
      contentType: 'application/fhir+json',
      secrets: {},
    });
  });
});

const testData: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: `urn:uuid:${randomUUID()}`,
      request: { method: 'POST', url: 'ChargeItemDefinition' },
      resource: {
        resourceType: 'ChargeItemDefinition',
        url: 'http://example.org/charge-item-definitions',
        status: 'active',
        title: 'New patient visit',
        useContext: [
          {
            code: {
              system: 'http://ama-assn.org/go/cpt',
              code: '99204',
              display: 'New patient office visit',
            },
          },
        ],
        code: {
          coding: [
            {
              system: 'http://ama-assn.org/go/cpt',
              code: '99204',
              display: 'New patient office visit',
            },
          ],
        },
        propertyGroup: [
          {
            priceComponent: [
              {
                type: 'base',
                amount: {
                  value: 100,
                  currency: 'USD',
                },
              },
            ],
          },
        ],
      },
    },
    {
      fullUrl: `urn:uuid:${randomUUID()}`,
      request: { method: 'POST', url: 'ChargeItemDefinition' },
      resource: {
        resourceType: 'ChargeItemDefinition',
        url: 'http://example.org/charge-item-definition',
        status: 'active',
        title: 'Chest x-ray',
        useContext: [
          {
            code: {
              system: 'http://ama-assn.org/go/cpt',
              code: '71045',
              display: 'Radiological examination, chest; single view',
            },
          },
        ],
        code: {
          coding: [
            {
              system: 'http://ama-assn.org/go/cpt',
              code: '71045',
              display: 'Radiological examination, chest; single view',
            },
          ],
        },
        propertyGroup: [
          {
            priceComponent: [
              {
                type: 'base',
                amount: {
                  value: 80,
                  currency: 'USD',
                },
              },
            ],
          },
        ],
      },
    },
  ],
};
