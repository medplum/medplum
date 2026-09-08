// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CPT, ICD10 } from '@medplum/core';
import {
  EMPTY_AUTHORIZATION_VALUES,
  hasRequiredAuthorizationCodes,
  toCodings,
} from './AppointmentFinder.authorization';

describe('hasRequiredAuthorizationCodes', () => {
  const procedure = [{ system: CPT, code: '96365' }];
  const diagnosis = [{ system: ICD10, code: 'D63.1' }];

  test('Nothing given is not enough', () => {
    expect(hasRequiredAuthorizationCodes(EMPTY_AUTHORIZATION_VALUES)).toBe(false);
  });

  test('One field on its own is not enough', () => {
    expect(hasRequiredAuthorizationCodes({ ...EMPTY_AUTHORIZATION_VALUES, procedure })).toBe(false);
    expect(hasRequiredAuthorizationCodes({ ...EMPTY_AUTHORIZATION_VALUES, diagnosis })).toBe(false);
  });

  test('One of each is', () => {
    expect(hasRequiredAuthorizationCodes({ procedure, diagnosis, medicalNecessity: false })).toBe(true);
  });

  test('Several of each is too, since one of each is a floor rather than a quota', () => {
    expect(
      hasRequiredAuthorizationCodes({
        procedure: [...procedure, { system: CPT, code: '96366' }],
        diagnosis: [...diagnosis, { system: ICD10, code: 'E86.0' }],
        medicalNecessity: false,
      })
    ).toBe(true);
  });

  test('Medical necessity is captured rather than required, so it does not decide this', () => {
    expect(hasRequiredAuthorizationCodes({ procedure, diagnosis, medicalNecessity: false })).toBe(true);
    expect(hasRequiredAuthorizationCodes({ ...EMPTY_AUTHORIZATION_VALUES, medicalNecessity: true })).toBe(false);
  });
});

describe('toCodings', () => {
  test('Records a code exactly as the ValueSet expanded it', () => {
    expect(toCodings([{ system: CPT, code: '96365', display: 'Intravenous infusion; initial, up to 1 hour' }])).toEqual(
      [{ system: CPT, code: '96365', display: 'Intravenous infusion; initial, up to 1 hour' }]
    );
  });

  test('Keeps every code the field is holding, in the order it holds them', () => {
    expect(
      toCodings([
        { system: CPT, code: '96365' },
        { system: CPT, code: '96366' },
      ]).map((coding) => coding.code)
    ).toEqual(['96365', '96366']);
  });

  test('Names no system of its own, since the ValueSet already said which one', () => {
    // Guessing here would be asserting a provenance the field cannot know: a project's diagnosis
    // ValueSet may be drawn from ICD-10-CM rather than ICD-10, and the expansion is what knows.
    expect(toCodings([{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'D63.1' }])[0].system).toBe(
      'http://hl7.org/fhir/sid/icd-10-cm'
    );
  });

  test('An empty field holds no codes', () => {
    expect(toCodings([])).toEqual([]);
  });

  test('Drops anything that never became a code', () => {
    // A grouping entry in an expansion carries a display and no code, and is not something
    // anything downstream can bill from.
    expect(toCodings([{ display: 'Bariatric procedures' }])).toEqual([]);
  });
});
