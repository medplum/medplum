import { readJson } from '@medplum/definitions';
import { Bundle, Observation } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle, PropertyType } from '../types';
import { LiteralAtom } from './atoms';
import { evalFhirPath } from './parse';

describe('Atoms', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('LiteralAtom', () => {
    const a = { type: PropertyType.string, value: 'a' };
    expect(new LiteralAtom(a).eval()).toEqual([a]);
  });

  test('ConcatAtom', () => {
    expect(evalFhirPath('{} & {}', [])).toEqual([]);
    expect(evalFhirPath('x & y', [])).toEqual([]);
  });

  test('UnionAtom', () => {
    expect(evalFhirPath('{} | {}', [])).toEqual([]);
    expect(evalFhirPath('x | y', [])).toEqual([]);
  });

  test('AsAtom', () => {
    const obs1: Observation = {
      resourceType: 'Observation',
      valueQuantity: { value: 100, unit: 'mg' },
    };

    const obs2: Observation = {
      resourceType: 'Observation',
      valueCodeableConcept: { coding: [{ code: 'xyz' }] },
    };

    expect(evalFhirPath('value as Quantity', obs1)).toEqual([obs1.valueQuantity]);
    expect(evalFhirPath('value as Quantity', obs2)).toEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs1)).toEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs2)).toEqual([obs2.valueCodeableConcept]);
  });
});
