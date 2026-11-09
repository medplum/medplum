// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ClientStorage,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  MemoryStorage,
  validateResource,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import assert from 'node:assert/strict';
import { beforeAll, expect, test, vi } from 'vitest';
import {
  contactChoices,
  contactMethods,
  deployConfiguration,
  intake,
  intakeConfiguration,
  previewConfiguration,
} from './intake-configuration';

const target = { baseUrl: 'https://example.com/', projectId: 'staging' };

beforeAll(() => {
  for (const name of ['profiles-types', 'profiles-resources', 'profiles-medplum']) {
    indexStructureDefinitionBundle(readJson(`fhir/r4/${name}.json`) as Bundle);
  }
  for (const name of ['search-parameters', 'search-parameters-medplum']) {
    indexSearchParameterBundle(readJson(`fhir/r4/${name}.json`) as Bundle<SearchParameter>);
  }
});

function setup(projectId = 'staging', baseUrl = target.baseUrl): MockClient {
  const client = new MockClient({
    baseUrl,
    project: { resourceType: 'Project', id: projectId },
    seedDefaultData: false,
    storage: new ClientStorage(new MemoryStorage()),
  });
  const conditionalCreate = client.createResourceIfNoneExist.bind(client);
  // MockClient does not assign project compartments. Model that server-owned metadata
  // while retaining the SDK request and the real in-memory conditional-create router.
  vi.spyOn(client, 'createResourceIfNoneExist').mockImplementation((resource, query, options) =>
    conditionalCreate(
      {
        ...resource,
        meta: { ...resource.meta, project: projectId, compartment: [{ reference: `Project/${projectId}` }] },
      },
      query,
      options
    )
  );
  return client;
}

test('the published example definitions conform to the loaded FHIR R4 schemas', () => {
  for (const definition of intakeConfiguration) {
    expect(() => validateResource(definition)).not.toThrow();
  }
});

test('preview is read-only and repeated deployment keeps IDs and server revisions', async () => {
  const client = setup();
  expect((await previewConfiguration(client, target, intakeConfiguration)).map((entry) => entry.action)).toEqual([
    'create',
    'create',
    'create',
  ]);
  expect(client.createResourceIfNoneExist).not.toHaveBeenCalled();
  const first = await deployConfiguration(client, target, intakeConfiguration);
  const before = await client.readReference({ reference: first['intake-v1'] });
  expect(
    (await previewConfiguration(client, target, intakeConfiguration)).every((entry) => entry.action === 'unchanged')
  ).toBe(true);
  expect(await deployConfiguration(client, target, intakeConfiguration)).toEqual(first);
  const after = await client.readReference({ reference: first['intake-v1'] }, { cache: 'no-cache' });
  expect(after.meta?.versionId).toBe(before.meta?.versionId);
  expect(await client.searchResources('Questionnaire')).toHaveLength(1);
});

test('staging and production keep canonical identities and have different local IDs', async () => {
  const staging = await deployConfiguration(setup(), target, intakeConfiguration);
  const productionClient = setup('production');
  const production = await deployConfiguration(
    productionClient,
    { ...target, projectId: 'production' },
    intakeConfiguration
  );
  expect(production['intake-v1']).not.toBe(staging['intake-v1']);
  expect(await productionClient.readReference({ reference: production['intake-v1'] })).toMatchObject({
    url: intake.url,
    identifier: intake.identifier,
    item: intake.item,
  });
});

test('a new Questionnaire revision preserves the previous form and reuses unchanged dependencies', async () => {
  const client = setup();
  const previous = await deployConfiguration(client, target, intakeConfiguration);
  const revised = {
    ...intake,
    identifier: [{ system: intake.identifier?.[0]?.system, value: 'intake-v2' }],
    url: 'https://example.com/fhir/Questionnaire/intake-v2',
    version: '2.0.0',
    title: 'Updated contact preferences',
  };
  const next = await deployConfiguration(client, target, [...intakeConfiguration.slice(0, 2), revised]);
  expect(next['intake-v2']).not.toBe(previous['intake-v1']);
  expect(next['contact-methods-v1']).toBe(previous['contact-methods-v1']);
  expect(await client.readReference({ reference: previous['intake-v1'] })).toMatchObject({ title: intake.title });
  expect(await client.searchResources('Questionnaire')).toHaveLength(2);
});

test('revised answer choices preserve the previous terminology and form', async () => {
  const client = setup();
  const previous = await deployConfiguration(client, target, intakeConfiguration);
  const codes = {
    ...contactMethods,
    identifier: [{ system: contactMethods.identifier?.[0]?.system, value: 'contact-methods-v2' }],
    url: 'https://example.com/fhir/CodeSystem/contact-methods-v2',
    version: '2.0.0',
    concept: [...(contactMethods.concept ?? []), { code: 'sms', display: 'Text message' }],
  };
  const choices = {
    ...contactChoices,
    identifier: [{ system: contactChoices.identifier?.[0]?.system, value: 'intake-contact-choices-v2' }],
    url: 'https://example.com/fhir/ValueSet/intake-contact-choices-v2',
    version: '2.0.0',
    compose: { include: [{ system: codes.url }] },
  };
  const form = {
    ...intake,
    identifier: [{ system: intake.identifier?.[0]?.system, value: 'intake-v2' }],
    url: 'https://example.com/fhir/Questionnaire/intake-v2',
    version: '2.0.0',
    item: intake.item?.map((item) => ({ ...item, answerValueSet: choices.url })),
  };
  const revised = [codes, choices, form];
  const next = await deployConfiguration(client, target, revised);
  expect(await deployConfiguration(client, target, revised)).toEqual(next);
  for (const definition of [...intakeConfiguration, ...revised]) {
    const identifier = definition.identifier?.[0]?.value;
    assert(identifier);
    expect(await client.readReference({ reference: { ...previous, ...next }[identifier] })).toMatchObject(definition);
    expect(await client.searchResources(definition.resourceType)).toHaveLength(2);
  }
});

test.each(['https://example.com/medplum', 'https://example.com/medplum/'])(
  'a matching server base URL accepts an optional trailing slash: %s',
  async (baseUrl) => {
    const client = setup('staging', 'https://example.com/medplum/');
    expect(await previewConfiguration(client, { ...target, baseUrl }, intakeConfiguration)).toHaveLength(3);
    await expect(
      previewConfiguration(client, { ...target, baseUrl: 'https://example.com/other-path/' }, intakeConfiguration)
    ).rejects.toThrow('expected server and project');
  }
);

test('wrong project, wrong server, and super-admin sessions fail before reads or writes', async () => {
  const client = setup();
  const search = vi.spyOn(client, 'searchResources');
  for (const incorrect of [
    { ...target, projectId: 'production' },
    { ...target, baseUrl: 'https://other.example.com/' },
  ]) {
    await expect(deployConfiguration(client, incorrect, intakeConfiguration)).rejects.toThrow(
      'expected server and project'
    );
  }
  vi.spyOn(client, 'isSuperAdmin').mockReturnValue(true);
  await expect(deployConfiguration(client, target, intakeConfiguration)).rejects.toThrow('expected server and project');
  expect(search).not.toHaveBeenCalled();
  expect(client.createResourceIfNoneExist).not.toHaveBeenCalled();
});

test.each([
  { projectId: 'shared', identifier: 'intake-v1' },
  { projectId: 'staging', identifier: 'manually-created-intake' },
])(
  'a canonical URL collision with $projectId/$identifier blocks a duplicate deployment',
  async ({ projectId, identifier }) => {
    const client = setup();
    const existing = await client.createResource({
      ...intake,
      identifier: [{ system: intake.identifier?.[0]?.system, value: identifier }],
      meta: { project: projectId, compartment: [{ reference: `Project/${projectId}` }] },
    });
    await expect(deployConfiguration(client, target, intakeConfiguration)).rejects.toThrow(
      'Canonical URL already used'
    );
    expect(client.createResourceIfNoneExist).not.toHaveBeenCalled();
    const remaining = await client.searchResources('Questionnaire');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toEqual(existing);
  }
);

test('changed published content and authored metadata stop deployment without overwriting', async () => {
  const client = setup();
  const original = await deployConfiguration(client, target, intakeConfiguration);
  vi.mocked(client.createResourceIfNoneExist).mockClear();
  await expect(deployConfiguration(client, target, [contactMethods, { ...intake, title: 'Changed' }])).rejects.toThrow(
    'Published definition differs'
  );
  await expect(
    previewConfiguration(client, target, [{ ...intake, meta: { profile: ['https://example.com/new-profile'] } }])
  ).rejects.toThrow('Published definition differs');
  expect(client.createResourceIfNoneExist).not.toHaveBeenCalled();
  expect(await client.readReference({ reference: original['intake-v1'] })).toMatchObject({ title: intake.title });
});

test('a failed dependency stops dependents and the same configuration can be retried', async () => {
  const client = setup();
  const original = vi.mocked(client.createResourceIfNoneExist).getMockImplementation();
  assert(original);
  let fail = true;
  vi.spyOn(client, 'createResourceIfNoneExist').mockImplementation((resource, query, options) => {
    if (resource.resourceType === 'ValueSet' && fail) {
      throw new Error('Temporary write failure');
    }
    return original(resource, query, options);
  });
  await expect(deployConfiguration(client, target, intakeConfiguration)).rejects.toThrow('Temporary write failure');
  expect(await client.searchResources('CodeSystem')).toHaveLength(1);
  expect(await client.searchResources('Questionnaire')).toHaveLength(0);
  fail = false;
  await deployConfiguration(client, target, intakeConfiguration);
  expect(await client.searchResources('CodeSystem')).toHaveLength(1);
  expect(await client.searchResources('Questionnaire')).toHaveLength(1);
});

test('duplicate identifiers stop the preview', async () => {
  const client = setup();
  for (let i = 0; i < 2; i++) {
    await client.createResource({ ...intake, meta: { compartment: [{ reference: 'Project/staging' }] } });
  }
  await expect(previewConfiguration(client, target, [intake])).rejects.toThrow('Multiple matches');
  expect(client.createResourceIfNoneExist).not.toHaveBeenCalled();
});

test('a changed definition created after preview is detected from the conditional response', async () => {
  const client = setup();
  const original = vi.mocked(client.createResourceIfNoneExist).getMockImplementation();
  assert(original);
  vi.spyOn(client, 'createResourceIfNoneExist').mockImplementationOnce(async (resource, query, options) => {
    await client.createResource({
      ...contactMethods,
      title: 'Concurrent change',
      meta: { compartment: [{ reference: 'Project/staging' }] },
    });
    return original(resource, query, options);
  });
  await expect(deployConfiguration(client, target, intakeConfiguration)).rejects.toThrow(
    'Published definition differs'
  );
  expect(await client.searchResources('ValueSet')).toHaveLength(0);
});

test('definitions require a stable identifier and omit source-project resource IDs', async () => {
  const client = setup();
  for (const invalid of [
    { ...intake, identifier: [] },
    { ...intake, id: 'source-project-id' },
  ]) {
    await expect(previewConfiguration(client, target, [invalid])).rejects.toThrow('system/value identifier');
  }
});
