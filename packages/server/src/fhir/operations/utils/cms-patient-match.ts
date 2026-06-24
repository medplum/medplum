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
  readonly cspUuid: Set<string>;
  readonly empiId: Set<string>;
}

export interface CmsPatientFieldMatchResult {
  readonly firstName: FieldMatch;
  readonly lastName: FieldMatch;
  readonly dob: FieldMatch;
  readonly streetLine: FieldMatch;
  readonly phone: FieldMatch;
  readonly email: FieldMatch;
  readonly ssnLast4: FieldMatch;
  readonly itinLast4: FieldMatch;
  readonly mbi: FieldMatch;
  readonly legalId: FieldMatch;
  readonly cspUuid: FieldMatch;
  readonly empiId: FieldMatch;
}

export interface CmsPatientMatchResult {
  readonly fieldMatches: CmsPatientFieldMatchResult;
  readonly exactCount: number;
  readonly fuzzyCount: number;
  readonly noneCount: number;
  readonly criteriaId: string | undefined;
}

export function cmsPatientMatch(p1: Patient, p2: Patient): CmsPatientMatchResult {
  const fields1 = extractCmsMatchFields(p1);
  const fields2 = extractCmsMatchFields(p2);
  const fieldMatches = compareCmsMatchFields(fields1, fields2);

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

  const { firstName, lastName, dob, streetLine, phone, email, ssnLast4, itinLast4, mbi, legalId, cspUuid, empiId } =
    fieldMatches;

  // `ex` = field must match exactly
  const ex = (m: FieldMatch): boolean => m === 'exact';

  // `starred` = the fields marked `*` in the spec, which may
  // match exactly or fuzzily; it requires every passed field to match and enforces §V.E
  // (at most one of them may be satisfied fuzzily).
  const starred = (...ms: FieldMatch[]): boolean =>
    ms.filter((m) => m === 'none').length === 0 && ms.filter((m) => m === 'fuzzy').length <= 1;

  let criteriaId: string | undefined;

  if (starred(firstName, lastName, streetLine) && ex(dob)) {
    criteriaId = '01';
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(phone)) {
    criteriaId = '02';
  } else if (starred(firstName, lastName) && ex(dob) && ex(email)) {
    criteriaId = '03';
  } else if (starred(firstName) && ex(lastName) && ex(dob) && ex(ssnLast4)) {
    criteriaId = '04';
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(ssnLast4)) {
    criteriaId = '05';
  } else if (starred(firstName) && ex(lastName) && ex(dob) && ex(itinLast4)) {
    criteriaId = '06';
  } else if (ex(firstName) && starred(lastName) && ex(dob) && ex(itinLast4)) {
    criteriaId = '07';
  } else if (ex(firstName) && ex(dob) && ex(mbi)) {
    criteriaId = '08';
  } else if (ex(firstName) && ex(dob) && ex(legalId)) {
    criteriaId = '09';
  } else if (starred(lastName) && ex(dob) && ex(legalId)) {
    criteriaId = '10';
  } else if (ex(firstName) && ex(dob) && ex(phone)) {
    criteriaId = '11';
  } else if (ex(firstName) && ex(dob) && ex(email)) {
    criteriaId = '12';
  } else if (ex(lastName) && ex(phone) && ex(ssnLast4)) {
    criteriaId = '13';
  } else if (ex(lastName) && ex(phone) && ex(itinLast4)) {
    criteriaId = '14';
  } else if (starred(lastName) && ex(email) && ex(ssnLast4)) {
    criteriaId = '15';
  } else if (starred(lastName) && ex(email) && ex(itinLast4)) {
    criteriaId = '16';
  } else if (ex(firstName) && ex(phone) && ex(ssnLast4)) {
    criteriaId = '17';
  } else if (ex(firstName) && ex(phone) && ex(itinLast4)) {
    criteriaId = '18';
  } else if (ex(firstName) && ex(email) && ex(ssnLast4)) {
    criteriaId = '19';
  } else if (ex(firstName) && ex(email) && ex(itinLast4)) {
    criteriaId = '20';
  } else if (ex(phone) && ex(mbi)) {
    criteriaId = '21';
  } else if (ex(phone) && ex(legalId)) {
    criteriaId = '22';
  } else if (ex(email) && ex(mbi)) {
    criteriaId = '23';
  } else if (ex(email) && ex(legalId)) {
    criteriaId = '24';
  } else if (ex(legalId) && ex(mbi)) {
    criteriaId = '25';
  } else if (ex(cspUuid)) {
    criteriaId = '26';
  } else if (ex(empiId)) {
    criteriaId = '27';
  }

  return {
    fieldMatches,
    exactCount,
    fuzzyCount,
    noneCount,
    criteriaId,
  };
}

export function extractCmsMatchFields(patient: Patient): CmsPatientMatchFields {
  return {
    firstName: extractStrings(patient, 'Patient.name.given'),
    lastName: extractStrings(patient, 'Patient.name.family'),
    dob: extractStrings(patient, 'Patient.birthDate'),
    streetLine: extractStrings(patient, 'Patient.address.line'),
    phone: extractStrings(patient, 'Patient.telecom.where(system = "phone").value'),
    email: extractStrings(patient, 'Patient.telecom.where(system = "email").value'),
    ssnLast4: extractStrings(patient, 'Patient.identifier.where(system = "http://hl7.org/fhir/sid/us-ssn").value'),
    itinLast4: extractStrings(patient, 'Patient.identifier.where(system = "http://hl7.org/fhir/sid/us-itin").value'),
    mbi: extractStrings(
      patient,
      'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/mbi").value'
    ),
    legalId: extractStrings(
      patient,
      'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/beneficiary-id").value'
    ),
    cspUuid: extractStrings(
      patient,
      'Patient.identifier.where(system = "https://bluebutton.cms.gov/resources/identifiers/csp-uuid").value'
    ),
    empiId: extractStrings(
      patient,
      'Patient.identifier.where(system != "http://hl7.org/fhir/sid/us-ssn" and system != "http://hl7.org/fhir/sid/us-itin" and system != "https://bluebutton.cms.gov/resources/identifiers/mbi" and system != "https://bluebutton.cms.gov/resources/identifiers/beneficiary-id" and system != "https://bluebutton.cms.gov/resources/identifiers/csp-uuid").value'
    ),
  };
}

export function extractStrings(patient: Patient, expression: string): Set<string> {
  const values = evalFhirPathTyped(expression, [toTypedValue(patient)]);
  const result = new Set<string>();
  for (const v of values) {
    if (isString(v.value)) {
      result.add(foldString(v.value));
    }
  }
  return result;
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
    cspUuid: matchField(p1.cspUuid, p2.cspUuid),
    empiId: matchField(p1.empiId, p2.empiId),
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
