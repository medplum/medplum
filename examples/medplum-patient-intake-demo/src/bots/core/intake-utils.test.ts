// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Questionnaire, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { getGroupRepeatedAnswers } from './intake-utils';
import { intakeQuestionnaire, intakeResponse } from './test-data/intake-form-test-data';

describe('getAnswers', async () => {
  let medplum: MockClient, questionnaire: Questionnaire, response: QuestionnaireResponse;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
    questionnaire = await medplum.createResource(intakeQuestionnaire);
    response = await medplum.createResource(intakeResponse);
  });

  test('returns correct number of answers', async () => {
    const repeatedAnswers = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');

    expect(repeatedAnswers.length).toStrictEqual(2);
  });

  test('answer objects have the correct keys', async () => {
    const repeatedAnswers = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');

    expect(Object.keys(repeatedAnswers[0])).toStrictEqual([
      'insurance-provider',
      'subscriber-id',
      'relationship-to-subscriber',
    ]);
    expect(Object.keys(repeatedAnswers[1])).toStrictEqual([
      'insurance-provider',
      'subscriber-id',
      'relationship-to-subscriber',
      'related-person',
    ]);
  });
});
