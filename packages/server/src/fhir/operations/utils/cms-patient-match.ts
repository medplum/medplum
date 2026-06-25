// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { evalFhirPathTyped, isString, toTypedValue } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

export type FieldMatch = 'exact' | 'fuzzy' | 'none';

export interface CmsPatientMatchFields {
  readonly firstName: Set<string>;
  readonly lastName: Set<string>;
  readonly dob: Set<string>;
  readonly streetLine: Set<string>;
  readonly phone: Set<string>;
  readonly email: Set<string>;
  readonly ssnLast4: Set<string>;
  readonly itinLast4: Set<string>;
  readonly mbi: Set<string>;
  readonly legalId: Set<string>;
  readonly namespaceId: Set<string>;
}

export type CmsPatientFieldMatchResult = Readonly<Record<keyof CmsPatientMatchFields, FieldMatch>>;

export interface CmsPatientMatchResult {
  readonly fieldMatches: CmsPatientFieldMatchResult;
  readonly exactCount: number;
  readonly fuzzyCount: number;
  readonly noneCount: number;
  readonly criteriaId: string | undefined;
  readonly matchType: 'exact' | 'fuzzy' | undefined;
  readonly suffixConflict: boolean;
}

export function cmsPatientMatch(p1: Patient, p2: Patient): CmsPatientMatchResult {
  const fields1 = extractCmsMatchFields(p1);
  const fields2 = extractCmsMatchFields(p2);
  const fieldMatches = compareCmsMatchFields(fields1, fields2);
  const suffixConflict = hasGenerationalSuffixConflict(p1, p2);

  let exactCount = 0;
  let fuzzyCount = 0;
  let noneCount = 0;
  for (const match of Object.values(fieldMatches)) {
    if (match === 'exact') {
      exactCount++;
    } else if (match === 'fuzzy') {
      fuzzyCount++;
    } else {
      noneCount++;
    }
  }

  const { firstName, lastName, dob, streetLine, phone, email, ssnLast4, itinLast4, mbi, legalId, namespaceId } =
    fieldMatches;

  // `ex` = field must match exactly
  const ex = (m: FieldMatch): boolean => m === 'exact';

  // `starred` = the fields marked `*` in the spec, which may
  // match exactly or fuzzily; it requires every passed field to match and enforces §V.E
  // (at most one of them may be satisfied fuzzily).
  const starred = (...ms: FieldMatch[]): boolean =>
    ms.filter((m) => m === 'none').length === 0 && ms.filter((m) => m === 'fuzzy').length <= 1;

  let criteria:
    | {
        id: string;
        matchType: 'exact' | 'fuzzy';
      }
    | undefined;
  const setCriteria = (id: string, ...ms: FieldMatch[]): void => {
    criteria = { id, matchType: ms.some((m) => m === 'fuzzy') ? 'fuzzy' : 'exact' };
  };

  if (suffixConflict) {
    // A disagreeing generational suffix is an explicit CMS blocker when both sides identify one.
  } else if (starred(firstName, lastName, streetLine) && ex(dob)) {
    setCriteria('01', firstName, lastName, streetLine, dob);
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(phone)) {
    setCriteria('02', firstName, lastName, dob, phone);
  } else if (starred(firstName, lastName) && ex(dob) && ex(email)) {
    setCriteria('03', firstName, lastName, dob, email);
  } else if (starred(firstName) && ex(lastName) && ex(dob) && ex(ssnLast4)) {
    setCriteria('04', firstName, lastName, dob, ssnLast4);
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(ssnLast4)) {
    setCriteria('05', firstName, lastName, dob, ssnLast4);
  } else if (starred(firstName) && ex(lastName) && ex(dob) && ex(itinLast4)) {
    setCriteria('06', firstName, lastName, dob, itinLast4);
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(itinLast4)) {
    setCriteria('07', firstName, lastName, dob, itinLast4);
  } else if (ex(firstName) && ex(dob) && ex(mbi)) {
    setCriteria('08', firstName, dob, mbi);
  } else if (ex(firstName) && ex(dob) && ex(legalId)) {
    setCriteria('09', firstName, dob, legalId);
  } else if (starred(lastName) && ex(dob) && ex(legalId)) {
    setCriteria('10', lastName, dob, legalId);
  } else if (ex(firstName) && ex(dob) && ex(phone)) {
    setCriteria('11', firstName, dob, phone);
  } else if (ex(firstName) && ex(dob) && ex(email)) {
    setCriteria('12', firstName, dob, email);
  } else if (ex(lastName) && ex(phone) && ex(ssnLast4)) {
    setCriteria('13', lastName, phone, ssnLast4);
  } else if (ex(lastName) && ex(phone) && ex(itinLast4)) {
    setCriteria('14', lastName, phone, itinLast4);
  } else if (starred(lastName) && ex(email) && ex(ssnLast4)) {
    setCriteria('15', lastName, email, ssnLast4);
  } else if (starred(lastName) && ex(email) && ex(itinLast4)) {
    setCriteria('16', lastName, email, itinLast4);
  } else if (ex(firstName) && ex(phone) && ex(ssnLast4)) {
    setCriteria('17', firstName, phone, ssnLast4);
  } else if (ex(firstName) && ex(phone) && ex(itinLast4)) {
    setCriteria('18', firstName, phone, itinLast4);
  } else if (ex(firstName) && ex(email) && ex(ssnLast4)) {
    setCriteria('19', firstName, email, ssnLast4);
  } else if (ex(firstName) && ex(email) && ex(itinLast4)) {
    setCriteria('20', firstName, email, itinLast4);
  } else if (ex(phone) && ex(mbi)) {
    setCriteria('21', phone, mbi);
  } else if (ex(phone) && ex(legalId)) {
    setCriteria('22', phone, legalId);
  } else if (ex(email) && ex(mbi)) {
    setCriteria('23', email, mbi);
  } else if (ex(email) && ex(legalId)) {
    setCriteria('24', email, legalId);
  } else if (ex(legalId) && ex(mbi)) {
    setCriteria('25', legalId, mbi);
  } else if (ex(namespaceId)) {
    setCriteria('26', namespaceId);
  }

  return {
    fieldMatches,
    exactCount,
    fuzzyCount,
    noneCount,
    criteriaId: criteria?.id,
    matchType: criteria?.matchType,
    suffixConflict,
  };
}

export function extractCmsMatchFields(patient: Patient): CmsPatientMatchFields {
  return {
    firstName: extractStrings(patient, 'Patient.name.given'),
    lastName: extractStrings(patient, 'Patient.name.family'),
    dob: extractStrings(patient, 'Patient.birthDate', normalizeFullDate),
    streetLine: extractStrings(patient, 'Patient.address.line'),
    phone: extractStrings(patient, 'Patient.telecom.where(system = "phone").value', normalizePhone),
    email: extractStrings(patient, 'Patient.telecom.where(system = "email").value'),
    ssnLast4: extractStrings(
      patient,
      'Patient.identifier.where(system = "http://hl7.org/fhir/sid/us-ssn").value',
      normalizeLast4
    ),
    itinLast4: extractStrings(
      patient,
      'Patient.identifier.where(system = "http://hl7.org/fhir/sid/us-itin").value',
      normalizeLast4
    ),
    mbi: extractStrings(
      patient,
      'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/mbi").value'
    ),
    legalId: extractStrings(
      patient,
      'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/beneficiary-id").value'
    ),
    namespaceId: unionSets(
      extractStrings(
        patient,
        'Patient.identifier.where(system != "http://hl7.org/fhir/sid/us-ssn" and system != "http://hl7.org/fhir/sid/us-itin" and system != "https://bluebutton.cms.gov/resources/identifiers/mbi" and system != "https://bluebutton.cms.gov/resources/identifiers/beneficiary-id" and system != "https://bluebutton.cms.gov/resources/identifiers/csp-uuid").value'
      ),
      extractStrings(
        patient,
        'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/csp-uuid").value'
      )
    ),
  };
}

export function extractStrings(
  patient: Patient,
  expression: string,
  normalize: (value: string) => string = foldString
): Set<string> {
  const values = evalFhirPathTyped(expression, [toTypedValue(patient)]);
  const result = new Set<string>();
  for (const v of values) {
    if (isString(v.value)) {
      const normalized = normalize(v.value);
      if (normalized) {
        result.add(normalized);
      }
    }
  }
  return result;
}

export function normalizeLast4(value: string): string {
  return foldString(value).slice(-4);
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizeFullDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? foldString(value) : '';
}

export function hasGenerationalSuffixConflict(p1: Patient, p2: Patient): boolean {
  const suffixes1 = extractGenerationalSuffixes(p1);
  const suffixes2 = extractGenerationalSuffixes(p2);
  return suffixes1.size > 0 && suffixes2.size > 0 && !setsIntersect(suffixes1, suffixes2);
}

/**
 * Folds a string for case-, whitespace-, punctuation-, and diacritic-insensitive matching
 * (§V.A.1–4): NFD-decompose, drop combining diacritics, lowercase, and keep only
 * alphanumeric characters.
 * @param value - The raw string.
 * @returns The folded string (may be empty).
 */
export function foldString(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extractGenerationalSuffixes(patient: Patient): Set<string> {
  const suffixes = new Set<string>();
  for (const name of patient.name ?? []) {
    for (const suffix of name.suffix ?? []) {
      const normalized = normalizeGenerationalSuffix(suffix);
      if (normalized) {
        suffixes.add(normalized);
      }
    }
  }
  return suffixes;
}

function normalizeGenerationalSuffix(value: string): string | undefined {
  return GENERATIONAL_SUFFIXES[foldString(value)];
}

const GENERATIONAL_SUFFIXES: Record<string, string> = {
  jr: 'jr',
  junior: 'jr',
  sr: 'sr',
  senior: 'sr',
  ii: 'ii',
  '2nd': 'ii',
  second: 'ii',
  iii: 'iii',
  '3rd': 'iii',
  third: 'iii',
  iv: 'iv',
  '4th': 'iv',
  fourth: 'iv',
};

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) {
      return true;
    }
  }
  return false;
}

function unionSets<T>(...sets: Set<T>[]): Set<T> {
  return new Set(sets.flatMap((s) => Array.from(s)));
}

export function matchField(a: Set<string>, b: Set<string>): FieldMatch {
  if (a.size === 0 || b.size === 0) {
    return 'none';
  }
  for (const v1 of a) {
    for (const v2 of b) {
      if (v1 === v2) {
        return 'exact';
      }
    }
  }
  for (const v1 of a) {
    for (const v2 of b) {
      if (v1.length >= MIN_FUZZY_LENGTH && v2.length >= MIN_FUZZY_LENGTH) {
        const distance = damerauLevenshtein(v1, v2);
        if (distance <= 1) {
          return 'fuzzy';
        }
      }
    }
  }
  return 'none';
}

export function compareCmsMatchFields(
  p1: CmsPatientMatchFields,
  p2: CmsPatientMatchFields
): CmsPatientFieldMatchResult {
  return {
    firstName: matchField(p1.firstName, p2.firstName),
    lastName: matchField(p1.lastName, p2.lastName),
    dob: matchField(p1.dob, p2.dob),
    streetLine: matchField(p1.streetLine, p2.streetLine),
    phone: matchField(p1.phone, p2.phone),
    email: matchField(p1.email, p2.email),
    ssnLast4: matchField(p1.ssnLast4, p2.ssnLast4),
    itinLast4: matchField(p1.itinLast4, p2.itinLast4),
    mbi: matchField(p1.mbi, p2.mbi),
    legalId: matchField(p1.legalId, p2.legalId),
    namespaceId: matchField(p1.namespaceId, p2.namespaceId),
  };
}

/** Minimum normalized string length eligible for fuzzy comparison (§V.E.3). */
const MIN_FUZZY_LENGTH = 5;

/**
 * Restricted Damerau-Levenshtein (optimal string alignment) edit distance.
 *
 * Counts single-character insertions, deletions, substitutions, and adjacent
 * transpositions. For the only threshold this framework uses (distance <= 1) the
 * restricted form is equivalent to true Damerau-Levenshtein (§V.E.2).
 *
 * @param a - First string (already normalized).
 * @param b - Second string (already normalized).
 * @returns The edit distance between `a` and `b`.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) {
    return bl;
  }
  if (bl === 0) {
    return al;
  }

  // d[i][j] = distance between a[0..i) and b[0..j)
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) {
    d[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      // adjacent transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}
