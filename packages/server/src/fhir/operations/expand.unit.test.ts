// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetComposeInclude } from '@medplum/fhirtypes';
import { constrainInclude } from './expand';

describe('constrainInclude', () => {
  test('adds inherited system and concept constraints to nested ValueSet includes', () => {
    expect(
      constrainInclude(
        { valueSet: ['http://example.com/ValueSet/vitals'] },
        { system: 'http://loinc.org', concept: [{ code: '8462-4' }] }
      )
    ).toStrictEqual<ValueSetComposeInclude>({
      valueSet: ['http://example.com/ValueSet/vitals'],
      system: 'http://loinc.org',
      concept: [{ code: '8462-4' }],
    });
  });

  test('intersects inherited concept constraints with include concepts', () => {
    expect(
      constrainInclude(
        {
          system: 'http://loinc.org',
          concept: [
            { code: '8480-6', display: 'Systolic BP - Reported' },
            { code: '8462-4', display: 'Diastolic BP - Reported' },
          ],
        },
        { system: 'http://loinc.org', concept: [{ code: '8462-4' }] }
      )
    ).toStrictEqual<ValueSetComposeInclude>({
      system: 'http://loinc.org',
      concept: [{ code: '8462-4', display: 'Diastolic BP - Reported' }],
    });
  });

  test('skips includes from other systems', () => {
    expect(
      constrainInclude({ system: 'http://snomed.info/sct' }, { system: 'http://loinc.org' })
    ).toBeUndefined();
  });
});
