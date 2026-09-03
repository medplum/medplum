// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { deepClone, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { FhirRequest } from '@medplum/fhir-router';
import { MemoryRepository } from '@medplum/fhir-router';
import type { Bundle, Parameters, Questionnaire, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import {
  ASSEMBLED_FROM_EXTENSION_URL,
  ASSEMBLE_EXPECTATION_EXTENSION_URL,
  SUB_QUESTIONNAIRE_EXTENSION_URL,
  VARIABLE_EXTENSION_URL,
  assembleQuestionnaire,
  parseQuestionnaireInput,
} from './questionnaireassemble';

const makeRequest = (body: unknown): FhirRequest => ({
  method: 'POST',
  url: 'Questionnaire/$assemble',
  pathname: '',
  body,
  params: {},
  query: {},
});

describe('Questionnaire/$assemble', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('parses inline, canonical, and reference inputs', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [],
    };

    expect(parseQuestionnaireInput(makeRequest(questionnaire))).toBe(questionnaire);
    expect(
      parseQuestionnaireInput(
        makeRequest({
          resourceType: 'Parameters',
          parameter: [{ name: 'questionnaire', valueUri: 'https://example.com/questionnaire/example|1.0.0' }],
        } satisfies Parameters)
      )
    ).toBe('https://example.com/questionnaire/example|1.0.0');
    expect(
      parseQuestionnaireInput(
        makeRequest({
          resourceType: 'Parameters',
          parameter: [{ name: 'questionnaire', valueReference: { reference: 'Questionnaire/example' } }],
        } satisfies Parameters)
      )
    ).toMatchObject({ reference: 'Questionnaire/example' });
  });

  test('inlines nested subQuestionnaires and applies linkId prefixes', async () => {
    const repo = new MemoryRepository();
    const grandchild: Questionnaire = {
      resourceType: 'Questionnaire',
      url: 'https://example.com/questionnaire/grandchild',
      version: '1.0.0',
      status: 'active',
      item: [{ linkId: 'city', type: 'string', text: 'City' }],
    };
    await repo.createResource(grandchild);

    const child: Questionnaire = {
      resourceType: 'Questionnaire',
      url: 'https://example.com/questionnaire/child',
      version: '1.0.0',
      status: 'active',
      contained: [{ resourceType: 'ValueSet', id: 'child-values', status: 'active' }],
      item: [
        {
          linkId: 'name',
          type: 'string',
          text: 'Name',
          answerValueSet: '#child-values',
          enableWhen: [{ question: 'city', operator: 'exists', answerBoolean: true }],
        },
        {
          linkId: 'address',
          type: 'display',
          extension: [
            {
              url: SUB_QUESTIONNAIRE_EXTENSION_URL,
              valueCanonical: 'https://example.com/questionnaire/grandchild|1.0.0',
            },
          ],
        },
      ],
    };
    await repo.createResource(child);

    const root: Questionnaire = {
      resourceType: 'Questionnaire',
      url: 'https://example.com/questionnaire/root',
      version: '1.0.0',
      status: 'active',
      extension: [{ url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: 'assemble-root' }],
      item: [
        {
          linkId: 'section',
          type: 'group',
          extension: [
            {
              url: VARIABLE_EXTENSION_URL,
              valueExpression: {
                name: 'linkIdPrefix',
                language: 'text/fhirpath',
                expression: "'person.'",
              },
            },
          ],
          item: [
            {
              linkId: 'child',
              type: 'display',
              extension: [
                {
                  url: SUB_QUESTIONNAIRE_EXTENSION_URL,
                  valueCanonical: 'https://example.com/questionnaire/child|1.0.0',
                },
              ],
            },
          ],
        },
      ],
    };
    const original = deepClone(root);

    const result = await assembleQuestionnaire(repo, root);

    expect(result.issues).toHaveLength(0);
    expect(result.questionnaire.item?.[0]).toMatchObject({
      linkId: 'section',
      item: [
        {
          linkId: 'person.name',
          answerValueSet: '#person.child-values',
          enableWhen: [{ question: 'person.city' }],
        },
        { linkId: 'person.city', text: 'City' },
      ],
    });
    expect(result.questionnaire.extension).toEqual([
      { url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: 'https://example.com/questionnaire/child|1.0.0' },
      { url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: 'https://example.com/questionnaire/grandchild|1.0.0' },
    ]);
    expect(result.questionnaire.contained).toEqual([
      { resourceType: 'ValueSet', id: 'person.child-values', status: 'active' },
    ]);
    expect(result.questionnaire.version).toBe('1.0.0-assembled');
    expect(root).toEqual(original);
  });

  test('propagates an item definition from a Questionnaire library', async () => {
    const repo = new MemoryRepository();
    await repo.createResource({
      resourceType: 'Questionnaire',
      url: 'https://example.com/questionnaire/library',
      version: '1.0.0',
      status: 'active',
      item: [
        {
          linkId: 'address',
          type: 'group',
          text: 'Address',
          item: [{ linkId: 'city', type: 'string', text: 'City' }],
        },
      ],
    });

    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'home-address',
          type: 'group',
          definition: 'https://example.com/questionnaire/library|1.0.0#address',
        },
      ],
    };

    const result = await assembleQuestionnaire(repo, questionnaire);

    expect(result.issues).toHaveLength(0);
    expect(result.questionnaire.item?.[0]).toMatchObject({
      linkId: 'home-address',
      text: 'Address',
      item: [{ linkId: 'city', type: 'string', text: 'City' }],
    });
  });

  test('propagates metadata from a contained element definition', async () => {
    const repo = new MemoryRepository();
    const structureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'https://example.com/StructureDefinition/example',
      name: 'Example',
      status: 'active',
      kind: 'logical',
      abstract: false,
      type: 'Example',
      snapshot: {
        element: [
          {
            id: 'Example.name',
            path: 'Example.name',
            short: 'Official name',
            min: 1,
            max: '1',
            code: [{ system: 'https://example.com', code: 'name' }],
            type: [{ code: 'string' }],
          },
        ],
      },
    } as StructureDefinition;
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      contained: [structureDefinition],
      item: [
        {
          linkId: 'name',
          type: 'string',
          definition: 'https://example.com/StructureDefinition/example#Example.name',
        },
      ],
    };

    const result = await assembleQuestionnaire(repo, questionnaire);

    expect(result.issues).toHaveLength(0);
    expect(result.questionnaire.item?.[0]).toMatchObject({
      text: 'Official name',
      required: true,
      repeats: false,
      code: [{ system: 'https://example.com', code: 'name' }],
    });
  });

  test('rejects missing references, cycles, and duplicate linkIds', async () => {
    const repo = new MemoryRepository();
    const missing: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'missing',
          type: 'display',
          extension: [{ url: SUB_QUESTIONNAIRE_EXTENSION_URL, valueCanonical: 'https://example.com/missing' }],
        },
      ],
    };
    await expect(assembleQuestionnaire(repo, missing)).rejects.toThrow('not found');

    const first: Questionnaire = {
      resourceType: 'Questionnaire',
      url: 'https://example.com/first',
      version: '1.0.0',
      status: 'active',
      item: [
        {
          linkId: 'second',
          type: 'display',
          extension: [{ url: SUB_QUESTIONNAIRE_EXTENSION_URL, valueCanonical: 'https://example.com/second|1.0.0' }],
        },
      ],
    };
    const second: Questionnaire = {
      resourceType: 'Questionnaire',
      url: 'https://example.com/second',
      version: '1.0.0',
      status: 'active',
      item: [
        {
          linkId: 'first',
          type: 'display',
          extension: [{ url: SUB_QUESTIONNAIRE_EXTENSION_URL, valueCanonical: 'https://example.com/first|1.0.0' }],
        },
      ],
    };
    await repo.createResource(first);
    await repo.createResource(second);
    await expect(assembleQuestionnaire(repo, first)).rejects.toThrow('Circular');

    const duplicateRoot: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        { linkId: 'duplicate', type: 'string' },
        { linkId: 'duplicate', type: 'string' },
      ],
    };
    await expect(assembleQuestionnaire(repo, duplicateRoot)).rejects.toThrow('Duplicate');
  });
});
