import { EnumMapper } from './systems';

describe('EnumMapper', () => {
  const mapper = new EnumMapper<string, string>('systemName', 'ccdaSystemOid', 'fhirSystemUrl', [
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
    expect(r1?.coding?.[0]?.system).toBe('fhirSystemUrl');
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
    expect(r1?.['@_codeSystem']).toBe('ccdaSystemOid');
    expect(r1?.['@_codeSystemName']).toBe('systemName');
    expect(r1?.['@_displayName']).toBe('d0');

    const r2 = mapper.mapFhirToCcdaCode('c3');
    expect(r2).toBeUndefined();

    const r3 = mapper.mapFhirToCcdaCode('');
    expect(r3).toBeUndefined();
  });
});
