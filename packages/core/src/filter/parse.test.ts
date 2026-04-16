// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert';
import { Operator } from '../search/search';
import { parseFilterParameter } from './parse';
import { FhirFilterComparison, FhirFilterConnective, FhirFilterNegation } from './types';

describe('_filter Parameter parser', () => {
  test.each<[string, string, FhirFilterComparison]>([
    ['simple comparison', 'name co "pet"', { path: 'name', operator: Operator.CONTAINS, value: 'pet' }],
    [
      'system and code',
      'code eq http://loinc.org|1234-5',
      { path: 'code', operator: Operator.EXACT, value: 'http://loinc.org|1234-5' },
    ],
    [
      'identifier search',
      'performer identifier https://example.com/1234',
      { path: 'performer', operator: Operator.IDENTIFIER, value: 'https://example.com/1234' },
    ],
    ['Starts with', 'name sw ali', { path: 'name', operator: Operator.STARTS_WITH, value: 'ali' }],
    [
      'Raw token with leading digits',
      'identifier eq 123_abc',
      { path: 'identifier', operator: Operator.EXACT, value: '123_abc' },
    ],
    [
      'Reverse chained search',
      "_has:Observation:patient:_id ne ''",
      { path: '_has:Observation:patient:_id', operator: Operator.NOT_EQUALS, value: '' },
    ],
  ])('%s', (_, filter, expected) => {
    const result = parseFilterParameter(filter);
    assert(result instanceof FhirFilterComparison);
    expect(result).toMatchObject(expected);
  });

  test('Negation', () => {
    const result = parseFilterParameter('not (name co "pet")');
    expect(result).toBeInstanceOf(FhirFilterNegation);

    const negation = result as FhirFilterNegation;
    expect(negation.child).toBeInstanceOf(FhirFilterComparison);

    const comp = negation.child as FhirFilterComparison;
    expect(comp.path).toBe('name');
    expect(comp.operator).toBe(Operator.CONTAINS);
    expect(comp.value).toBe('pet');
  });

  test('And connective', () => {
    const result = parseFilterParameter('given eq "peter" and birthdate ge 2014-10-10');
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.keyword).toBe('and');
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe(Operator.EXACT);
    expect(left.value).toBe('peter');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('birthdate');
    expect(right.operator).toBe(Operator.GREATER_THAN_OR_EQUALS);
    expect(right.value).toBe('2014-10-10');
  });

  test('Or connective', () => {
    const result = parseFilterParameter('given eq "peter" or birthdate ge 2014-10-10');
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.keyword).toBe('or');
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe(Operator.EXACT);
    expect(left.value).toBe('peter');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('birthdate');
    expect(right.operator).toBe(Operator.GREATER_THAN_OR_EQUALS);
    expect(right.value).toBe('2014-10-10');
  });

  test('Top level parentheses', () => {
    const result = parseFilterParameter('(given ne "alice" and given ne "bob")');
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe(Operator.NOT_EQUALS);
    expect(left.value).toBe('alice');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('given');
    expect(right.operator).toBe(Operator.NOT_EQUALS);
    expect(right.value).toBe('bob');
  });

  test('Nested expressions', () => {
    const result = parseFilterParameter('given eq "alice" or (given eq "peter" and birthdate ge 2014-10-10)');
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective1 = result as FhirFilterConnective;
    expect(connective1.keyword).toBe('or');
    expect(connective1.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective1.right).toBeInstanceOf(FhirFilterConnective);

    const first = connective1.left as FhirFilterComparison;
    expect(first.path).toBe('given');
    expect(first.operator).toBe(Operator.EXACT);
    expect(first.value).toBe('alice');

    const connective2 = connective1.right as FhirFilterConnective;
    expect(connective2.keyword).toBe('and');
    expect(connective2.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective2.right).toBeInstanceOf(FhirFilterComparison);

    const second = connective2.left as FhirFilterComparison;
    expect(second.path).toBe('given');
    expect(second.operator).toBe(Operator.EXACT);
    expect(second.value).toBe('peter');

    const third = connective2.right as FhirFilterComparison;
    expect(third.path).toBe('birthdate');
    expect(third.operator).toBe(Operator.GREATER_THAN_OR_EQUALS);
    expect(third.value).toBe('2014-10-10');
  });

  test('Nested connectives', () => {
    const result = parseFilterParameter('(status eq preliminary and code eq 123) or (status eq final and code eq 456)');
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective1 = result as FhirFilterConnective;
    expect(connective1.keyword).toBe('or');
    expect(connective1.left).toBeInstanceOf(FhirFilterConnective);
    expect(connective1.right).toBeInstanceOf(FhirFilterConnective);

    const connective2 = connective1.left as FhirFilterConnective;
    expect(connective2.keyword).toBe('and');
    expect(connective2.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective2.right).toBeInstanceOf(FhirFilterComparison);

    const connective3 = connective1.right as FhirFilterConnective;
    expect(connective3.keyword).toBe('and');
    expect(connective3.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective3.right).toBeInstanceOf(FhirFilterComparison);

    const first = connective2.left as FhirFilterComparison;
    expect(first.path).toBe('status');
    expect(first.operator).toBe(Operator.EXACT);
    expect(first.value).toBe('preliminary');

    const second = connective2.right as FhirFilterComparison;
    expect(second.path).toBe('code');
    expect(second.operator).toBe(Operator.EXACT);
    expect(second.value).toBe('123');

    const third = connective3.left as FhirFilterComparison;
    expect(third.path).toBe('status');
    expect(third.operator).toBe(Operator.EXACT);
    expect(third.value).toBe('final');

    const fourth = connective3.right as FhirFilterComparison;
    expect(fourth.path).toBe('code');
    expect(fourth.operator).toBe(Operator.EXACT);
    expect(fourth.value).toBe('456');
  });

  test('Nested negation', () => {
    const result = parseFilterParameter(
      '(status eq preliminary and code eq 123) or (not (status eq preliminary) and code eq 456)'
    );
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective1 = result as FhirFilterConnective;
    expect(connective1.keyword).toBe('or');
    expect(connective1.left).toBeInstanceOf(FhirFilterConnective);
    expect(connective1.right).toBeInstanceOf(FhirFilterConnective);

    const connective2 = connective1.left as FhirFilterConnective;
    expect(connective2.keyword).toBe('and');
    expect(connective2.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective2.right).toBeInstanceOf(FhirFilterComparison);

    const connective3 = connective1.right as FhirFilterConnective;
    expect(connective3.keyword).toBe('and');
    expect(connective3.left).toBeInstanceOf(FhirFilterNegation);
    expect(connective3.right).toBeInstanceOf(FhirFilterComparison);

    const first = connective2.left as FhirFilterComparison;
    expect(first.path).toBe('status');
    expect(first.operator).toBe(Operator.EXACT);
    expect(first.value).toBe('preliminary');

    const second = connective2.right as FhirFilterComparison;
    expect(second.path).toBe('code');
    expect(second.operator).toBe(Operator.EXACT);
    expect(second.value).toBe('123');

    const negation = connective3.left as FhirFilterNegation;
    const third = negation.child as FhirFilterComparison;
    expect(third.path).toBe('status');
    expect(third.operator).toBe(Operator.EXACT);
    expect(third.value).toBe('preliminary');

    const fourth = connective3.right as FhirFilterComparison;
    expect(fourth.path).toBe('code');
    expect(fourth.operator).toBe(Operator.EXACT);
    expect(fourth.value).toBe('456');
  });

  test('Unsupported search operator', () => {
    expect(() => parseFilterParameter('name ew ali')).toThrow('Invalid operator: ew');
  });
});
