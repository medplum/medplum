// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { deleteExistingDefinitions } from './deleteExistingDefinitions';

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      resource: { resourceType: 'Questionnaire', status: 'active', url: 'https://example.com/q/vitals' },
      request: { method: 'POST', url: 'Questionnaire' },
    },
    {
      resource: { resourceType: 'ActivityDefinition', status: 'active', url: 'https://example.com/ad/labs' },
      request: { method: 'POST', url: 'ActivityDefinition' },
    },
    {
      resource: { resourceType: 'PlanDefinition', status: 'active', name: 'No canonical' },
      request: { method: 'POST', url: 'PlanDefinition' },
    },
  ],
};

describe('deleteExistingDefinitions', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('Returns zero and issues no batch when nothing matches', async () => {
    expect(await deleteExistingDefinitions(medplum, bundle)).toBe(0);
  });

  test('Deletes every copy of each canonical and leaves other resources alone', async () => {
    const first = await medplum.createResource({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'https://example.com/q/vitals',
    });
    const second = await medplum.createResource({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'https://example.com/q/vitals',
    });
    const labs = await medplum.createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      url: 'https://example.com/ad/labs',
    });
    const unrelated = await medplum.createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      url: 'https://example.com/ad/other',
    });
    const plan = await medplum.createResource({
      resourceType: 'PlanDefinition',
      status: 'active',
      name: 'No canonical',
    });

    expect(await deleteExistingDefinitions(medplum, bundle)).toBe(3);

    await expect(medplum.readResource('Questionnaire', first.id, { cache: 'no-cache' })).rejects.toBeDefined();
    await expect(medplum.readResource('Questionnaire', second.id, { cache: 'no-cache' })).rejects.toBeDefined();
    await expect(medplum.readResource('ActivityDefinition', labs.id, { cache: 'no-cache' })).rejects.toBeDefined();
    await expect(
      medplum.readResource('ActivityDefinition', unrelated.id, { cache: 'no-cache' })
    ).resolves.toBeDefined();
    await expect(medplum.readResource('PlanDefinition', plan.id, { cache: 'no-cache' })).resolves.toBeDefined();
  });
});
