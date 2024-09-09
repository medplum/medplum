import { readJson } from '@medplum/definitions';
import { Bundle, Observation } from '@medplum/fhirtypes';
import { AtomContext } from '../fhirlexer/parse';
import { PropertyType } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { LiteralAtom, SymbolAtom } from './atoms';
import { evalFhirPath, parseFhirPath } from './parse';

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
    ['true = true', [true]],
    ['true = false', [false]],
    ['true = {}', []],
    ['false = true', [false]],
    ['false = false', [true]],
    ['false = {}', []],
    ['{} = true', []],
    ['{} = false', []],
    ['{} = {}', []],
  ])('EqualsAtom: %s to equal %s', (input: any, expected: any) => {
    expect(evalFhirPath(input, [])).toEqual(expected);
  });

  test.each([
    ['true != true', [false]],
    ['true != false', [true]],
    ['true != {}', []],
    ['false != true', [true]],
    ['false != false', [false]],
    ['false != {}', []],
    ['{} != true', []],
    ['{} != false', []],
    ['{} != {}', []],
  ])('NotEqualsAtom: %s to equal %s', (input: any, expected: any) => {
    expect(evalFhirPath(input, [])).toEqual(expected);
  });

  test.each([
    ['true or true', [true]],
    ['true or false', [true]],
    ['true or {}', [true]],
    ['false or true', [true]],
    ['false or false', [false]],
    ['false or {}', []],
    ['{} or true', [true]],
    ['{} or false', []],
    ['{} or {}', []],
  ])('OrAtom: %s to equal %s', (input: any, expected: any) => {
    expect(evalFhirPath(input, [])).toEqual(expected);
  });

  test.each([
    ['true implies true', [true]],
    ['true implies false', [false]],
    ['true implies {}', []],
    ['false implies true', [true]],
    ['false implies false', [true]],
    ['false implies {}', [true]],
    ['{} implies true', [true]],
    ['{} implies false', []],
    ['{} implies {}', []],
  ])('ImpliesAtom: %s to equal %s', (input: any, expected: any) => {
    expect(evalFhirPath(input, [])).toEqual(expected);
  });

  test('AsAtom', () => {
    const obs1: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'abc' },
      valueQuantity: { value: 100, unit: 'mg' },
    };

    const obs2: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'abc' },
      valueCodeableConcept: { coding: [{ code: 'xyz' }] },
    };

    expect(evalFhirPath('value as Quantity', obs1)).toEqual([obs1.valueQuantity]);
    expect(evalFhirPath('value as Quantity', obs2)).toEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs1)).toEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs2)).toEqual([obs2.valueCodeableConcept]);
  });
});
