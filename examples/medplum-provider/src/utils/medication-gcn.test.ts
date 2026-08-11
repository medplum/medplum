// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Medication } from '@medplum/fhirtypes';
import { SCRIPTSURE_GCN_SEQNO_SYSTEM, SCRIPTSURE_ROUTED_MED_ID_SYSTEM } from '@medplum/scriptsure-react';
import { describe, expect, test } from 'vitest';
import {
  getDisplayNameFromMedication,
  getGcnSeqnosFromMedication,
  getUnambiguousGcnSeqnoFromMedication,
  getVendorKeyFromMedication,
} from './medication-gcn';

function medicationWithGcnIdentifiers(...values: string[]): Medication {
  return {
    resourceType: 'Medication',
    identifier: values.map((value) => ({ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, value })),
  };
}

describe('getGcnSeqnosFromMedication', () => {
  test('returns nothing for a Medication with no formulation keys', () => {
    expect(getGcnSeqnosFromMedication({ resourceType: 'Medication' })).toStrictEqual([]);
    expect(
      getGcnSeqnosFromMedication({
        resourceType: 'Medication',
        identifier: [{ system: 'http://hl7.org/fhir/sid/ndc', value: '00310075190' }],
      })
    ).toStrictEqual([]);
  });

  test('reads a single key off an identifier', () => {
    expect(getGcnSeqnosFromMedication(medicationWithGcnIdentifiers('51784'))).toStrictEqual([51784]);
  });

  test('reads every key for a multi-strength search hit', () => {
    expect(getGcnSeqnosFromMedication(medicationWithGcnIdentifiers('8346', '22528', '22530'))).toStrictEqual([
      8346, 22528, 22530,
    ]);
  });

  test('collects keys from code.coding as well as identifier', () => {
    const m: Medication = {
      resourceType: 'Medication',
      identifier: [{ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, value: '8346' }],
      code: { coding: [{ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, code: '22528' }] },
    };
    expect(getGcnSeqnosFromMedication(m)).toStrictEqual([8346, 22528]);
  });

  test('deduplicates the same key repeated across identifier and coding', () => {
    const m: Medication = {
      resourceType: 'Medication',
      identifier: [{ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, value: '7341' }],
      code: { coding: [{ system: SCRIPTSURE_GCN_SEQNO_SYSTEM, code: '7341' }] },
    };
    expect(getGcnSeqnosFromMedication(m)).toStrictEqual([7341]);
  });

  test('treats a zero-padded key as the same strength, not a second one', () => {
    // Deduping raw strings would yield [8346, 8346] and make one logical
    // strength look ambiguous.
    expect(getGcnSeqnosFromMedication(medicationWithGcnIdentifiers('8346', '08346'))).toStrictEqual([8346]);
  });

  test('drops values that are not purely numeric rather than half-parsing them', () => {
    expect(getGcnSeqnosFromMedication(medicationWithGcnIdentifiers('12abc', '', '  ', 'abc'))).toStrictEqual([]);
    expect(getGcnSeqnosFromMedication(medicationWithGcnIdentifiers(' 8346 ', '9x'))).toStrictEqual([8346]);
  });
});

describe('getUnambiguousGcnSeqnoFromMedication', () => {
  test('returns the key when exactly one is present', () => {
    expect(getUnambiguousGcnSeqnoFromMedication(medicationWithGcnIdentifiers('51784'))).toBe(51784);
  });

  test('returns nothing when none is present', () => {
    expect(getUnambiguousGcnSeqnoFromMedication({ resourceType: 'Medication' })).toBeUndefined();
  });

  test('returns nothing when several are present, rather than picking a strength', () => {
    expect(getUnambiguousGcnSeqnoFromMedication(medicationWithGcnIdentifiers('8346', '22528'))).toBeUndefined();
  });

  test('still resolves when duplicates collapse to one key', () => {
    expect(getUnambiguousGcnSeqnoFromMedication(medicationWithGcnIdentifiers('7341', '07341'))).toBe(7341);
  });
});

describe('getDisplayNameFromMedication', () => {
  test('prefers code.text', () => {
    const m: Medication = {
      resourceType: 'Medication',
      code: {
        text: 'Tolcylen topical',
        coding: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '177770', display: 'Tolcylen' }],
      },
    };
    expect(getDisplayNameFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBe('Tolcylen topical');
  });

  test('falls back to the routed-med coding display when there is no text', () => {
    const m: Medication = {
      resourceType: 'Medication',
      code: {
        coding: [
          { system: 'http://hl7.org/fhir/sid/ndc', code: '00310075190', display: 'NDC display' },
          { system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '76704', display: 'Crestor oral' },
        ],
      },
    };
    expect(getDisplayNameFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBe('Crestor oral');
  });

  test('falls back to any coding display as a last resort', () => {
    const m: Medication = {
      resourceType: 'Medication',
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/ndc', code: '1', display: 'Some product' }] },
    };
    expect(getDisplayNameFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBe('Some product');
  });

  test('returns nothing when every candidate is blank, so callers can refuse to send a nameless line', () => {
    const m: Medication = {
      resourceType: 'Medication',
      code: { text: '   ', coding: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '1', display: '  ' }] },
    };
    expect(getDisplayNameFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBeUndefined();
  });
});

describe('getVendorKeyFromMedication', () => {
  test('reads the key from an identifier', () => {
    const m: Medication = {
      resourceType: 'Medication',
      identifier: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, value: '177770' }],
    };
    expect(getVendorKeyFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBe(177770);
  });

  test('falls back to code.coding', () => {
    const m: Medication = {
      resourceType: 'Medication',
      code: { coding: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, code: '6143' }] },
    };
    expect(getVendorKeyFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBe(6143);
  });

  test('returns nothing when absent or non-numeric', () => {
    expect(getVendorKeyFromMedication({ resourceType: 'Medication' }, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBeUndefined();
    const m: Medication = {
      resourceType: 'Medication',
      identifier: [{ system: SCRIPTSURE_ROUTED_MED_ID_SYSTEM, value: '17abc' }],
    };
    expect(getVendorKeyFromMedication(m, SCRIPTSURE_ROUTED_MED_ID_SYSTEM)).toBeUndefined();
  });
});
