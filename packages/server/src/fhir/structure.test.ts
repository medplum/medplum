// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getSearchParameter } from '@medplum/core';
import { loadStructureDefinitions } from './structure';

describe('FHIR structure', () => {
  beforeAll(async () => {
    loadStructureDefinitions();
  });

  test('Can search Organization on _profile', async () => {
    const param = getSearchParameter('Organization', '_profile');
    expect(param).toBeDefined();
  });

  test('Can search MedicinalProductManufactured on _profile', async () => {
    const param = getSearchParameter('MedicinalProductManufactured', '_profile');
    expect(param).toBeDefined();
  });
});
