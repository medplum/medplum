import { Patient } from '@medplum/fhirtypes';
import { Atom } from '../fhirlexer';
import { PropertyType, TypedValue } from '../types';
import { createReference, getReferenceString } from '../utils';
import { LiteralAtom } from './atoms';
import { FhirPathFunction, functions } from './functions';
import { booleanToTypedValue, toTypedValue } from './utils';

const isEven: Atom = {
  eval: (num: TypedValue[]) => booleanToTypedValue((num[0].value as number) % 2 === 0),
};

const TYPED_TRUE = toTypedValue(true);
const TYPED_FALSE = toTypedValue(false);
const TYPED_0 = toTypedValue(0);
const TYPED_1 = toTypedValue(1);
const TYPED_2 = toTypedValue(2);
const TYPED_3 = toTypedValue(3);
const TYPED_4 = toTypedValue(4);
const TYPED_A = toTypedValue('a');
const TYPED_B = toTypedValue('b');
const TYPED_X = toTypedValue('x');
const TYPED_Y = toTypedValue('y');
const TYPED_Z = toTypedValue('z');
const TYPED_APPLE = toTypedValue('apple');
const TYPED_XYZ = toTypedValue('xyz');

const LITERAL_TRUE = new LiteralAtom(TYPED_TRUE);
const LITERAL_FALSE = new LiteralAtom(TYPED_FALSE);
const LITERAL_X = new LiteralAtom(TYPED_X);
const LITERAL_Y = new LiteralAtom(TYPED_Y);

describe('FHIRPath functions', () => {
  // 5.1 Existence

  test('empty', () => {
    expect(functions.empty([])).toEqual([TYPED_TRUE]);
    expect(functions.empty([TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.empty([TYPED_1, TYPED_2])).toEqual([TYPED_FALSE]);
  });

  test('exists', () => {
    expect(functions.exists([])).toEqual([TYPED_FALSE]);
    expect(functions.exists([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.exists([TYPED_1, TYPED_2])).toEqual([TYPED_TRUE]);
    expect(functions.exists([], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.exists([TYPED_1], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.exists([TYPED_1, TYPED_2], isEven)).toEqual([TYPED_TRUE]);
  });

  test('all', () => {
    expect(functions.all([], isEven)).toEqual([TYPED_TRUE]);
    expect(functions.all([TYPED_1], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.all([TYPED_2], isEven)).toEqual([TYPED_TRUE]);
    expect(functions.all([TYPED_1, TYPED_2], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.all([TYPED_2, TYPED_4], isEven)).toEqual([TYPED_TRUE]);
  });

  test('allTrue', () => {
    expect(functions.allTrue([])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue([TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allTrue([TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allTrue([TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue([TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
  });

  test('anyTrue', () => {
    expect(functions.anyTrue([])).toEqual([TYPED_FALSE]);
    expect(functions.anyTrue([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue([TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.anyTrue([TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue([TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue([TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
  });

  test('allFalse', () => {
    expect(functions.allFalse([])).toEqual([TYPED_TRUE]);
    expect(functions.allFalse([TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.allFalse([TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse([TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse([TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
  });

  test('anyFalse', () => {
    expect(functions.anyFalse([])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse([TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyFalse([TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyFalse([TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse([TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
  });

  test('count', () => {
    expect(functions.count([])).toEqual([TYPED_0]);
    expect(functions.count([TYPED_1])).toEqual([TYPED_1]);
    expect(functions.count([TYPED_1, TYPED_2])).toEqual([TYPED_2]);
  });

  test('distinct', () => {
    expect(functions.distinct([])).toEqual([]);
    expect(functions.distinct([TYPED_1])).toEqual([TYPED_1]);
    expect(functions.distinct([TYPED_1, TYPED_2])).toEqual([TYPED_1, TYPED_2]);
    expect(functions.distinct([TYPED_1, TYPED_1])).toEqual([TYPED_1]);
    expect(functions.distinct([TYPED_A])).toEqual([TYPED_A]);
    expect(functions.distinct([TYPED_A, TYPED_B])).toEqual([TYPED_A, TYPED_B]);
    expect(functions.distinct([TYPED_A, TYPED_A])).toEqual([TYPED_A]);
  });

  test('isDistinct', () => {
    expect(functions.isDistinct([])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct([TYPED_1, TYPED_2])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct([TYPED_1, TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.isDistinct([TYPED_A])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct([TYPED_A, TYPED_B])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct([TYPED_A, TYPED_A])).toEqual([TYPED_FALSE]);
  });

  // 5.2. Filtering and projection

  test('where', () => {
    expect(functions.where([], isEven)).toEqual([]);
    expect(functions.where([TYPED_1], isEven)).toEqual([]);
    expect(functions.where([TYPED_1, TYPED_2], isEven)).toEqual([TYPED_2]);
    expect(functions.where([TYPED_1, TYPED_2, TYPED_3, TYPED_4], isEven)).toEqual([TYPED_2, TYPED_4]);
  });

  // 5.3 Subsetting

  test('single', () => {
    expect(functions.single([])).toEqual([]);
    expect(functions.single([TYPED_1])).toEqual([TYPED_1]);
    expect(() => functions.single([TYPED_1, TYPED_2])).toThrowError('Expected input length one for single()');
  });

  test('first', () => {
    expect(functions.first([])).toEqual([]);
    expect(functions.first([TYPED_1])).toEqual([TYPED_1]);
    expect(functions.first([TYPED_1, TYPED_2])).toEqual([TYPED_1]);
    expect(functions.first([TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_1]);
    expect(functions.first([TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_1]);
  });

  test('last', () => {
    expect(functions.last([])).toEqual([]);
    expect(functions.last([TYPED_1])).toEqual([TYPED_1]);
    expect(functions.last([TYPED_1, TYPED_2])).toEqual([TYPED_2]);
    expect(functions.last([TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_3]);
    expect(functions.last([TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_4]);
  });

  test('tail', () => {
    expect(functions.tail([])).toEqual([]);
    expect(functions.tail([TYPED_1])).toEqual([]);
    expect(functions.tail([TYPED_1, TYPED_2])).toEqual([TYPED_2]);
    expect(functions.tail([TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_2, TYPED_3]);
    expect(functions.tail([TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_2, TYPED_3, TYPED_4]);
  });

  test('skip', () => {
    const nonNumber: Atom = { eval: () => [TYPED_XYZ] };
    expect(() => functions.skip([TYPED_1, TYPED_2, TYPED_3], nonNumber)).toThrowError(
      'Expected a number for skip(num)'
    );

    const num0: Atom = { eval: () => [TYPED_0] };
    expect(functions.skip([], num0)).toEqual([]);
    expect(functions.skip([TYPED_1], num0)).toEqual([TYPED_1]);
    expect(functions.skip([TYPED_1, TYPED_2], num0)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.skip([TYPED_1, TYPED_2, TYPED_3], num0)).toEqual([TYPED_1, TYPED_2, TYPED_3]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.skip([], num1)).toEqual([]);
    expect(functions.skip([TYPED_1], num1)).toEqual([]);
    expect(functions.skip([TYPED_1, TYPED_2], num1)).toEqual([TYPED_2]);
    expect(functions.skip([TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_2, TYPED_3]);

    const num2: Atom = { eval: () => [TYPED_2] };
    expect(functions.skip([], num2)).toEqual([]);
    expect(functions.skip([TYPED_1], num2)).toEqual([]);
    expect(functions.skip([TYPED_1, TYPED_2], num2)).toEqual([]);
    expect(functions.skip([TYPED_1, TYPED_2, TYPED_3], num2)).toEqual([TYPED_3]);
  });

  test('take', () => {
    const nonNumber: Atom = { eval: () => [TYPED_XYZ] };
    expect(() => functions.take([TYPED_1, TYPED_2, TYPED_3], nonNumber)).toThrowError(
      'Expected a number for take(num)'
    );

    const num0: Atom = { eval: () => [TYPED_0] };
    expect(functions.take([], num0)).toEqual([]);
    expect(functions.take([TYPED_1], num0)).toEqual([]);
    expect(functions.take([TYPED_1, TYPED_2], num0)).toEqual([]);
    expect(functions.take([TYPED_1, TYPED_2, TYPED_3], num0)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.take([], num1)).toEqual([]);
    expect(functions.take([TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.take([TYPED_1, TYPED_2], num1)).toEqual([TYPED_1]);
    expect(functions.take([TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1]);

    const num2: Atom = { eval: () => [TYPED_2] };
    expect(functions.take([], num2)).toEqual([]);
    expect(functions.take([TYPED_1], num2)).toEqual([TYPED_1]);
    expect(functions.take([TYPED_1, TYPED_2], num2)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.take([TYPED_1, TYPED_2, TYPED_3], num2)).toEqual([TYPED_1, TYPED_2]);
  });

  test('intersect', () => {
    expect(functions.intersect([], undefined as unknown as Atom)).toEqual([]);
    expect(functions.intersect([], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.intersect([], num1)).toEqual([]);
    expect(functions.intersect([TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.intersect([TYPED_1, TYPED_2], num1)).toEqual([TYPED_1]);
    expect(functions.intersect([TYPED_1, TYPED_1, TYPED_3], num1)).toEqual([TYPED_1]);
  });

  test('exclude', () => {
    expect(functions.exclude([], undefined as unknown as Atom)).toEqual([]);
    expect(functions.exclude([], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.exclude([], num1)).toEqual([]);
    expect(functions.exclude([TYPED_1], num1)).toEqual([]);
    expect(functions.exclude([TYPED_1, TYPED_2], num1)).toEqual([TYPED_2]);
    expect(functions.exclude([TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_2, TYPED_3]);
  });

  // 5.4. Combining

  test('union', () => {
    expect(functions.union([], undefined as unknown as Atom)).toEqual([]);
    expect(functions.union([], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.union([], num1)).toEqual([TYPED_1]);
    expect(functions.union([TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.union([TYPED_1, TYPED_2], num1)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.union([TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1, TYPED_2, TYPED_3]);
  });

  test('combine', () => {
    expect(functions.combine([], undefined as unknown as Atom)).toEqual([]);
    expect(functions.combine([], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.combine([], num1)).toEqual([TYPED_1]);
    expect(functions.combine([TYPED_1], num1)).toEqual([TYPED_1, TYPED_1]);
    expect(functions.combine([TYPED_1, TYPED_2], num1)).toEqual([TYPED_1, TYPED_2, TYPED_1]);
    expect(functions.combine([TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1, TYPED_2, TYPED_3, TYPED_1]);
  });

  // 5.5. Conversion

  test('iif', () => {
    expect(functions.iif([], LITERAL_TRUE, LITERAL_X)).toEqual([TYPED_X]);
    expect(functions.iif([], LITERAL_FALSE, LITERAL_X)).toEqual([]);
    expect(functions.iif([], LITERAL_TRUE, LITERAL_X, LITERAL_Y)).toEqual([TYPED_X]);
    expect(functions.iif([], LITERAL_FALSE, LITERAL_X, LITERAL_Y)).toEqual([TYPED_Y]);
  });

  test('toBoolean', () => {
    expect(functions.toBoolean([])).toEqual([]);
    expect(functions.toBoolean([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.toBoolean([TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.toBoolean([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.toBoolean([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toBoolean([toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.toBoolean([toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.toBoolean([toTypedValue('xyz')])).toEqual([]);
    expect(functions.toBoolean([toTypedValue({})])).toEqual([]);
  });

  test('convertsToBoolean', () => {
    expect(functions.convertsToBoolean([])).toEqual([]);
    expect(functions.convertsToBoolean([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToBoolean([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToBoolean([toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean([toTypedValue('false')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean([toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToBoolean([toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toInteger', () => {
    expect(functions.toInteger([])).toEqual([]);
    expect(functions.toInteger([TYPED_TRUE])).toEqual([TYPED_1]);
    expect(functions.toInteger([TYPED_FALSE])).toEqual([TYPED_0]);
    expect(functions.toInteger([TYPED_0])).toEqual([TYPED_0]);
    expect(functions.toInteger([TYPED_1])).toEqual([TYPED_1]);
    expect(() => functions.toInteger([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toInteger([toTypedValue('1')])).toEqual([TYPED_1]);
    expect(functions.toInteger([toTypedValue('true')])).toEqual([]);
    expect(functions.toInteger([toTypedValue('false')])).toEqual([]);
    expect(functions.toInteger([toTypedValue('xyz')])).toEqual([]);
    expect(functions.toInteger([toTypedValue({})])).toEqual([]);
  });

  test('convertsToInteger', () => {
    expect(functions.convertsToInteger([])).toEqual([]);
    expect(functions.convertsToInteger([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger([TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToInteger([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToInteger([toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger([toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger([toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger([toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger([toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toDate', () => {
    expect(functions.toDate([])).toEqual([]);
    expect(() => functions.toDate([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDate([toTypedValue('2020-01-01')])).toEqual([{ type: PropertyType.date, value: '2020-01-01' }]);
    expect(functions.toDate([TYPED_1])).toEqual([]);
    expect(functions.toDate([TYPED_TRUE])).toEqual([]);
  });

  test('convertsToDate', () => {
    expect(functions.convertsToDate([])).toEqual([]);
    expect(() => functions.convertsToDate([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDate([toTypedValue('2020-01-01')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDate([TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDate([TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  test('toDateTime', () => {
    expect(functions.toDateTime([])).toEqual([]);
    expect(() => functions.toDateTime([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDateTime([toTypedValue('2020-01-01')])).toEqual([
      { type: PropertyType.dateTime, value: '2020-01-01' },
    ]);
    expect(functions.toDateTime([toTypedValue('2020-01-01T12:00:00Z')])).toEqual([
      { type: PropertyType.dateTime, value: '2020-01-01T12:00:00.000Z' },
    ]);
    expect(functions.toDateTime([TYPED_1])).toEqual([]);
    expect(functions.toDateTime([TYPED_TRUE])).toEqual([]);
  });

  test('convertsToDateTime', () => {
    expect(functions.convertsToDateTime([])).toEqual([]);
    expect(() => functions.convertsToDateTime([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDateTime([toTypedValue('2020-01-01')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDateTime([toTypedValue('2020-01-01T12:00:00Z')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDateTime([TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDateTime([TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  test('toDecimal', () => {
    expect(functions.toDecimal([])).toEqual([]);
    expect(functions.toDecimal([TYPED_TRUE])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(functions.toDecimal([TYPED_FALSE])).toEqual([{ type: PropertyType.decimal, value: 0 }]);
    expect(functions.toDecimal([TYPED_0])).toEqual([{ type: PropertyType.decimal, value: 0 }]);
    expect(functions.toDecimal([TYPED_1])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(() => functions.toDecimal([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDecimal([toTypedValue('1')])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(functions.toDecimal([toTypedValue('true')])).toEqual([]);
    expect(functions.toDecimal([toTypedValue('false')])).toEqual([]);
    expect(functions.toDecimal([toTypedValue('xyz')])).toEqual([]);
    expect(functions.toDecimal([toTypedValue({})])).toEqual([]);
  });

  test('convertsToDecimal', () => {
    expect(functions.convertsToDecimal([])).toEqual([]);
    expect(functions.convertsToDecimal([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal([TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToDecimal([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDecimal([toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal([toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal([toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal([toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal([toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toQuantity', () => {
    expect(functions.toQuantity([])).toEqual([]);
    expect(functions.toQuantity([toTypedValue({ value: 123, unit: 'mg' })])).toEqual([
      toTypedValue({ value: 123, unit: 'mg' }),
    ]);
    expect(functions.toQuantity([TYPED_TRUE])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(functions.toQuantity([TYPED_FALSE])).toEqual([toTypedValue({ value: 0, unit: '1' })]);
    expect(functions.toQuantity([TYPED_0])).toEqual([toTypedValue({ value: 0, unit: '1' })]);
    expect(functions.toQuantity([TYPED_1])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(() => functions.toQuantity([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toQuantity([toTypedValue('1')])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(functions.toQuantity([toTypedValue('true')])).toEqual([]);
    expect(functions.toQuantity([toTypedValue('false')])).toEqual([]);
    expect(functions.toQuantity([toTypedValue('xyz')])).toEqual([]);
    expect(functions.toQuantity([toTypedValue({})])).toEqual([]);
  });

  test('convertsToQuantity', () => {
    expect(functions.convertsToQuantity([])).toEqual([]);
    expect(functions.convertsToQuantity([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity([TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToQuantity([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToQuantity([toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity([toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity([toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity([toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity([toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toString', () => {
    const toString = functions.toString as unknown as FhirPathFunction;
    expect(toString([])).toEqual([]);
    expect(() => toString([null as unknown as TypedValue])).toThrow();
    expect(() => toString([undefined as unknown as TypedValue])).toThrow();
    expect(() => toString([TYPED_1, TYPED_2])).toThrow();
    expect(toString([TYPED_TRUE])).toEqual([toTypedValue('true')]);
    expect(toString([TYPED_FALSE])).toEqual([toTypedValue('false')]);
    expect(toString([TYPED_0])).toEqual([toTypedValue('0')]);
    expect(toString([TYPED_1])).toEqual([toTypedValue('1')]);
    expect(toString([toTypedValue(null)])).toEqual([]);
    expect(toString([toTypedValue(undefined)])).toEqual([]);
    expect(toString([toTypedValue('1')])).toEqual([toTypedValue('1')]);
    expect(toString([toTypedValue('true')])).toEqual([toTypedValue('true')]);
    expect(toString([toTypedValue('false')])).toEqual([toTypedValue('false')]);
    expect(toString([toTypedValue('xyz')])).toEqual([toTypedValue('xyz')]);
  });

  test('convertsToString', () => {
    expect(functions.convertsToString([])).toEqual([]);
    expect(() => functions.convertsToString([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToString([TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([toTypedValue('false')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([toTypedValue('xyz')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString([toTypedValue({})])).toEqual([TYPED_TRUE]);
  });

  test('toTime', () => {
    expect(functions.toTime([])).toEqual([]);
    expect(() => functions.toTime([TYPED_1, TYPED_2])).toThrow();
    expect(functions.toTime([toTypedValue('12:00:00')])).toEqual([
      { type: PropertyType.time, value: 'T12:00:00.000Z' },
    ]);
    expect(functions.toTime([toTypedValue('T12:00:00')])).toEqual([
      { type: PropertyType.time, value: 'T12:00:00.000Z' },
    ]);
    expect(functions.toTime([toTypedValue('foo')])).toEqual([]);
    expect(functions.toTime([TYPED_1])).toEqual([]);
    expect(functions.toTime([TYPED_TRUE])).toEqual([]);
  });

  test('convertsToTime', () => {
    expect(functions.convertsToTime([])).toEqual([]);
    expect(() => functions.convertsToTime([TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToTime([toTypedValue('12:00:00')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToTime([toTypedValue('T12:00:00')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToTime([toTypedValue('foo')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToTime([TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToTime([TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  // 5.6. String Manipulation.

  test('indexOf', () => {
    expect(functions.indexOf([TYPED_APPLE], new LiteralAtom(toTypedValue('a')))).toEqual([TYPED_0]);
  });

  test('substring', () => {
    expect(functions.substring([], new LiteralAtom(toTypedValue(0)))).toEqual([]);
    expect(() => functions.substring([TYPED_1], new LiteralAtom(toTypedValue(0)))).toThrow();
    expect(functions.substring([TYPED_APPLE], new LiteralAtom(toTypedValue(-1)))).toEqual([]);
    expect(functions.substring([TYPED_APPLE], new LiteralAtom(toTypedValue(6)))).toEqual([]);
    expect(functions.substring([TYPED_APPLE], new LiteralAtom(toTypedValue(0)))).toEqual([TYPED_APPLE]);
    expect(functions.substring([TYPED_APPLE], new LiteralAtom(toTypedValue(2)))).toEqual([toTypedValue('ple')]);
  });

  test('startsWith', () => {
    expect(functions.startsWith([TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_TRUE]);
    expect(functions.startsWith([TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_FALSE]);
  });

  test('endsWith', () => {
    expect(functions.endsWith([TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_FALSE]);
    expect(functions.endsWith([TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_TRUE]);
  });

  test('contains', () => {
    expect(functions.contains([TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_TRUE]);
    expect(functions.contains([TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_TRUE]);
    expect(functions.contains([TYPED_APPLE], new LiteralAtom(toTypedValue('ppl')))).toEqual([TYPED_TRUE]);
    expect(functions.contains([TYPED_APPLE], new LiteralAtom(toTypedValue('xyz')))).toEqual([TYPED_FALSE]);
  });

  test('upper', () => {
    expect(functions.upper([toTypedValue('apple')])).toEqual([toTypedValue('APPLE')]);
    expect(functions.upper([toTypedValue('Apple')])).toEqual([toTypedValue('APPLE')]);
    expect(functions.upper([toTypedValue('APPLE')])).toEqual([toTypedValue('APPLE')]);
  });

  test('lower', () => {
    expect(functions.lower([TYPED_APPLE])).toEqual([TYPED_APPLE]);
    expect(functions.lower([toTypedValue('Apple')])).toEqual([TYPED_APPLE]);
    expect(functions.lower([toTypedValue('APPLE')])).toEqual([TYPED_APPLE]);
  });

  test('replace', () => {
    expect(
      functions.replace(
        [toTypedValue('banana')],
        new LiteralAtom(toTypedValue('nana')),
        new LiteralAtom(toTypedValue('tman'))
      )
    ).toEqual([toTypedValue('batman')]);
  });

  test('matches', () => {
    expect(functions.matches([TYPED_APPLE], new LiteralAtom(TYPED_A))).toEqual([TYPED_TRUE]);
  });

  test('replaceMatches', () => {
    expect(
      functions.replaceMatches(
        [toTypedValue('banana')],
        new LiteralAtom(toTypedValue('nana')),
        new LiteralAtom(toTypedValue('tman'))
      )
    ).toEqual([toTypedValue('batman')]);
  });

  test('length', () => {
    expect(functions.length([toTypedValue('')])).toEqual([TYPED_0]);
    expect(functions.length([toTypedValue('x')])).toEqual([TYPED_1]);
    expect(functions.length([toTypedValue('xy')])).toEqual([TYPED_2]);
    expect(functions.length([toTypedValue('xyz')])).toEqual([TYPED_3]);
  });

  test('toChars', () => {
    expect(functions.toChars([toTypedValue('')])).toEqual([]);
    expect(functions.toChars([toTypedValue('x')])).toEqual([TYPED_X]);
    expect(functions.toChars([toTypedValue('xy')])).toEqual([TYPED_X, TYPED_Y]);
    expect(functions.toChars([toTypedValue('xyz')])).toEqual([TYPED_X, TYPED_Y, TYPED_Z]);
  });

  // 5.7. Math

  test('abs', () => {
    expect(() => functions.abs([toTypedValue('xyz')])).toThrow();
    expect(functions.abs([])).toEqual([]);
    expect(functions.abs([toTypedValue(-1)])).toEqual([TYPED_1]);
    expect(functions.abs([TYPED_0])).toEqual([TYPED_0]);
    expect(functions.abs([TYPED_1])).toEqual([TYPED_1]);
  });

  // 5.8. Tree navigation

  // 5.9. Utility functions

  test('now', () => {
    expect(functions.now([])[0]).toBeDefined();
  });

  test('timeOfDay', () => {
    expect(functions.timeOfDay([])[0]).toBeDefined();
  });

  test('today', () => {
    expect(functions.today([])[0]).toBeDefined();
  });

  test('between', () => {
    expect(
      functions.between(
        [],
        new LiteralAtom(toTypedValue('2000-01-01')),
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('years'))
      )
    ).toEqual([
      {
        type: PropertyType.Quantity,
        value: { value: 20, unit: 'years' },
      },
    ]);

    expect(() =>
      functions.between(
        [],
        new LiteralAtom(toTypedValue('xxxx-xx-xx')),
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('years'))
      )
    ).toThrow('Invalid start date');

    expect(() =>
      functions.between(
        [],
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('xxxx-xx-xx')),
        new LiteralAtom(toTypedValue('years'))
      )
    ).toThrow('Invalid end date');

    expect(() =>
      functions.between(
        [],
        new LiteralAtom(toTypedValue('2000-01-01')),
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('xxxxx'))
      )
    ).toThrow('Invalid units');
  });

  // Other

  test('resolve', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: '123',
      identifier: [{ system: 'https://example.com', value: '123456' }],
      name: [{ family: 'Simpson', given: ['Homer'] }],
    };

    // Canonical string resolves to patient-like with resourceType and id
    expect(functions.resolve([toTypedValue(getReferenceString(patient))])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);

    // Reference resolves to patient-like with resourceType and id
    expect(functions.resolve([toTypedValue(createReference(patient))])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);

    // Number resolves to nothing
    expect(functions.resolve([toTypedValue(123)])).toEqual([]);

    // Reference with embedded resource resolves to resource
    // We don't normally use embeded resources, except in GraphQL queries
    expect(functions.resolve([toTypedValue({ reference: getReferenceString(patient), resource: patient })])).toEqual([
      toTypedValue(patient),
    ]);

    // Identifier references with a "type" should resolve to patient search reference
    expect(
      functions.resolve([
        { type: PropertyType.Reference, value: { type: 'Patient', identifier: patient.identifier?.[0] } },
      ])
    ).toEqual([toTypedValue({ resourceType: 'Patient' })]);

    // Identifier references without a "type" resolves to nothing
    expect(
      functions.resolve([{ type: PropertyType.Reference, value: { identifier: patient.identifier?.[0] } }])
    ).toEqual([]);
  });

  test('as', () => {
    expect(functions.as([toTypedValue({ resourceType: 'Patient', id: '123' })])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);
  });

  // 12. Formal Specifications

  test('type', () => {
    expect(functions.type([TYPED_TRUE])).toEqual([toTypedValue({ namespace: 'System', name: 'Boolean' })]);
    expect(functions.type([toTypedValue(123)])).toEqual([toTypedValue({ namespace: 'System', name: 'Integer' })]);
    expect(functions.type([toTypedValue({ resourceType: 'Patient', id: '123' })])).toEqual([
      toTypedValue({ namespace: 'FHIR', name: 'Patient' }),
    ]);
  });
});
