// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import {
  cmsPatientMatch,
  compareCmsMatchFields,
  damerauLevenshtein,
  extractCmsMatchFields,
  extractStrings,
  foldString,
  hasGenerationalSuffixConflict,
  matchField,
  normalizeFullDate,
  normalizeLast4,
  normalizePhone,
} from './cms-patient-match';
import type { CmsPatientMatchFields } from './cms-patient-match';

const SSN_SYSTEM = 'http://hl7.org/fhir/sid/us-ssn';
const ITIN_SYSTEM = 'http://hl7.org/fhir/sid/us-itin';
const MBI_SYSTEM = 'https://bluebutton.cms.gov/resources/identifiers/mbi';
const LEGAL_ID_SYSTEM = 'https://bluebutton.cms.gov/resources/identifiers/beneficiary-id';
const CSP_UUID_SYSTEM = 'https://bluebutton.cms.gov/resources/identifiers/csp-uuid';
const EMPI_ID_SYSTEM = 'https://example.com/empi';

interface PatientFields {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dob?: string;
  readonly streetLine?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly ssnLast4?: string;
  readonly itinLast4?: string;
  readonly mbi?: string;
  readonly legalId?: string;
  readonly cspUuid?: string;
  readonly empiId?: string;
  readonly suffix?: string;
}

describe('CMS Patient Match Utils', () => {
  test('folds strings for case, punctuation, whitespace, and diacritic insensitive matching', () => {
    expect(foldString(' José  A. Smith-Jr. ')).toBe('joseasmithjr');
  });

  test('extracts and folds all CMS match fields from a patient', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ family: "O'Connor", given: [' Ana-Maria '] }],
      birthDate: '1970-01-02',
      address: [{ line: ['123 Main St.', 'Apt. 4'] }],
      telecom: [
        { system: 'phone', value: '+1 (617) 555-0100' },
        { system: 'email', value: 'Ana.Example@Example.COM' },
        { system: 'fax', value: 'ignored' },
      ],
      identifier: [
        { system: SSN_SYSTEM, value: '123-45-6789' },
        { system: ITIN_SYSTEM, value: '987-65-4321' },
        { system: MBI_SYSTEM, value: '1EG4-TE5-MK73' },
        { system: LEGAL_ID_SYSTEM, value: 'BENE-123' },
        { system: CSP_UUID_SYSTEM, value: 'CSP-ABC' },
        { system: EMPI_ID_SYSTEM, value: 'EMPI-999' },
      ],
    };

    expect(extractCmsMatchFields(patient)).toEqual({
      firstName: new Set(['anamaria']),
      lastName: new Set(['oconnor']),
      dob: new Set(['19700102']),
      streetLine: new Set(['123mainst', 'apt4']),
      phone: new Set(['6175550100']),
      email: new Set(['anaexampleexamplecom']),
      ssnLast4: new Set(['6789']),
      itinLast4: new Set(['4321']),
      mbi: new Set(['1eg4te5mk73']),
      legalId: new Set(['bene123']),
      cspUuid: new Set(['cspabc']),
      empiId: new Set(['empi999']),
    });
  });

  test('extractStrings ignores non-string FHIRPath values', () => {
    expect(extractStrings({ resourceType: 'Patient', multipleBirthBoolean: true }, 'Patient.multipleBirth')).toEqual(
      new Set()
    );
  });

  test('extractStrings skips values that normalize to empty strings', () => {
    expect(extractStrings({ resourceType: 'Patient', name: [{ given: ['---'] }] }, 'Patient.name.given')).toEqual(
      new Set()
    );
  });

  test('normalizes SSN and ITIN values to last four folded characters', () => {
    expect(normalizeLast4('123-45-6789')).toBe('6789');
    expect(normalizeLast4('6789')).toBe('6789');
  });

  test('normalizes US phone numbers and leaves other country codes as digits', () => {
    expect(normalizePhone('+1 (617) 555-0100')).toBe('6175550100');
    expect(normalizePhone('617.555.0100')).toBe('6175550100');
    expect(normalizePhone('+44 20 7946 0958')).toBe('442079460958');
  });

  test('normalizes only full birth dates', () => {
    expect(normalizeFullDate('1970-01-02')).toBe('19700102');
    expect(normalizeFullDate('1970-01')).toBe('');
    expect(normalizeFullDate('1970')).toBe('');
  });

  test('matches exact values before fuzzy values', () => {
    expect(matchField(new Set(['robert', 'alice']), new Set(['alice', 'robret']))).toBe('exact');
  });

  test('matches one edit fuzzy values when both values have sufficient length', () => {
    expect(matchField(new Set(['robert']), new Set(['robret']))).toBe('fuzzy');
    expect(matchField(new Set(['smith']), new Set(['smyth']))).toBe('fuzzy');
  });

  test('does not fuzzy match short values, empty fields, or distant values', () => {
    expect(matchField(new Set(['ann']), new Set(['ana']))).toBe('none');
    expect(matchField(new Set(), new Set(['robert']))).toBe('none');
    expect(matchField(new Set(['robert']), new Set(['charles']))).toBe('none');
  });

  test('compares all CMS match fields', () => {
    const left: CmsPatientMatchFields = emptyFields({
      firstName: ['robert'],
      lastName: ['smith'],
      phone: ['6175550100'],
    });
    const right: CmsPatientMatchFields = emptyFields({
      firstName: ['robret'],
      lastName: ['smith'],
      phone: ['6175550199'],
    });

    expect(compareCmsMatchFields(left, right)).toMatchObject({
      firstName: 'fuzzy',
      lastName: 'exact',
      phone: 'none',
      dob: 'none',
      email: 'none',
    });
  });

  test('computes Damerau-Levenshtein distance for empty strings and single edits', () => {
    expect(damerauLevenshtein('', 'abc')).toBe(3);
    expect(damerauLevenshtein('abc', '')).toBe(3);
    expect(damerauLevenshtein('robert', 'robret')).toBe(1);
    expect(damerauLevenshtein('smith', 'smyth')).toBe(1);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
  });

  test.each([
    ['01', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', streetLine: '123 Main' }],
    ['02', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', phone: '6175550100' }],
    ['03', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', email: 'robert@example.com' }],
    ['04', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', ssnLast4: '1234' }],
    ['05', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', ssnLast4: '1234' }],
    ['06', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', itinLast4: '4321' }],
    ['07', { firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', itinLast4: '4321' }],
    ['08', { firstName: 'Robert', dob: '1970-01-01', mbi: '1EG4TE5MK73' }],
    ['09', { firstName: 'Robert', dob: '1970-01-01', legalId: 'BENE123' }],
    ['10', { lastName: 'Smith', dob: '1970-01-01', legalId: 'BENE123' }],
    ['11', { firstName: 'Robert', dob: '1970-01-01', phone: '6175550100' }],
    ['12', { firstName: 'Robert', dob: '1970-01-01', email: 'robert@example.com' }],
    ['13', { lastName: 'Smith', phone: '6175550100', ssnLast4: '1234' }],
    ['14', { lastName: 'Smith', phone: '6175550100', itinLast4: '4321' }],
    ['15', { lastName: 'Smith', email: 'robert@example.com', ssnLast4: '1234' }],
    ['16', { lastName: 'Smith', email: 'robert@example.com', itinLast4: '4321' }],
    ['17', { firstName: 'Robert', phone: '6175550100', ssnLast4: '1234' }],
    ['18', { firstName: 'Robert', phone: '6175550100', itinLast4: '4321' }],
    ['19', { firstName: 'Robert', email: 'robert@example.com', ssnLast4: '1234' }],
    ['20', { firstName: 'Robert', email: 'robert@example.com', itinLast4: '4321' }],
    ['21', { phone: '6175550100', mbi: '1EG4TE5MK73' }],
    ['22', { phone: '6175550100', legalId: 'BENE123' }],
    ['23', { email: 'robert@example.com', mbi: '1EG4TE5MK73' }],
    ['24', { email: 'robert@example.com', legalId: 'BENE123' }],
    ['25', { legalId: 'BENE123', mbi: '1EG4TE5MK73' }],
    ['26', { cspUuid: 'CSP-ABC' }],
    ['27', { empiId: 'EMPI-999' }],
  ] satisfies [string, PatientFields][])('identifies CMS criteria %s', (criteriaId, fields) => {
    const query = patientFromFields(fields);
    let candidate = patientFromFields(fields);
    if (criteriaId === '05' || criteriaId === '07' || criteriaId === '10' || criteriaId === '15' || criteriaId === '16') {
      candidate = patientFromFields({ ...fields, lastName: 'Smiht' });
    } else if (criteriaId === '04' || criteriaId === '06') {
      candidate = patientFromFields({ ...fields, firstName: 'Robret' });
    }

    const result = cmsPatientMatch(query, candidate);

    expect(result.criteriaId).toBe(criteriaId);
    expect(result.matchType).toBe(
      ['04', '05', '06', '07', '10', '15', '16'].includes(criteriaId) ? 'fuzzy' : 'exact'
    );
  });

  test('counts exact, fuzzy, and non-matching fields', () => {
    expect(
      cmsPatientMatch(
        patientFromFields({ firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01' }),
        patientFromFields({ firstName: 'Robret', lastName: 'Smith', dob: '1985-12-31' })
      )
    ).toMatchObject({
      exactCount: 1,
      fuzzyCount: 1,
      noneCount: 10,
      criteriaId: undefined,
      matchType: undefined,
    });
  });

  test('allows at most one fuzzy match across starred criteria fields', () => {
    expect(
      cmsPatientMatch(
        patientFromFields({ firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', streetLine: '123 Main' }),
        patientFromFields({ firstName: 'Robret', lastName: 'Smiht', dob: '1970-01-01', streetLine: '123 Main' })
      ).criteriaId
    ).toBeUndefined();
  });

  test('does not match when identifiable generational suffixes conflict', () => {
    const query = patientFromFields({
      firstName: 'Robert',
      lastName: 'Smith',
      dob: '1970-01-01',
      phone: '6175550100',
      suffix: 'Jr.',
    });
    const candidate = patientFromFields({
      firstName: 'Robert',
      lastName: 'Smith',
      dob: '1970-01-01',
      phone: '6175550100',
      suffix: 'Senior',
    });

    expect(hasGenerationalSuffixConflict(query, candidate)).toBe(true);
    expect(cmsPatientMatch(query, candidate)).toMatchObject({
      criteriaId: undefined,
      matchType: undefined,
      suffixConflict: true,
    });
  });

  test('does not block on absent or equivalent generational suffixes', () => {
    expect(
      hasGenerationalSuffixConflict(patientFromFields({ suffix: 'Jr.' }), patientFromFields({ suffix: 'Junior' }))
    ).toBe(false);
    expect(hasGenerationalSuffixConflict(patientFromFields({ suffix: 'Jr.' }), patientFromFields({}))).toBe(false);
  });

  test.each([
    ['II', '2nd', 'second'],
    ['III', '3rd', 'third'],
    ['IV', '4th', 'fourth'],
  ])('recognizes equivalent %s suffix aliases', (roman, ordinal, word) => {
    expect(hasGenerationalSuffixConflict(patientFromFields({ suffix: roman }), patientFromFields({ suffix: ordinal }))).toBe(
      false
    );
    expect(hasGenerationalSuffixConflict(patientFromFields({ suffix: roman }), patientFromFields({ suffix: word }))).toBe(
      false
    );
  });

  test('ignores unrecognized suffix values for suffix conflicts', () => {
    expect(hasGenerationalSuffixConflict(patientFromFields({ suffix: 'PhD' }), patientFromFields({ suffix: 'MD' }))).toBe(
      false
    );
  });
});

function patientFromFields(fields: PatientFields): Patient {
  const patient: Patient = { resourceType: 'Patient' };
  if (fields.firstName || fields.lastName) {
    patient.name = [
      {
        given: fields.firstName ? [fields.firstName] : undefined,
        family: fields.lastName,
        suffix: fields.suffix ? [fields.suffix] : undefined,
      },
    ];
  } else if (fields.suffix) {
    patient.name = [{ suffix: [fields.suffix] }];
  }
  if (fields.dob) {
    patient.birthDate = fields.dob;
  }
  if (fields.streetLine) {
    patient.address = [{ line: [fields.streetLine] }];
  }
  patient.telecom = [
    ...(fields.phone ? [{ system: 'phone' as const, value: fields.phone }] : []),
    ...(fields.email ? [{ system: 'email' as const, value: fields.email }] : []),
  ];
  patient.identifier = [
    ...(fields.ssnLast4 ? [{ system: SSN_SYSTEM, value: fields.ssnLast4 }] : []),
    ...(fields.itinLast4 ? [{ system: ITIN_SYSTEM, value: fields.itinLast4 }] : []),
    ...(fields.mbi ? [{ system: MBI_SYSTEM, value: fields.mbi }] : []),
    ...(fields.legalId ? [{ system: LEGAL_ID_SYSTEM, value: fields.legalId }] : []),
    ...(fields.cspUuid ? [{ system: CSP_UUID_SYSTEM, value: fields.cspUuid }] : []),
    ...(fields.empiId ? [{ system: EMPI_ID_SYSTEM, value: fields.empiId }] : []),
  ];
  return patient;
}

function emptyFields(fields: Partial<Record<keyof CmsPatientMatchFields, string[]>>): CmsPatientMatchFields {
  return {
    firstName: new Set(fields.firstName ?? []),
    lastName: new Set(fields.lastName ?? []),
    dob: new Set(fields.dob ?? []),
    streetLine: new Set(fields.streetLine ?? []),
    phone: new Set(fields.phone ?? []),
    email: new Set(fields.email ?? []),
    ssnLast4: new Set(fields.ssnLast4 ?? []),
    itinLast4: new Set(fields.itinLast4 ?? []),
    mbi: new Set(fields.mbi ?? []),
    legalId: new Set(fields.legalId ?? []),
    cspUuid: new Set(fields.cspUuid ?? []),
    empiId: new Set(fields.empiId ?? []),
  };
}
