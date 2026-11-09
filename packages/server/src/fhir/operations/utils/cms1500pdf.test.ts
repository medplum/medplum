// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimItem, HumanName } from '@medplum/fhirtypes';
import {
  formatDiagnosisPointers,
  formatHumanName,
  getCms1500ClaimTypeError,
  getPlaceOfService,
  getSimplePhone,
} from './cms1500pdf';

describe('CMS 1500 PDF Utils', () => {
  test('formats full name with middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael');
  });

  test('returns empty string when name has no family and no given names', () => {
    const name: HumanName = {
      family: undefined,
      given: [],
    };
    expect(formatHumanName(name)).toBe('');
  });

  test('formats name without middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John'],
    };
    expect(formatHumanName(name)).toBe('Smith, John');
  });

  test('returns empty string when name is undefined', () => {
    expect(formatHumanName(undefined)).toBe('');
  });

  test('formats multiple middle names', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael', 'Robert'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael Robert');
  });

  test('formats family name only', () => {
    const name: HumanName = {
      family: 'Smith',
    };
    expect(formatHumanName(name)).toBe('Smith');
  });

  test('formats given names only', () => {
    const name: HumanName = {
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('John, Michael');
  });

  test('handles empty name', () => {
    const name: HumanName = {};
    expect(formatHumanName(name)).toBe('');
  });

  test('handles undefined fields', () => {
    const name: HumanName = {
      family: undefined,
      given: undefined,
    };
    expect(formatHumanName(name)).toBe('');
  });

  test('returns undefined when input is undefined', () => {
    expect(getSimplePhone(undefined)).toBeUndefined();
  });

  test('returns undefined when input is empty string', () => {
    expect(getSimplePhone('')).toBeUndefined();
  });

  test('removes tel: prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('tel:1234567890')).toBe('234567890');
  });

  test('removes +1 prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('+11234567890')).toBe('234567890');
  });

  test('removes standalone 1 prefix from the beginning of phone numbers', () => {
    expect(getSimplePhone('11234567890')).toBe('1234567890');
  });

  test('formats a single diagnosis pointer as a letter', () => {
    expect(formatDiagnosisPointers([1])).toBe('A');
  });

  test('formats multiple diagnosis pointers with no separators (NUCC)', () => {
    expect(formatDiagnosisPointers([1, 2])).toBe('AB');
    expect(formatDiagnosisPointers([2, 4])).toBe('BD');
  });

  test('maps the 12th pointer to L (CMS-1500 Box 21 supports A-L)', () => {
    expect(formatDiagnosisPointers([12])).toBe('L');
  });

  test('returns an empty string when there are no pointers', () => {
    expect(formatDiagnosisPointers(undefined)).toBe('');
    expect(formatDiagnosisPointers([])).toBe('');
  });

  test('ignores out-of-range pointers', () => {
    expect(formatDiagnosisPointers([0, 1, 27])).toBe('A');
  });

  test('reads Box 24B place of service from the CMS place-of-service coding', () => {
    const item: ClaimItem = {
      sequence: 1,
      productOrService: {},
      locationCodeableConcept: {
        coding: [
          { system: 'http://example.com/other', code: 'XX' },
          { system: 'https://www.cms.gov/Medicare/Coding/place-of-service-codes', code: '11' },
        ],
      },
    };
    expect(getPlaceOfService(item)).toStrictEqual('11');
  });

  test('ignores locationCodeableConcept codings from other systems', () => {
    const item: ClaimItem = {
      sequence: 1,
      productOrService: {},
      locationCodeableConcept: { coding: [{ system: 'http://example.com/other', code: '02' }] },
    };
    expect(getPlaceOfService(item)).toBeUndefined();
  });

  test('never emits locationAddress.state — a state abbreviation is not a place-of-service code', () => {
    const item: ClaimItem = {
      sequence: 1,
      productOrService: {},
      locationAddress: { state: 'CA' },
    };
    expect(getPlaceOfService(item)).toBeUndefined();
  });

  test('finds the CMS-system coding regardless of its position', () => {
    const item: ClaimItem = {
      sequence: 1,
      productOrService: {},
      locationCodeableConcept: {
        coding: [
          { system: 'http://example.com/other', code: 'XX' },
          { system: 'https://www.cms.gov/Medicare/Coding/place-of-service-codes', code: '02' },
        ],
      },
    };
    expect(getPlaceOfService(item)).toStrictEqual('02');
  });

  test('returns undefined when the claim line has no location information', () => {
    const item: ClaimItem = { sequence: 1, productOrService: {} };
    expect(getPlaceOfService(item)).toBeUndefined();
  });

  describe('getCms1500ClaimTypeError', () => {
    const CLAIM_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/claim-type';

    function claimWithType(type?: Claim['type']): Claim {
      return {
        resourceType: 'Claim',
        status: 'active',
        type: type as Claim['type'],
        use: 'claim',
        patient: { reference: 'Patient/123' },
        created: '2026-01-01',
        provider: { reference: 'Organization/456' },
        priority: { coding: [{ code: 'normal' }] },
        insurance: [],
      };
    }

    test.each(['professional', 'vision'])('allows %s claims', (code) => {
      expect(
        getCms1500ClaimTypeError(claimWithType({ coding: [{ system: CLAIM_TYPE_SYSTEM, code }] }))
      ).toBeUndefined();
    });

    test('allows claims with no type coding', () => {
      expect(getCms1500ClaimTypeError(claimWithType())).toBeUndefined();
      expect(getCms1500ClaimTypeError(claimWithType({ text: 'Dental' }))).toBeUndefined();
    });

    test.each([
      ['oral', 'the ADA dental claim form'],
      ['institutional', 'the UB-04'],
      ['pharmacy', 'an NCPDP claim'],
    ])('rejects %s claims', (code, form) => {
      expect(getCms1500ClaimTypeError(claimWithType({ coding: [{ system: CLAIM_TYPE_SYSTEM, code }] }))).toBe(
        `Claim type '${code}' cannot be exported as a CMS-1500. These claims are billed on ${form}.`
      );
    });

    test('ignores codes from other systems', () => {
      const claim = claimWithType({ coding: [{ system: 'http://example.com/claim-type', code: 'oral' }] });
      expect(getCms1500ClaimTypeError(claim)).toBeUndefined();
    });

    test('finds the claim-type coding regardless of its position', () => {
      const claim = claimWithType({
        coding: [
          { system: 'http://example.com/claim-type', code: 'D' },
          { system: CLAIM_TYPE_SYSTEM, code: 'oral' },
        ],
      });
      expect(getCms1500ClaimTypeError(claim)).toContain("'oral'");
    });
  });
});
