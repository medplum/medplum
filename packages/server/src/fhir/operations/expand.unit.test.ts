// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import { filterExpansionByInclude } from './expand';

describe('filterExpansionByInclude', () => {
  test('filters included ValueSet expansion by system and concepts', () => {
    const expansion: ValueSetExpansionContains[] = [
      { system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP - Reported' },
      { system: 'http://loinc.org', code: '8462-4', display: 'Diastolic BP - Reported' },
      { system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' },
      { system: 'http://snomed.info/sct', code: '75367002', display: 'Blood pressure' },
    ];

    expect(
      filterExpansionByInclude(expansion, {
        valueSet: ['http://example.com/ValueSet/vitals'],
        system: 'http://loinc.org',
        concept: [{ code: '8462-4' }],
      })
    ).toStrictEqual<ValueSetExpansionContains[]>([
      { system: 'http://loinc.org', code: '8462-4', display: 'Diastolic BP - Reported' },
    ]);
  });
});
