// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LOINC, SNOMED } from '@medplum/core';
import { OID_SNOMED_CT_CODE_SYSTEM } from './oids';
import { EnumMapper, mapCodeableConceptToCcdaCode } from './systems';

describe('EnumMapper', () => {
  const mapper = new EnumMapper<string, string>('SNOMED CT', OID_SNOMED_CT_CODE_SYSTEM, SNOMED, [
    { ccdaValue: 'c0', fhirValue: 'f0', displayName: 'd0' },
    { ccdaValue: 'c1', fhirValue: 'f1', displayName: 'd1' },
    { ccdaValue: 'c2', fhirValue: 'f2', displayName: 'd2' },
  ]);

  test('getEntryByFhir', () => {
    expect(mapper.getEntryByFhir('f0')?.ccdaValue).toBe('c0');
    expect(mapper.getEntryByFhir('c0')).toBeUndefined();
  });

  test('mapCcdaToFhir', () => {
    expect(mapper.mapCcdaToFhir('c0')).toBe('f0');
    expect(mapper.mapCcdaToFhir('f0')).toBeUndefined();
    expect(mapper.mapCcdaToFhir('')).toBeUndefined();
  });

  test('mapCcdaToFhirWithDefault', () => {
    expect(mapper.mapCcdaToFhirWithDefault('c0', 'f1')).toBe('f0');
    expect(mapper.mapCcdaToFhirWithDefault('c3', 'f1')).toBe('f1');
  });

  test('mapFhirToCcdaWithDefault', () => {
    expect(mapper.mapFhirToCcdaWithDefault('f0', 'c1')).toBe('c0');
    expect(mapper.mapFhirToCcdaWithDefault('f3', 'c1')).toBe('c1');
  });

  test('mapCcdaToFhirCodeableConcept', () => {
    const r1 = mapper.mapCcdaToFhirCodeableConcept('c0');
    expect(r1?.coding?.[0]?.code).toBe('f0');
    expect(r1?.coding?.[0]?.system).toBe(SNOMED);
    expect(r1?.text).toBe('d0');

    const r2 = mapper.mapCcdaToFhirCodeableConcept('c3');
    expect(r2).toBeUndefined();
  });

  test('mapFhirToCcda', () => {
    expect(mapper.mapFhirToCcda('f0')).toBe('c0');
    expect(mapper.mapFhirToCcda('c0')).toBeUndefined();
    expect(mapper.mapFhirToCcda('')).toBeUndefined();
  });

  test('mapFhirToCcdaCode', () => {
    const r1 = mapper.mapFhirToCcdaCode('f0');
    expect(r1?.['@_code']).toBe('c0');
    expect(r1?.['@_codeSystem']).toBe(OID_SNOMED_CT_CODE_SYSTEM);
    expect(r1?.['@_codeSystemName']).toBe('SNOMED CT');
    expect(r1?.['@_displayName']).toBe('d0');

    const r2 = mapper.mapFhirToCcdaCode('c3');
    expect(r2).toBeUndefined();

    const r3 = mapper.mapFhirToCcdaCode('');
    expect(r3).toBeUndefined();
  });

  test('mapCodeableConceptToCcdaCode', () => {
    const r1 = mapCodeableConceptToCcdaCode({ text: 'test' });
    expect(r1).toBeUndefined();

    const r2 = mapCodeableConceptToCcdaCode({ coding: [{ code: 'foo' }] });
    expect(r2).toMatchObject({ '@_code': 'foo' });

    const r3 = mapCodeableConceptToCcdaCode({
      coding: [
        { system: SNOMED, code: 'foo', display: 'Foo' },
        { system: LOINC, code: 'bar', display: 'Bar' },
      ],
    });
    expect(r3).toMatchObject({
      '@_code': 'foo',
      '@_codeSystem': '2.16.840.1.113883.6.96',
      '@_codeSystemName': 'SNOMED CT',
      '@_displayName': 'Foo',
      translation: [
        {
          '@_code': 'bar',
          '@_codeSystem': '2.16.840.1.113883.6.1',
          '@_codeSystemName': 'LOINC',
          '@_displayName': 'Bar',
        },
      ],
    });

    const r4 = mapCodeableConceptToCcdaCode({ coding: [{ code: 'foo', system: 'urn:oid:9.9.9.9' }] });
    expect(r4).toMatchObject({ '@_code': 'foo', '@_codeSystem': '9.9.9.9' });
  });
});
