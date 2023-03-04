import { parseFilterParameter } from './parse';
import { FhirFilterComparison, FhirFilterConnective, FhirFilterNegation } from './types';

describe('_filter Paramter parser', () => {
  test('Simple comparison', () => {
    const result = parseFilterParameter('name co "pet"');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterComparison);

    const comp = result as FhirFilterComparison;
    expect(comp.path).toBe('name');
    expect(comp.operator).toBe('co');
    expect(comp.value).toBe('pet');
  });

  test('Negation', () => {
    const result = parseFilterParameter('not name co "pet"');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterNegation);

    const negation = result as FhirFilterNegation;
    expect(negation.child).toBeInstanceOf(FhirFilterComparison);

    const comp = negation.child as FhirFilterComparison;
    expect(comp.path).toBe('name');
    expect(comp.operator).toBe('co');
    expect(comp.value).toBe('pet');
  });

  test('And connective', () => {
    const result = parseFilterParameter('given eq "peter" and birthdate ge 2014-10-10');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.keyword).toBe('and');
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe('eq');
    expect(left.value).toBe('peter');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('birthdate');
    expect(right.operator).toBe('ge');
    expect(right.value).toBe('2014-10-10');
  });

  test('Or connective', () => {
    const result = parseFilterParameter('given eq "peter" or birthdate ge 2014-10-10');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.keyword).toBe('or');
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe('eq');
    expect(left.value).toBe('peter');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('birthdate');
    expect(right.operator).toBe('ge');
    expect(right.value).toBe('2014-10-10');
  });

  test('Top level parentheses', () => {
    const result = parseFilterParameter('(given ne "alice" and given ne "bob")');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective = result as FhirFilterConnective;
    expect(connective.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective.right).toBeInstanceOf(FhirFilterComparison);

    const left = connective.left as FhirFilterComparison;
    expect(left.path).toBe('given');
    expect(left.operator).toBe('ne');
    expect(left.value).toBe('alice');

    const right = connective.right as FhirFilterComparison;
    expect(right.path).toBe('given');
    expect(right.operator).toBe('ne');
    expect(right.value).toBe('bob');
  });

  test('Nested expressions', () => {
    const result = parseFilterParameter('given eq "alice" or (given eq "peter" and birthdate ge 2014-10-10)');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterConnective);

    const connective1 = result as FhirFilterConnective;
    expect(connective1.keyword).toBe('or');
    expect(connective1.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective1.right).toBeInstanceOf(FhirFilterConnective);

    const first = connective1.left as FhirFilterComparison;
    expect(first.path).toBe('given');
    expect(first.operator).toBe('eq');
    expect(first.value).toBe('alice');

    const connective2 = connective1.right as FhirFilterConnective;
    expect(connective2.keyword).toBe('and');
    expect(connective2.left).toBeInstanceOf(FhirFilterComparison);
    expect(connective2.right).toBeInstanceOf(FhirFilterComparison);

    const second = connective2.left as FhirFilterComparison;
    expect(second.path).toBe('given');
    expect(second.operator).toBe('eq');
    expect(second.value).toBe('peter');

    const third = connective2.right as FhirFilterComparison;
    expect(third.path).toBe('birthdate');
    expect(third.operator).toBe('ge');
    expect(third.value).toBe('2014-10-10');
  });

  test('Observation with system and code', () => {
    const result = parseFilterParameter('code eq http://loinc.org|1234-5');
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FhirFilterComparison);

    const comp = result as FhirFilterComparison;
    expect(comp.path).toBe('code');
    expect(comp.operator).toBe('eq');
    expect(comp.value).toBe('http://loinc.org|1234-5');
  });
});
