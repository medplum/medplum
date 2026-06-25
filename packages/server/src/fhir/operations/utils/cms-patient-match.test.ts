// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import type { CmsPatientMatchFields } from './cms-patient-match';
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

const SSN = 'http://hl7.org/fhir/sid/us-ssn';
const ITIN = 'http://hl7.org/fhir/sid/us-itin';
const MBI = 'https://bluebutton.cms.gov/resources/identifiers/mbi';
const LEGAL = 'https://bluebutton.cms.gov/resources/identifiers/beneficiary-id';
const CSP = 'https://bluebutton.cms.gov/resources/identifiers/csp-uuid';
const EMPI = 'https://example.com/empi';

type Field = keyof CmsPatientMatchFields;
type Fields = Partial<Record<Field | 'suffix', string>>;

describe('CMS Patient Match Utils', () => {
  test('normalizes extracted CMS match fields', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ family: "O'Connor", given: [' Ana-Maria '] }],
      birthDate: '1970-01-02',
      address: [{ line: ['123 Main St.', 'Apt. 4'] }],
      telecom: [
        { system: 'phone', value: '+1 (617) 555-0100' },
        { system: 'email', value: 'Ana.Example@Example.COM' },
      ],
      identifier: [
        { system: SSN, value: '123-45-6789' },
        { system: ITIN, value: '987-65-4321' },
        { system: MBI, value: '1EG4-TE5-MK73' },
        { system: LEGAL, value: 'BENE-123' },
        { system: CSP, value: 'CSP-ABC' },
        { system: EMPI, value: 'EMPI-999' },
      ],
    };

    expect(extractCmsMatchFields(patient)).toEqual(
      fields({
        firstName: 'anamaria',
        lastName: 'oconnor',
        dob: '19700102',
        streetLine: ['123mainst', 'apt4'],
        phone: '6175550100',
        email: 'anaexampleexamplecom',
        ssnLast4: '6789',
        itinLast4: '4321',
        mbi: '1eg4te5mk73',
        legalId: 'bene123',
        cspUuid: 'cspabc',
        empiId: 'empi999',
      })
    );
  });

  test('normalization helpers handle edge cases', () => {
    expect(foldString(' José  A. Smith-Jr. ')).toBe('joseasmithjr');
    expect(normalizeLast4('123-45-6789')).toBe('6789');
    expect(normalizePhone('+1 (617) 555-0100')).toBe('6175550100');
    expect(normalizePhone('+44 20 7946 0958')).toBe('442079460958');
    expect(normalizeFullDate('1970-01-02')).toBe('19700102');
    expect(normalizeFullDate('1970-01')).toBe('');
    expect(extractStrings({ resourceType: 'Patient', name: [{ given: ['---'] }] }, 'Patient.name.given')).toEqual(
      new Set()
    );
    expect(extractStrings({ resourceType: 'Patient', multipleBirthBoolean: true }, 'Patient.multipleBirth')).toEqual(
      new Set()
    );
  });

  test('matches fields exactly, fuzzily, or not at all', () => {
    expect(matchField(new Set(['robert', 'alice']), new Set(['alice', 'robret']))).toBe('exact');
    expect(matchField(new Set(['robert']), new Set(['robret']))).toBe('fuzzy');
    expect(matchField(new Set(['smith']), new Set(['smyth']))).toBe('fuzzy');
    expect(matchField(new Set(['ann']), new Set(['ana']))).toBe('none');
    expect(matchField(new Set(), new Set(['robert']))).toBe('none');
    expect(matchField(new Set(['robert']), new Set(['charles']))).toBe('none');
  });

  test('compares fields and computes Damerau-Levenshtein distances', () => {
    expect(compareCmsMatchFields(fields({ firstName: 'robert' }), fields({ firstName: 'robret' }))).toMatchObject({
      firstName: 'fuzzy',
      lastName: 'none',
    });
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
  ] satisfies [string, Fields][])('identifies CMS criteria %s', (criteriaId, input) => {
    const fuzzyLast = ['05', '07', '10', '15', '16'].includes(criteriaId);
    const fuzzyFirst = ['04', '06'].includes(criteriaId);
    const result = cmsPatientMatch(
      patient(input),
      patient({ ...input, ...(fuzzyLast ? { lastName: 'Smiht' } : {}), ...(fuzzyFirst ? { firstName: 'Robret' } : {}) })
    );
    expect(result.criteriaId).toBe(criteriaId);
    expect(result.matchType).toBe(fuzzyLast || fuzzyFirst ? 'fuzzy' : 'exact');
  });

  test('counts matches and rejects excess fuzzy or suffix-conflicting matches', () => {
    expect(
      cmsPatientMatch(
        patient({ firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01' }),
        patient({ firstName: 'Robret', lastName: 'Smith', dob: '1985-12-31' })
      )
    ).toMatchObject({ exactCount: 1, fuzzyCount: 1, noneCount: 10, criteriaId: undefined });
    expect(
      cmsPatientMatch(
        patient({ firstName: 'Robert', lastName: 'Smith', dob: '1970-01-01', streetLine: '123 Main' }),
        patient({ firstName: 'Robret', lastName: 'Smiht', dob: '1970-01-01', streetLine: '123 Main' })
      ).criteriaId
    ).toBeUndefined();
    expect(
      cmsPatientMatch(
        patient({ firstName: 'Robert', dob: '1970-01-01', phone: '6175550100', suffix: 'Jr.' }),
        patient({ firstName: 'Robert', dob: '1970-01-01', phone: '6175550100', suffix: 'Senior' })
      )
    ).toMatchObject({ criteriaId: undefined, suffixConflict: true });
  });

  test.each([
    ['Jr.', 'Junior'],
    ['II', '2nd'],
    ['II', 'second'],
    ['III', '3rd'],
    ['III', 'third'],
    ['IV', '4th'],
    ['IV', 'fourth'],
    ['PhD', 'MD'],
  ])('does not report equivalent or unrecognized suffixes as conflicts', (a, b) => {
    expect(hasGenerationalSuffixConflict(patient({ suffix: a }), patient({ suffix: b }))).toBe(false);
  });
});

function patient(f: Fields): Patient {
  return {
    resourceType: 'Patient',
    name:
      f.firstName || f.lastName || f.suffix
        ? [
            {
              given: f.firstName ? [f.firstName] : undefined,
              family: f.lastName,
              suffix: f.suffix ? [f.suffix] : undefined,
            },
          ]
        : undefined,
    birthDate: f.dob,
    address: f.streetLine ? [{ line: [f.streetLine] }] : undefined,
    telecom: [
      ...(f.phone ? [{ system: 'phone' as const, value: f.phone }] : []),
      ...(f.email ? [{ system: 'email' as const, value: f.email }] : []),
    ],
    identifier: [
      ...(f.ssnLast4 ? [{ system: SSN, value: f.ssnLast4 }] : []),
      ...(f.itinLast4 ? [{ system: ITIN, value: f.itinLast4 }] : []),
      ...(f.mbi ? [{ system: MBI, value: f.mbi }] : []),
      ...(f.legalId ? [{ system: LEGAL, value: f.legalId }] : []),
      ...(f.cspUuid ? [{ system: CSP, value: f.cspUuid }] : []),
      ...(f.empiId ? [{ system: EMPI, value: f.empiId }] : []),
    ],
  };
}

function fields(values: Partial<Record<Field, string | string[]>>): CmsPatientMatchFields {
  const field = (name: Field): Set<string> => new Set([values[name] ?? []].flat());
  return {
    firstName: field('firstName'),
    lastName: field('lastName'),
    dob: field('dob'),
    streetLine: field('streetLine'),
    phone: field('phone'),
    email: field('email'),
    ssnLast4: field('ssnLast4'),
    itinLast4: field('itinLast4'),
    mbi: field('mbi'),
    legalId: field('legalId'),
    cspUuid: field('cspUuid'),
    empiId: field('empiId'),
  };
}
