// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  deepClone,
  evalFhirPath,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  OperationOutcomeError,
  preconditionFailed,
  toTypedValue,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import assert from 'node:assert/strict';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { activityComparison, activityQuestionnaire, totalMinutes } from './advanced-questionnaires';
import {
  getOrCreateDraft,
  loadActivityForm,
  publishActivityQuestionnaire,
  saveResponse,
  validateActivityResponse,
} from './saving-responses';

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
});

afterEach(() => vi.restoreAllMocks());

function activityResponse(
  morning: number | undefined,
  afternoon: number | undefined,
  total: number | undefined
): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: [
      {
        linkId: 'activity',
        item: [
          { linkId: 'morning-minutes', answer: morning === undefined ? [] : [{ valueInteger: morning }] },
          { linkId: 'afternoon-minutes', answer: afternoon === undefined ? [] : [{ valueInteger: afternoon }] },
        ],
      },
      {
        linkId: 'review',
        item: [{ linkId: 'total-minutes', answer: total === undefined ? [] : [{ valueInteger: total }] }],
      },
    ],
  };
}

test('publishing and loading reuse the assigned response, including after completion', async () => {
  const medplum = new MockClient();
  const questionnaire = await publishActivityQuestionnaire(medplum);
  assert(questionnaire.id);
  expect((await publishActivityQuestionnaire(medplum)).id).toBe(questionnaire.id);
  const first = await loadActivityForm(medplum, questionnaire.id, 'example', 'assignment-example');
  const resumed = await getOrCreateDraft(
    medplum,
    questionnaire,
    { reference: 'Patient/example' },
    'assignment-example'
  );
  expect(resumed.id).toBe(first.response.id);
  await medplum.updateResource({ ...resumed, status: 'completed' });
  const completed = await loadActivityForm(medplum, questionnaire.id, 'example', 'assignment-example');
  expect(completed.response).toMatchObject({ id: first.response.id, status: 'completed' });
});

test('an assignment cannot be reused for another patient or definition', async () => {
  const medplum = new MockClient();
  const questionnaire = await publishActivityQuestionnaire(medplum);
  assert(questionnaire.id);
  await loadActivityForm(medplum, questionnaire.id, 'example', 'assignment-example');
  await expect(loadActivityForm(medplum, questionnaire.id, 'other', 'assignment-example')).rejects.toThrow(
    'different subject or Questionnaire'
  );
  const revision = await medplum.createResource({ ...activityQuestionnaire, version: '2' });
  await expect(loadActivityForm(medplum, revision.id, 'example', 'assignment-example')).rejects.toThrow(
    'different subject or Questionnaire'
  );
});

test('saving preserves the assigned context, sends the stored version, and leaves snapshots unchanged', async () => {
  const medplum = new MockClient();
  const saved = await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    identifier: { system: 'https://example.org/form-assignment', value: 'assignment-example' },
    questionnaire: 'Questionnaire/example',
    subject: { reference: 'Patient/example' },
    encounter: { reference: 'Encounter/example' },
    author: { reference: 'Practitioner/example' },
  });
  const edited = { ...activityResponse(15, 25, 40), subject: undefined, questionnaire: undefined };
  const originalSaved = deepClone(saved);
  const originalEdited = deepClone(edited);
  const update = vi.spyOn(medplum, 'updateResource');
  const result = await saveResponse(medplum, saved, edited);
  expect(result).toMatchObject({
    id: saved.id,
    identifier: saved.identifier,
    questionnaire: saved.questionnaire,
    subject: saved.subject,
    encounter: saved.encounter,
    author: saved.author,
    status: 'completed',
    item: edited.item,
  });
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ id: saved.id, meta: saved.meta }),
    expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': `W/"${saved.meta?.versionId}"` }) })
  );
  expect(saved).toEqual(originalSaved);
  expect(edited).toEqual(originalEdited);
});

test('a rejected version check reaches the caller without retrying or overwriting the response', async () => {
  const medplum = new MockClient();
  const saved = await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
  });
  const conflict = new OperationOutcomeError(preconditionFailed);
  const update = vi.spyOn(medplum, 'updateResource').mockRejectedValueOnce(conflict);
  await expect(saveResponse(medplum, saved, activityResponse(15, 25, 40))).rejects.toBe(conflict);
  expect(update).toHaveBeenCalledTimes(1);
  expect(await medplum.readResource('QuestionnaireResponse', saved.id)).toEqual(saved);
});

test.each([
  { resourceType: 'QuestionnaireResponse', status: 'in-progress' },
  { resourceType: 'QuestionnaireResponse', id: 'example', status: 'in-progress' },
] satisfies QuestionnaireResponse[])('saving requires a stored ID and version: %j', async (saved) => {
  const medplum = new MockClient();
  const update = vi.spyOn(medplum, 'updateResource');
  await expect(saveResponse(medplum, saved, activityResponse(15, 25, 40))).rejects.toThrow('Load the saved response');
  expect(update).not.toHaveBeenCalled();
});

test('completion validation accepts the documented 15/25/40 response', () => {
  expect(() => validateActivityResponse(activityResponse(15, 25, 40))).not.toThrow();
});

test.each([
  [undefined, 25, 25],
  [15, undefined, 15],
  [-1, 25, 24],
  [1.5, 25, 26.5],
  [15, 25, undefined],
  [15, 25, 999],
])('completion validation rejects invalid answers: %s/%s/%s', (morning, afternoon, total) => {
  expect(() => validateActivityResponse(activityResponse(morning, afternoon, total))).toThrow();
});

test.each([
  { morning: 15, afternoon: 25, total: 40, enabled: [true] },
  { morning: 15, afternoon: 0, total: 15, enabled: [false] },
  { morning: 15, afternoon: undefined, total: 15, enabled: [] },
  { morning: undefined, afternoon: undefined, total: 0, enabled: [] },
])(
  'the authored expressions handle the walkthrough and cleared inputs: %j',
  ({ morning, afternoon, total, enabled }) => {
    const response = activityResponse(morning, afternoon, undefined);
    const variables = { '%resource': toTypedValue(response) };
    const calculation = totalMinutes.extension?.[0].valueExpression?.expression;
    const condition = activityComparison.extension?.[0].valueExpression?.expression;
    assert(calculation);
    assert(condition);
    expect(evalFhirPath(calculation, response, variables)).toEqual([total]);
    expect(evalFhirPath(condition, response, variables)).toEqual(enabled);
  }
);
