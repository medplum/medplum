// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingRequirement } from '@medplum/core';
import {
  CPT,
  ICD10,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
  REQUIRES_PROCEDURE_CODE,
  SCHEDULING_REQUIREMENT_CODES,
} from '@medplum/core';
import type { BookingRequirementValues } from './AppointmentFinder.requirements';
import {
  EMPTY_REQUIREMENT_VALUES,
  hasRequiredValues,
  isRequirementAnswered,
  toCodedConcept,
} from './AppointmentFinder.requirements';

describe('isRequirementAnswered', () => {
  const answers: Record<SchedulingRequirement, BookingRequirementValues> = {
    [REQUIRES_PROCEDURE_CODE]: {
      ...EMPTY_REQUIREMENT_VALUES,
      procedure: [{ coding: [{ system: CPT, code: '96365' }] }],
    },
    [REQUIRES_DIAGNOSIS_CODE]: {
      ...EMPTY_REQUIREMENT_VALUES,
      diagnosis: [{ coding: [{ system: ICD10, code: 'D63.1' }] }],
    },
    [REQUIRES_MEDICAL_NECESSITY_CODE]: { ...EMPTY_REQUIREMENT_VALUES, medicalNecessity: true },
  };

  test.each(SCHEDULING_REQUIREMENT_CODES)('%s is answered by its own field, and by nothing else', (requirement) => {
    expect(isRequirementAnswered(requirement, EMPTY_REQUIREMENT_VALUES)).toBe(false);
    expect(isRequirementAnswered(requirement, answers[requirement])).toBe(true);

    // Every other field filled, its own left empty: requirements do not stand in for one another.
    const others = SCHEDULING_REQUIREMENT_CODES.filter((code) => code !== requirement);
    const everythingElse = others.reduce<BookingRequirementValues>(
      (values, code) => ({ ...values, ...answers[code] }),
      EMPTY_REQUIREMENT_VALUES
    );
    expect(isRequirementAnswered(requirement, everythingElse)).toBe(false);
  });
});

describe('hasRequiredValues', () => {
  const procedure = [{ coding: [{ system: CPT, code: '96365' }] }];
  const diagnosis = [{ coding: [{ system: ICD10, code: 'D63.1' }] }];
  const all = new Set(SCHEDULING_REQUIREMENT_CODES);

  test('Nothing given is not enough', () => {
    expect(hasRequiredValues(EMPTY_REQUIREMENT_VALUES, all)).toBe(false);
  });

  test('One field on its own is not enough', () => {
    expect(hasRequiredValues({ ...EMPTY_REQUIREMENT_VALUES, procedure }, all)).toBe(false);
    expect(hasRequiredValues({ ...EMPTY_REQUIREMENT_VALUES, diagnosis }, all)).toBe(false);
    expect(hasRequiredValues({ ...EMPTY_REQUIREMENT_VALUES, medicalNecessity: true }, all)).toBe(false);
  });

  test('One of each code, with medical necessity confirmed, is', () => {
    expect(hasRequiredValues({ procedure, diagnosis, medicalNecessity: true }, all)).toBe(true);
  });

  test('Several of each is too, since one of each is a floor rather than a quota', () => {
    expect(
      hasRequiredValues(
        {
          procedure: [...procedure, { coding: [{ system: CPT, code: '96366' }] }],
          diagnosis: [...diagnosis, { coding: [{ system: ICD10, code: 'E86.0' }] }],
          medicalNecessity: true,
        },
        all
      )
    ).toBe(true);
  });

  test('Medical necessity is required rather than merely captured, so both codes are not enough', () => {
    expect(hasRequiredValues({ procedure, diagnosis, medicalNecessity: false }, all)).toBe(false);
  });

  test('A visit type requiring nothing is answered by nothing', () => {
    expect(hasRequiredValues(EMPTY_REQUIREMENT_VALUES, new Set())).toBe(true);
  });

  test.each<[SchedulingRequirement, BookingRequirementValues]>([
    [REQUIRES_PROCEDURE_CODE, { ...EMPTY_REQUIREMENT_VALUES, procedure }],
    [REQUIRES_DIAGNOSIS_CODE, { ...EMPTY_REQUIREMENT_VALUES, diagnosis }],
    [REQUIRES_MEDICAL_NECESSITY_CODE, { ...EMPTY_REQUIREMENT_VALUES, medicalNecessity: true }],
  ])('%s alone is answered by its own field alone', (code, values) => {
    const requirements = new Set<SchedulingRequirement>([code]);
    expect(hasRequiredValues(EMPTY_REQUIREMENT_VALUES, requirements)).toBe(false);
    expect(hasRequiredValues(values, requirements)).toBe(true);
  });

  test('A value nothing asked for does not stand in for one that was asked for', () => {
    const requirements = new Set<SchedulingRequirement>([REQUIRES_DIAGNOSIS_CODE]);
    expect(hasRequiredValues({ procedure, diagnosis: [], medicalNecessity: true }, requirements)).toBe(false);
  });
});

describe('toCodedConcept', () => {
  test('Records a concept exactly as the field holds it', () => {
    const concept = {
      text: 'Infusion',
      coding: [
        { system: CPT, code: '96365', display: 'Intravenous infusion; initial, up to 1 hour' },
        { system: 'http://example.com/local', code: 'INF-1' },
      ],
    };
    expect(toCodedConcept(concept)).toEqual(concept);
  });

  test('Drops anything that never became a code', () => {
    // A grouping entry in an expansion carries a display and no code, and is not something
    // anything downstream can bill from.
    expect(toCodedConcept({ coding: [{ display: 'Bariatric procedures' }, { system: CPT, code: '43644' }] })).toEqual({
      coding: [{ system: CPT, code: '43644' }],
    });
    expect(toCodedConcept({ coding: [{ display: 'Bariatric procedures' }] })).toBeUndefined();
    expect(toCodedConcept(undefined)).toBeUndefined();
  });
});
