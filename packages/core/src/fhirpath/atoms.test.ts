import { readJson } from '@medplum/definitions';
import { Bundle, Observation } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle, PropertyType } from '../types';
import { LiteralAtom, SymbolAtom } from './atoms';
import { evalFhirPath, parseFhirPath } from './parse';
import { AtomContext } from '../fhirlexer';

let context: AtomContext;

describe('Atoms', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    context = { variables: {} };
  });

  test('LiteralAtom', () => {
    const str = { type: PropertyType.string, value: 'a' };
    const strLiteral = new LiteralAtom(str);
    expect(strLiteral.eval()).toEqual([str]);
    expect(strLiteral.toString()).toEqual("'a'");

    const num = { type: PropertyType.decimal, value: 1 };
    const numLiteral = new LiteralAtom(num);
    expect(numLiteral.eval()).toEqual([num]);
    expect(numLiteral.toString()).toEqual('1');

    const bool = { type: PropertyType.boolean, value: true };
    const boolLiteral = new LiteralAtom(bool);
    expect(boolLiteral.eval()).toEqual([bool]);
    expect(boolLiteral.toString()).toEqual('true');
  });

  test('SymbolAtom', () => {
    const symbol = new SymbolAtom('symbol');
    expect(symbol.toString()).toEqual('symbol');
  });

  test('EmptySetAtom', () => {
    const atom = parseFhirPath('{}');
    expect(atom.eval(context, [])).toEqual([]);
    expect(atom.toString()).toEqual('{}');
  });

  test('ConcatAtom', () => {
    expect(evalFhirPath('{} & {}', [])).toEqual([]);
    expect(evalFhirPath('x & y', [])).toEqual([]);
  });

  test('UnionAtom', () => {
    expect(evalFhirPath('{} | {}', [])).toEqual([]);
    expect(evalFhirPath('x | y', [])).toEqual([]);
  });

  test.each([
    ['true implies true', true],
    ['true implies false', false],
    ['true implies null', undefined],
    ['false implies true', true],
    ['false implies false', true],
    ['false implies null', true],
    ['null implies true', true],
    ['null implies false', undefined],
    ['null implies null', undefined],
  ])('ImpliesAtom: %s to equal %s', (input: any, expected: any) => {
    expect(evalFhirPath(input, [])).toEqual([expected]);
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
