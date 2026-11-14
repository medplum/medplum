// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, indexSearchParameterBundle, indexStructureDefinitionBundle, validateResource } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, QuestionnaireItem, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, expect, test } from 'vitest';
import {
  assertUniqueLinkIds,
  buildVisitPreparation,
  clinicPreparation,
  publishVisitPreparation,
  visitBasics,
} from './modular-questionnaires';
import { getOrCreateDraft, loadActivityForm } from './saving-responses';

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
});

test('the source modules and composed definition pass Medplum R4 resource validation', () => {
  for (const questionnaire of [visitBasics, clinicPreparation, buildVisitPreparation()]) {
    expect(() => validateResource(questionnaire)).not.toThrow();
  }
});

test('composition preserves local conditions and isolates definitions from later edits', () => {
  const original = deepClone([visitBasics, clinicPreparation]);
  const first = buildVisitPreparation();
  const second = buildVisitPreparation();
  expect(first.item?.[1].item?.[1].enableWhen).toEqual([
    { question: 'clinic-needs-help', operator: '=', answerBoolean: true },
  ]);
  first.item?.[1].item?.push({ linkId: 'extra', type: 'string', text: 'New question' });
  expect([visitBasics, clinicPreparation]).toEqual(original);
  expect(second.item?.[1].item).toHaveLength(2);
  expect(second.url).toBeUndefined();
});

test('the collision check catches duplicate IDs at different depths', () => {
  const items: QuestionnaireItem[] = [
    { linkId: 'same', type: 'string' },
    { linkId: 'group', type: 'group', item: [{ linkId: 'same', type: 'string' }] },
  ];
  expect(() => assertUniqueLinkIds(items)).toThrow('Duplicate Questionnaire linkId: same');
});

test('publishing retries reuse the definition and a saved assignment stays on its original revision', async () => {
  const medplum = new MockClient();
  const first = await publishVisitPreparation(medplum);
  expect((await publishVisitPreparation(medplum)).id).toBe(first.id);
  const draft = await getOrCreateDraft(medplum, first, { reference: 'Patient/example' }, 'visit-1');
  const revision = await medplum.createResource({
    ...buildVisitPreparation(),
    status: 'active',
    version: '2.0.0',
    identifier: [{ system: 'https://example.org/questionnaire-definition', value: 'visit-preparation-v2' }],
  });
  expect(revision.id).not.toBe(first.id);
  const resumed = await loadActivityForm(medplum, first.id as string, 'example', 'visit-1');
  expect(resumed.response.id).toBe(draft.id);
  expect(resumed.response.questionnaire).toBe(`Questionnaire/${first.id}`);
  expect(resumed.questionnaire.version).toBe('1.0.0');
});
