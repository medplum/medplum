// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, ChargeItemDefinition, Encounter, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import { getServiceDisplayString, getServiceFee, handler } from './superbill';
import { testData } from './superbill-test-data';

const medplum = new MockClient();

describe('Superbill tests', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    await medplum.executeBatch(chargeItemDefinitions);
  });

  test('Show answers', async () => {
    await medplum.executeBatch(testData);
    const encounter = (await medplum.searchOne('Encounter', {
      identifier: 'example-encounter',
    })) as Encounter;

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

  test('Invalid charge item code', async () => {
    const chargeItemDefinition: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      url: 'http://example.org',
      status: 'active',
    };

    expect(() => getServiceDisplayString(chargeItemDefinition)).toThrowError(
      /^Invalid code on charge item definition$/
    );
  });

  test('No fee provided', async () => {
    const chargeItemDefinition: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      url: 'http://example.org',
      status: 'active',
    };

    expect(() => getServiceFee(chargeItemDefinition)).toThrowError(/^No fee specified for this service$/);
  });
});

const chargeItemDefinitions: Bundle = {
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
