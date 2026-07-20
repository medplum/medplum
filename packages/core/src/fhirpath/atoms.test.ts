// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle, Observation } from '@medplum/fhirtypes';
import type { AtomContext } from '../fhirlexer/parse';
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
    expect(strLiteral.eval()).toStrictEqual([str]);
    expect(strLiteral.toString()).toStrictEqual("'a'");

    const num = { type: PropertyType.decimal, value: 1 };
    const numLiteral = new LiteralAtom(num);
    expect(numLiteral.eval()).toStrictEqual([num]);
    expect(numLiteral.toString()).toStrictEqual('1');

    const bool = { type: PropertyType.boolean, value: true };
    const boolLiteral = new LiteralAtom(bool);
    expect(boolLiteral.eval()).toStrictEqual([bool]);
    expect(boolLiteral.toString()).toStrictEqual('true');
  });

  test('SymbolAtom', () => {
    const name = 'symbol';
    const symbol = new SymbolAtom(name);
    expect(symbol.name).toStrictEqual(name);
    expect(symbol.toString()).toStrictEqual(name);
  });

  test('EmptySetAtom', () => {
    const atom = parseFhirPath('{}');
    expect(atom.eval(context, [])).toStrictEqual([]);
    expect(atom.toString()).toStrictEqual('{}');
  });

  test('ConcatAtom', () => {
    expect(evalFhirPath('{} & {}', [])).toStrictEqual(['']);
    expect(evalFhirPath('x & y', [])).toStrictEqual(['']);
  });

  test('UnionAtom', () => {
    expect(evalFhirPath('{} | {}', [])).toStrictEqual([]);
    expect(evalFhirPath('x | y', [])).toStrictEqual([]);
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
    expect(evalFhirPath(input, [])).toStrictEqual(expected);
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
    expect(evalFhirPath(input, [])).toStrictEqual(expected);
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
    expect(evalFhirPath(input, [])).toStrictEqual(expected);
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
    expect(evalFhirPath(input, [])).toStrictEqual(expected);
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
      component: [
        { code: { text: 'def' }, valueQuantity: { value: 12, unit: 'Hz' } },
        { code: { text: 'ghi' }, valueQuantity: { value: 29, unit: 'Bq' } },
      ],
    };

    // Filters exclusively on type
    expect(evalFhirPath('value as Quantity', obs1)).toStrictEqual([obs1.valueQuantity]);
    // A single item of the wrong type returns empty (not an error) per the FHIRPath spec
    expect(evalFhirPath('value as Quantity', obs2)).toStrictEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs1)).toStrictEqual([]);
    expect(evalFhirPath('value as CodeableConcept', obs2)).toStrictEqual([obs2.valueCodeableConcept]);

    // Empty results
    expect(evalFhirPath('component.value as Quantity', obs1)).toStrictEqual([]);

    // Qualified type identifiers (e.g. `FHIR.Quantity`) resolve the same way
    // See: https://hl7.org/fhirpath/N1/#:~:text=in%20a%20model.-,Type%20specifiers%20can%20have%20qualifiers%2C%20e.g.%20FHIR.Patient%2C%20where%20the%20qualifier%20is%20the%20name%20of%20the%20model.,-Patient.contained.all
    expect(evalFhirPath('value as FHIR.Quantity', obs1)).toStrictEqual([obs1.valueQuantity]);

    // A right operand that does not resolve to a valid type identifier throws,
    // per https://hl7.org/fhirpath/N1/#astype-specifier
    expect(() => evalFhirPath('value as 5', obs1)).toThrow('Expected a valid type identifier');

    // Multiple results still throw, since `as` requires a singleton collection
    expect(() => evalFhirPath('component.value as Quantity', obs2)).toThrow('Expected singleton');
  });
});
