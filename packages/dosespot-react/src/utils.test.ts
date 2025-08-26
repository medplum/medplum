// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { getMedicationName } from './utils';

describe('utils', () => {
  test('getMedicationName', () => {
    const medication: MedicationKnowledge = {
      resourceType: 'MedicationKnowledge',
      id: 'test',
      code: {
        text: 'Test Medication',
      },
    };
    expect(getMedicationName(medication)).toBe('Test Medication');
  });
});
