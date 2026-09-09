// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type {
  Bundle,
  BundleEntry,
  Encounter,
  Observation,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  SearchParameter,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { MemoryRepository } from './repo';

const repo = new MemoryRepository();

function refs(bundle: Bundle, mode: 'match' | 'include'): string[] {
  return (bundle.entry ?? [])
    .filter((e: BundleEntry) => e.search?.mode === mode)
    .map((e: BundleEntry) => getReferenceString(e.resource as any))
    .sort();
}

describe('MemoryRepository _include/_revinclude', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  beforeEach(() => {
    repo.clear();
  });

  test('Search entries are tagged with mode "match"', async () => {
    await repo.createResource<Patient>({ resourceType: 'Patient' });
    const bundle = await repo.search(parseSearchRequest('Patient'));
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0].search).toStrictEqual({ mode: 'match' });
  });

  test('_include resolves a literal reference', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const observation = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });

    const bundle = await repo.search(parseSearchRequest('Observation?_include=Observation:subject'));
    expect(refs(bundle, 'match')).toStrictEqual([getReferenceString(observation)]);
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(patient)]);
    // Included resources do not count toward `total`
    expect(bundle.total).toBe(1);
  });

  test('_include does not throw on a dangling reference', async () => {
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: 'Patient/00000000-0000-4000-8000-000000000000' },
    });

    const bundle = await repo.search(parseSearchRequest('Observation?_include=Observation:subject'));
    expect(refs(bundle, 'match')).toHaveLength(1);
    expect(refs(bundle, 'include')).toStrictEqual([]);
  });

  test('_include with a target type filters by that type', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const encounter = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(patient),
    });
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
      encounter: createReference(encounter),
    });

    const included = await repo.search(parseSearchRequest('Observation?_include=Observation:subject:Patient'));
    expect(refs(included, 'include')).toStrictEqual([getReferenceString(patient)]);

    const excluded = await repo.search(parseSearchRequest('Observation?_include=Observation:subject:Group'));
    expect(refs(excluded, 'include')).toStrictEqual([]);
  });

  test('_include deduplicates resources referenced more than once', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    for (let i = 0; i < 3; i++) {
      await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: createReference(patient),
      });
    }

    const bundle = await repo.search(parseSearchRequest('Observation?_include=Observation:subject'));
    expect(refs(bundle, 'match')).toHaveLength(3);
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(patient)]);
  });

  test('_include does not re-include a resource already in the match set', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
    });

    const bundle = await repo.search(parseSearchRequest('Patient?_revinclude=ServiceRequest:subject'));
    expect(refs(bundle, 'match')).toStrictEqual([getReferenceString(patient)]);
    expect(refs(bundle, 'include')).toHaveLength(1);
    // The patient appears exactly once, as a match
    expect(bundle.entry).toHaveLength(2);
  });

  test('_revinclude resolves reverse references', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const observation = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });
    // Unrelated observation that must not be pulled in
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'other' },
      subject: { reference: 'Patient/00000000-0000-4000-8000-000000000000' },
    });

    const bundle = await repo.search(parseSearchRequest('Patient?_revinclude=Observation:subject'));
    expect(refs(bundle, 'match')).toStrictEqual([getReferenceString(patient)]);
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(observation)]);
  });

  test('_revinclude with a target type filters the base resources', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });

    const bundle = await repo.search(parseSearchRequest('Patient?_revinclude=Observation:subject:Group'));
    expect(refs(bundle, 'include')).toStrictEqual([]);
  });

  test('_include:iterate follows a chain of references', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const encounter = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(patient),
    });
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      encounter: createReference(encounter),
    });

    const bundle = await repo.search(
      parseSearchRequest('Observation?_include=Observation:encounter&_include:iterate=Encounter:subject')
    );
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(encounter), getReferenceString(patient)].sort());
  });

  test('_include without :iterate does not recurse', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const encounter = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(patient),
    });
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      encounter: createReference(encounter),
    });

    const bundle = await repo.search(
      parseSearchRequest('Observation?_include=Observation:encounter&_include=Encounter:subject')
    );
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(encounter)]);
  });

  test('_include resolves canonical references by exact URL', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/q',
    });
    // Shares a URL prefix with the target; must not be included
    await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/q-extra',
    });
    await repo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: 'http://example.com/q',
    });

    const bundle = await repo.search(
      parseSearchRequest('QuestionnaireResponse?_include=QuestionnaireResponse:questionnaire')
    );
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(questionnaire)]);
  });

  test('_revinclude resolves canonical references', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/q',
    });
    const response = await repo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: 'http://example.com/q',
    });

    const bundle = await repo.search(
      parseSearchRequest('Questionnaire?_revinclude=QuestionnaireResponse:questionnaire')
    );
    expect(refs(bundle, 'match')).toStrictEqual([getReferenceString(questionnaire)]);
    expect(refs(bundle, 'include')).toStrictEqual([getReferenceString(response)]);
  });

  test('Invalid include parameter throws badRequest', async () => {
    await repo.createResource<Patient>({ resourceType: 'Patient' });
    await expect(repo.search(parseSearchRequest('Patient?_include=Patient:bogus'))).rejects.toThrow(
      OperationOutcomeError
    );
  });

  test('Empty match set skips include processing', async () => {
    const bundle = await repo.search(parseSearchRequest('Observation?_include=Observation:subject'));
    expect(bundle.entry).toBeUndefined();
    expect(bundle.total).toBe(0);
  });
});
