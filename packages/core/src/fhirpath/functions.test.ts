import { Patient } from '@medplum/fhirtypes';
import { Atom, AtomContext } from '../fhirlexer/parse';
import { PropertyType, TypedValue } from '../types';
import { createReference, getReferenceString } from '../utils';
import { LiteralAtom } from './atoms';
import { FhirPathFunction, functions } from './functions';
import { booleanToTypedValue, toTypedValue } from './utils';

const context = {
  parent: undefined,
  variables: {},
};

const isEven: Atom = {
  eval: (context: AtomContext, num: TypedValue[]) => booleanToTypedValue((num[0].value as number) % 2 === 0),
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
const TYPED_EMPTY = toTypedValue({});

const LITERAL_TRUE = new LiteralAtom(TYPED_TRUE);
const LITERAL_FALSE = new LiteralAtom(TYPED_FALSE);
const LITERAL_X = new LiteralAtom(TYPED_X);
const LITERAL_Y = new LiteralAtom(TYPED_Y);

describe('FHIRPath functions', () => {
  // 5.1 Existence

  test('empty', () => {
    expect(functions.empty(context, [])).toEqual([TYPED_TRUE]);
    expect(functions.empty(context, [TYPED_EMPTY])).toEqual([TYPED_TRUE]);
    expect(functions.empty(context, [TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.empty(context, [TYPED_1, TYPED_2])).toEqual([TYPED_FALSE]);
  });

  test('hasValue', () => {
    expect(functions.hasValue(context, [])).toEqual([TYPED_FALSE]);
    expect(functions.hasValue(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.hasValue(context, [TYPED_1, TYPED_2])).toEqual([TYPED_TRUE]);
  });

  test('exists', () => {
    expect(functions.exists(context, [])).toEqual([TYPED_FALSE]);
    expect(functions.exists(context, [TYPED_EMPTY])).toEqual([TYPED_FALSE]);
    expect(functions.exists(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.exists(context, [TYPED_1, TYPED_2])).toEqual([TYPED_TRUE]);
    expect(functions.exists(context, [], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.exists(context, [TYPED_1], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.exists(context, [TYPED_1, TYPED_2], isEven)).toEqual([TYPED_TRUE]);
  });

  test('all', () => {
    expect(functions.all(context, [], isEven)).toEqual([TYPED_TRUE]);
    expect(functions.all(context, [TYPED_1], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.all(context, [TYPED_2], isEven)).toEqual([TYPED_TRUE]);
    expect(functions.all(context, [TYPED_1, TYPED_2], isEven)).toEqual([TYPED_FALSE]);
    expect(functions.all(context, [TYPED_2, TYPED_4], isEven)).toEqual([TYPED_TRUE]);
  });

  test('allTrue', () => {
    expect(functions.allTrue(context, [])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue(context, [TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allTrue(context, [TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allTrue(context, [TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.allTrue(context, [TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
  });

  test('anyTrue', () => {
    expect(functions.anyTrue(context, [])).toEqual([TYPED_FALSE]);
    expect(functions.anyTrue(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue(context, [TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.anyTrue(context, [TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue(context, [TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.anyTrue(context, [TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
  });

  test('allFalse', () => {
    expect(functions.allFalse(context, [])).toEqual([TYPED_TRUE]);
    expect(functions.allFalse(context, [TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.allFalse(context, [TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse(context, [TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.allFalse(context, [TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
  });

  test('anyFalse', () => {
    expect(functions.anyFalse(context, [])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse(context, [TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyFalse(context, [TYPED_TRUE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.anyFalse(context, [TYPED_TRUE, TYPED_TRUE])).toEqual([TYPED_FALSE]);
    expect(functions.anyFalse(context, [TYPED_FALSE, TYPED_FALSE])).toEqual([TYPED_TRUE]);
  });

  test('count', () => {
    expect(functions.count(context, [])).toEqual([TYPED_0]);
    expect(functions.count(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(functions.count(context, [TYPED_1, TYPED_2])).toEqual([TYPED_2]);
  });

  test('distinct', () => {
    expect(functions.distinct(context, [])).toEqual([]);
    expect(functions.distinct(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(functions.distinct(context, [TYPED_1, TYPED_2])).toEqual([TYPED_1, TYPED_2]);
    expect(functions.distinct(context, [TYPED_1, TYPED_1])).toEqual([TYPED_1]);
    expect(functions.distinct(context, [TYPED_A])).toEqual([TYPED_A]);
    expect(functions.distinct(context, [TYPED_A, TYPED_B])).toEqual([TYPED_A, TYPED_B]);
    expect(functions.distinct(context, [TYPED_A, TYPED_A])).toEqual([TYPED_A]);
  });

  test('isDistinct', () => {
    expect(functions.isDistinct(context, [])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct(context, [TYPED_1, TYPED_2])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct(context, [TYPED_1, TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.isDistinct(context, [TYPED_A])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct(context, [TYPED_A, TYPED_B])).toEqual([TYPED_TRUE]);
    expect(functions.isDistinct(context, [TYPED_A, TYPED_A])).toEqual([TYPED_FALSE]);
  });

  // 5.2. Filtering and projection

  test('where', () => {
    expect(functions.where(context, [], isEven)).toEqual([]);
    expect(functions.where(context, [TYPED_1], isEven)).toEqual([]);
    expect(functions.where(context, [TYPED_1, TYPED_2], isEven)).toEqual([TYPED_2]);
    expect(functions.where(context, [TYPED_1, TYPED_2, TYPED_3, TYPED_4], isEven)).toEqual([TYPED_2, TYPED_4]);
  });

  // 5.3 Subsetting

  test('single', () => {
    expect(functions.single(context, [])).toEqual([]);
    expect(functions.single(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(() => functions.single(context, [TYPED_1, TYPED_2])).toThrow('Expected input length one for single()');
  });

  test('first', () => {
    expect(functions.first(context, [])).toEqual([]);
    expect(functions.first(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(functions.first(context, [TYPED_1, TYPED_2])).toEqual([TYPED_1]);
    expect(functions.first(context, [TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_1]);
    expect(functions.first(context, [TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_1]);
  });

  test('last', () => {
    expect(functions.last(context, [])).toEqual([]);
    expect(functions.last(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(functions.last(context, [TYPED_1, TYPED_2])).toEqual([TYPED_2]);
    expect(functions.last(context, [TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_3]);
    expect(functions.last(context, [TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_4]);
  });

  test('tail', () => {
    expect(functions.tail(context, [])).toEqual([]);
    expect(functions.tail(context, [TYPED_1])).toEqual([]);
    expect(functions.tail(context, [TYPED_1, TYPED_2])).toEqual([TYPED_2]);
    expect(functions.tail(context, [TYPED_1, TYPED_2, TYPED_3])).toEqual([TYPED_2, TYPED_3]);
    expect(functions.tail(context, [TYPED_1, TYPED_2, TYPED_3, TYPED_4])).toEqual([TYPED_2, TYPED_3, TYPED_4]);
  });

  test('skip', () => {
    const nonNumber: Atom = { eval: () => [TYPED_XYZ] };
    expect(() => functions.skip(context, [TYPED_1, TYPED_2, TYPED_3], nonNumber)).toThrow(
      'Expected a number for skip(num)'
    );

    const num0: Atom = { eval: () => [TYPED_0] };
    expect(functions.skip(context, [], num0)).toEqual([]);
    expect(functions.skip(context, [TYPED_1], num0)).toEqual([TYPED_1]);
    expect(functions.skip(context, [TYPED_1, TYPED_2], num0)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.skip(context, [TYPED_1, TYPED_2, TYPED_3], num0)).toEqual([TYPED_1, TYPED_2, TYPED_3]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.skip(context, [], num1)).toEqual([]);
    expect(functions.skip(context, [TYPED_1], num1)).toEqual([]);
    expect(functions.skip(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_2]);
    expect(functions.skip(context, [TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_2, TYPED_3]);

    const num2: Atom = { eval: () => [TYPED_2] };
    expect(functions.skip(context, [], num2)).toEqual([]);
    expect(functions.skip(context, [TYPED_1], num2)).toEqual([]);
    expect(functions.skip(context, [TYPED_1, TYPED_2], num2)).toEqual([]);
    expect(functions.skip(context, [TYPED_1, TYPED_2, TYPED_3], num2)).toEqual([TYPED_3]);
  });

  test('take', () => {
    const nonNumber: Atom = { eval: () => [TYPED_XYZ] };
    expect(() => functions.take(context, [TYPED_1, TYPED_2, TYPED_3], nonNumber)).toThrow(
      'Expected a number for take(num)'
    );

    const num0: Atom = { eval: () => [TYPED_0] };
    expect(functions.take(context, [], num0)).toEqual([]);
    expect(functions.take(context, [TYPED_1], num0)).toEqual([]);
    expect(functions.take(context, [TYPED_1, TYPED_2], num0)).toEqual([]);
    expect(functions.take(context, [TYPED_1, TYPED_2, TYPED_3], num0)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.take(context, [], num1)).toEqual([]);
    expect(functions.take(context, [TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.take(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_1]);
    expect(functions.take(context, [TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1]);

    const num2: Atom = { eval: () => [TYPED_2] };
    expect(functions.take(context, [], num2)).toEqual([]);
    expect(functions.take(context, [TYPED_1], num2)).toEqual([TYPED_1]);
    expect(functions.take(context, [TYPED_1, TYPED_2], num2)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.take(context, [TYPED_1, TYPED_2, TYPED_3], num2)).toEqual([TYPED_1, TYPED_2]);
  });

  test('intersect', () => {
    expect(functions.intersect(context, [], undefined as unknown as Atom)).toEqual([]);
    expect(functions.intersect(context, [], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.intersect(context, [], num1)).toEqual([]);
    expect(functions.intersect(context, [TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.intersect(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_1]);
    expect(functions.intersect(context, [TYPED_1, TYPED_1, TYPED_3], num1)).toEqual([TYPED_1]);
  });

  test('exclude', () => {
    expect(functions.exclude(context, [], undefined as unknown as Atom)).toEqual([]);
    expect(functions.exclude(context, [], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.exclude(context, [], num1)).toEqual([]);
    expect(functions.exclude(context, [TYPED_1], num1)).toEqual([]);
    expect(functions.exclude(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_2]);
    expect(functions.exclude(context, [TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_2, TYPED_3]);
  });

  // 5.4. Combining

  test('union', () => {
    expect(functions.union(context, [], undefined as unknown as Atom)).toEqual([]);
    expect(functions.union(context, [], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.union(context, [], num1)).toEqual([TYPED_1]);
    expect(functions.union(context, [TYPED_1], num1)).toEqual([TYPED_1]);
    expect(functions.union(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_1, TYPED_2]);
    expect(functions.union(context, [TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1, TYPED_2, TYPED_3]);
  });

  test('combine', () => {
    expect(functions.combine(context, [], undefined as unknown as Atom)).toEqual([]);
    expect(functions.combine(context, [], null as unknown as Atom)).toEqual([]);

    const num1: Atom = { eval: () => [TYPED_1] };
    expect(functions.combine(context, [], num1)).toEqual([TYPED_1]);
    expect(functions.combine(context, [TYPED_1], num1)).toEqual([TYPED_1, TYPED_1]);
    expect(functions.combine(context, [TYPED_1, TYPED_2], num1)).toEqual([TYPED_1, TYPED_2, TYPED_1]);
    expect(functions.combine(context, [TYPED_1, TYPED_2, TYPED_3], num1)).toEqual([TYPED_1, TYPED_2, TYPED_3, TYPED_1]);
  });

  // 5.5. Conversion

  test('iif', () => {
    expect(functions.iif(context, [], LITERAL_TRUE, LITERAL_X)).toEqual([TYPED_X]);
    expect(functions.iif(context, [], LITERAL_FALSE, LITERAL_X)).toEqual([]);
    expect(functions.iif(context, [], LITERAL_TRUE, LITERAL_X, LITERAL_Y)).toEqual([TYPED_X]);
    expect(functions.iif(context, [], LITERAL_FALSE, LITERAL_X, LITERAL_Y)).toEqual([TYPED_Y]);
  });

  test('toBoolean', () => {
    expect(functions.toBoolean(context, [])).toEqual([]);
    expect(functions.toBoolean(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.toBoolean(context, [TYPED_FALSE])).toEqual([TYPED_FALSE]);
    expect(functions.toBoolean(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.toBoolean(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toBoolean(context, [toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.toBoolean(context, [toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.toBoolean(context, [toTypedValue('xyz')])).toEqual([]);
    expect(functions.toBoolean(context, [toTypedValue({})])).toEqual([]);
  });

  test('convertsToBoolean', () => {
    expect(functions.convertsToBoolean(context, [])).toEqual([]);
    expect(functions.convertsToBoolean(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToBoolean(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToBoolean(context, [toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean(context, [toTypedValue('false')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToBoolean(context, [toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToBoolean(context, [toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toInteger', () => {
    expect(functions.toInteger(context, [])).toEqual([]);
    expect(functions.toInteger(context, [TYPED_TRUE])).toEqual([TYPED_1]);
    expect(functions.toInteger(context, [TYPED_FALSE])).toEqual([TYPED_0]);
    expect(functions.toInteger(context, [TYPED_0])).toEqual([TYPED_0]);
    expect(functions.toInteger(context, [TYPED_1])).toEqual([TYPED_1]);
    expect(() => functions.toInteger(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toInteger(context, [toTypedValue('1')])).toEqual([TYPED_1]);
    expect(functions.toInteger(context, [toTypedValue('true')])).toEqual([]);
    expect(functions.toInteger(context, [toTypedValue('false')])).toEqual([]);
    expect(functions.toInteger(context, [toTypedValue('xyz')])).toEqual([]);
    expect(functions.toInteger(context, [toTypedValue({})])).toEqual([]);
  });

  test('convertsToInteger', () => {
    expect(functions.convertsToInteger(context, [])).toEqual([]);
    expect(functions.convertsToInteger(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger(context, [TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToInteger(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToInteger(context, [toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToInteger(context, [toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger(context, [toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger(context, [toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToInteger(context, [toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toDate', () => {
    expect(functions.toDate(context, [])).toEqual([]);
    expect(() => functions.toDate(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDate(context, [toTypedValue('2020-01-01')])).toEqual([
      { type: PropertyType.date, value: '2020-01-01' },
    ]);
    expect(functions.toDate(context, [TYPED_1])).toEqual([]);
    expect(functions.toDate(context, [TYPED_TRUE])).toEqual([]);
  });

  test('convertsToDate', () => {
    expect(functions.convertsToDate(context, [])).toEqual([]);
    expect(() => functions.convertsToDate(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDate(context, [toTypedValue('2020-01-01')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDate(context, [TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDate(context, [TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  test('toDateTime', () => {
    expect(functions.toDateTime(context, [])).toEqual([]);
    expect(() => functions.toDateTime(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDateTime(context, [toTypedValue('2020-01-01')])).toEqual([
      { type: PropertyType.dateTime, value: '2020-01-01' },
    ]);
    expect(functions.toDateTime(context, [toTypedValue('2020-01-01T12:00:00Z')])).toEqual([
      { type: PropertyType.dateTime, value: '2020-01-01T12:00:00.000Z' },
    ]);
    expect(functions.toDateTime(context, [TYPED_1])).toEqual([]);
    expect(functions.toDateTime(context, [TYPED_TRUE])).toEqual([]);
  });

  test('convertsToDateTime', () => {
    expect(functions.convertsToDateTime(context, [])).toEqual([]);
    expect(() => functions.convertsToDateTime(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDateTime(context, [toTypedValue('2020-01-01')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDateTime(context, [toTypedValue('2020-01-01T12:00:00Z')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDateTime(context, [TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDateTime(context, [TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  test('toDecimal', () => {
    expect(functions.toDecimal(context, [])).toEqual([]);
    expect(functions.toDecimal(context, [TYPED_TRUE])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(functions.toDecimal(context, [TYPED_FALSE])).toEqual([{ type: PropertyType.decimal, value: 0 }]);
    expect(functions.toDecimal(context, [TYPED_0])).toEqual([{ type: PropertyType.decimal, value: 0 }]);
    expect(functions.toDecimal(context, [TYPED_1])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(() => functions.toDecimal(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toDecimal(context, [toTypedValue('1')])).toEqual([{ type: PropertyType.decimal, value: 1 }]);
    expect(functions.toDecimal(context, [toTypedValue('true')])).toEqual([]);
    expect(functions.toDecimal(context, [toTypedValue('false')])).toEqual([]);
    expect(functions.toDecimal(context, [toTypedValue('xyz')])).toEqual([]);
    expect(functions.toDecimal(context, [toTypedValue({})])).toEqual([]);
  });

  test('convertsToDecimal', () => {
    expect(functions.convertsToDecimal(context, [])).toEqual([]);
    expect(functions.convertsToDecimal(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal(context, [TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToDecimal(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToDecimal(context, [toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToDecimal(context, [toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal(context, [toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal(context, [toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToDecimal(context, [toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toQuantity', () => {
    expect(functions.toQuantity(context, [])).toEqual([]);
    expect(functions.toQuantity(context, [toTypedValue({ value: 123, unit: 'mg' })])).toEqual([
      toTypedValue({ value: 123, unit: 'mg' }),
    ]);
    expect(functions.toQuantity(context, [TYPED_TRUE])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(functions.toQuantity(context, [TYPED_FALSE])).toEqual([toTypedValue({ value: 0, unit: '1' })]);
    expect(functions.toQuantity(context, [TYPED_0])).toEqual([toTypedValue({ value: 0, unit: '1' })]);
    expect(functions.toQuantity(context, [TYPED_1])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(() => functions.toQuantity(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toQuantity(context, [toTypedValue('1')])).toEqual([toTypedValue({ value: 1, unit: '1' })]);
    expect(functions.toQuantity(context, [toTypedValue('true')])).toEqual([]);
    expect(functions.toQuantity(context, [toTypedValue('false')])).toEqual([]);
    expect(functions.toQuantity(context, [toTypedValue('xyz')])).toEqual([]);
    expect(functions.toQuantity(context, [toTypedValue({})])).toEqual([]);
  });

  test('convertsToQuantity', () => {
    expect(functions.convertsToQuantity(context, [])).toEqual([]);
    expect(functions.convertsToQuantity(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity(context, [TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(() => functions.convertsToQuantity(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToQuantity(context, [toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToQuantity(context, [toTypedValue('true')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity(context, [toTypedValue('false')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity(context, [toTypedValue('xyz')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToQuantity(context, [toTypedValue({})])).toEqual([TYPED_FALSE]);
  });

  test('toString', () => {
    const fhirToString = functions.toString as unknown as FhirPathFunction;
    expect(fhirToString(context, [])).toEqual([]);
    expect(() => fhirToString(context, [null as unknown as TypedValue])).toThrow();
    expect(() => fhirToString(context, [undefined as unknown as TypedValue])).toThrow();
    expect(() => fhirToString(context, [TYPED_1, TYPED_2])).toThrow();
    expect(fhirToString(context, [TYPED_TRUE])).toEqual([toTypedValue('true')]);
    expect(fhirToString(context, [TYPED_FALSE])).toEqual([toTypedValue('false')]);
    expect(fhirToString(context, [TYPED_0])).toEqual([toTypedValue('0')]);
    expect(fhirToString(context, [TYPED_1])).toEqual([toTypedValue('1')]);
    expect(fhirToString(context, [toTypedValue(null)])).toEqual([]);
    expect(fhirToString(context, [toTypedValue(undefined)])).toEqual([]);
    expect(fhirToString(context, [toTypedValue('1')])).toEqual([toTypedValue('1')]);
    expect(fhirToString(context, [toTypedValue('true')])).toEqual([toTypedValue('true')]);
    expect(fhirToString(context, [toTypedValue('false')])).toEqual([toTypedValue('false')]);
    expect(fhirToString(context, [toTypedValue('xyz')])).toEqual([toTypedValue('xyz')]);
  });

  test('convertsToString', () => {
    expect(functions.convertsToString(context, [])).toEqual([]);
    expect(() => functions.convertsToString(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToString(context, [TYPED_TRUE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [TYPED_FALSE])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [TYPED_0])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [toTypedValue('1')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [toTypedValue('true')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [toTypedValue('false')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [toTypedValue('xyz')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToString(context, [toTypedValue({})])).toEqual([TYPED_TRUE]);
  });

  test('toTime', () => {
    expect(functions.toTime(context, [])).toEqual([]);
    expect(() => functions.toTime(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.toTime(context, [toTypedValue('12:00:00')])).toEqual([
      { type: PropertyType.time, value: 'T12:00:00.000Z' },
    ]);
    expect(functions.toTime(context, [toTypedValue('T12:00:00')])).toEqual([
      { type: PropertyType.time, value: 'T12:00:00.000Z' },
    ]);
    expect(functions.toTime(context, [toTypedValue('foo')])).toEqual([]);
    expect(functions.toTime(context, [TYPED_1])).toEqual([]);
    expect(functions.toTime(context, [TYPED_TRUE])).toEqual([]);
  });

  test('convertsToTime', () => {
    expect(functions.convertsToTime(context, [])).toEqual([]);
    expect(() => functions.convertsToTime(context, [TYPED_1, TYPED_2])).toThrow();
    expect(functions.convertsToTime(context, [toTypedValue('12:00:00')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToTime(context, [toTypedValue('T12:00:00')])).toEqual([TYPED_TRUE]);
    expect(functions.convertsToTime(context, [toTypedValue('foo')])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToTime(context, [TYPED_1])).toEqual([TYPED_FALSE]);
    expect(functions.convertsToTime(context, [TYPED_TRUE])).toEqual([TYPED_FALSE]);
  });

  // 5.6. String Manipulation.

  test('indexOf', () => {
    expect(functions.indexOf(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('a')))).toEqual([TYPED_0]);
  });

  test('substring', () => {
    expect(functions.substring(context, [], new LiteralAtom(toTypedValue(0)))).toEqual([]);
    expect(() => functions.substring(context, [TYPED_1], new LiteralAtom(toTypedValue(0)))).toThrow();
    expect(functions.substring(context, [TYPED_APPLE], new LiteralAtom(toTypedValue(-1)))).toEqual([]);
    expect(functions.substring(context, [TYPED_APPLE], new LiteralAtom(toTypedValue(6)))).toEqual([]);
    expect(functions.substring(context, [TYPED_APPLE], new LiteralAtom(toTypedValue(0)))).toEqual([TYPED_APPLE]);
    expect(functions.substring(context, [TYPED_APPLE], new LiteralAtom(toTypedValue(2)))).toEqual([
      toTypedValue('ple'),
    ]);
  });

  test('startsWith', () => {
    expect(functions.startsWith(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_TRUE]);
    expect(functions.startsWith(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_FALSE]);
  });

  test('endsWith', () => {
    expect(functions.endsWith(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_FALSE]);
    expect(functions.endsWith(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_TRUE]);
  });

  test('contains', () => {
    expect(functions.contains(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('app')))).toEqual([TYPED_TRUE]);
    expect(functions.contains(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('ple')))).toEqual([TYPED_TRUE]);
    expect(functions.contains(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('ppl')))).toEqual([TYPED_TRUE]);
    expect(functions.contains(context, [TYPED_APPLE], new LiteralAtom(toTypedValue('xyz')))).toEqual([TYPED_FALSE]);
  });

  test('upper', () => {
    expect(functions.upper(context, [toTypedValue('apple')])).toEqual([toTypedValue('APPLE')]);
    expect(functions.upper(context, [toTypedValue('Apple')])).toEqual([toTypedValue('APPLE')]);
    expect(functions.upper(context, [toTypedValue('APPLE')])).toEqual([toTypedValue('APPLE')]);
  });

  test('lower', () => {
    expect(functions.lower(context, [TYPED_APPLE])).toEqual([TYPED_APPLE]);
    expect(functions.lower(context, [toTypedValue('Apple')])).toEqual([TYPED_APPLE]);
    expect(functions.lower(context, [toTypedValue('APPLE')])).toEqual([TYPED_APPLE]);
  });

  test('replace', () => {
    expect(
      functions.replace(
        context,
        [toTypedValue('banana')],
        new LiteralAtom(toTypedValue('nana')),
        new LiteralAtom(toTypedValue('tman'))
      )
    ).toEqual([toTypedValue('batman')]);
  });

  test('matches', () => {
    expect(functions.matches(context, [TYPED_APPLE], new LiteralAtom(TYPED_A))).toEqual([TYPED_TRUE]);
  });

  test('replaceMatches', () => {
    expect(
      functions.replaceMatches(
        context,
        [toTypedValue('banana')],
        new LiteralAtom(toTypedValue('nana')),
        new LiteralAtom(toTypedValue('tman'))
      )
    ).toEqual([toTypedValue('batman')]);
  });

  test('length', () => {
    expect(functions.length(context, [toTypedValue('')])).toEqual([TYPED_0]);
    expect(functions.length(context, [toTypedValue('x')])).toEqual([TYPED_1]);
    expect(functions.length(context, [toTypedValue('xy')])).toEqual([TYPED_2]);
    expect(functions.length(context, [toTypedValue('xyz')])).toEqual([TYPED_3]);
  });

  test('toChars', () => {
    expect(functions.toChars(context, [toTypedValue('')])).toEqual([]);
    expect(functions.toChars(context, [toTypedValue('x')])).toEqual([TYPED_X]);
    expect(functions.toChars(context, [toTypedValue('xy')])).toEqual([TYPED_X, TYPED_Y]);
    expect(functions.toChars(context, [toTypedValue('xyz')])).toEqual([TYPED_X, TYPED_Y, TYPED_Z]);
  });

  // Additional string functions
  // STU Note: the contents of this section are Standard for Trial Use (STU)

  test('join', () => {
    expect(functions.join(context, [toTypedValue('')])).toEqual([toTypedValue('')]);
    expect(functions.join(context, [toTypedValue('a'), toTypedValue('b'), toTypedValue('c')])).toEqual([
      toTypedValue('abc'),
    ]);
    expect(
      functions.join(
        context,
        [toTypedValue('a'), toTypedValue('b'), toTypedValue('c')],
        new LiteralAtom(toTypedValue(','))
      )
    ).toEqual([toTypedValue('a,b,c')]);
    expect(() => functions.join(context, [toTypedValue('')], new LiteralAtom(toTypedValue(1)))).toThrow(
      'Separator must be a string'
    );
  });

  // 5.7. Math

  test('abs', () => {
    expect(() => functions.abs(context, [toTypedValue('xyz')])).toThrow();
    expect(functions.abs(context, [])).toEqual([]);
    expect(functions.abs(context, [toTypedValue(-1)])).toEqual([TYPED_1]);
    expect(functions.abs(context, [TYPED_0])).toEqual([TYPED_0]);
    expect(functions.abs(context, [TYPED_1])).toEqual([TYPED_1]);
  });

  // 5.8. Tree navigation

  // 5.9. Utility functions

  test('now', () => {
    expect(functions.now(context, [])[0]).toBeDefined();
  });

  test('timeOfDay', () => {
    expect(functions.timeOfDay(context, [])[0]).toBeDefined();
  });

  test('today', () => {
    expect(functions.today(context, [])[0]).toBeDefined();
  });

  test('between', () => {
    expect(
      functions.between(
        context,
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
        context,
        [],
        new LiteralAtom(toTypedValue('xxxx-xx-xx')),
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('years'))
      )
    ).toThrow('Invalid start date');

    expect(() =>
      functions.between(
        context,
        [],
        new LiteralAtom(toTypedValue('2020-01-01')),
        new LiteralAtom(toTypedValue('xxxx-xx-xx')),
        new LiteralAtom(toTypedValue('years'))
      )
    ).toThrow('Invalid end date');

    expect(() =>
      functions.between(
        context,
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
    expect(functions.resolve(context, [toTypedValue(getReferenceString(patient))])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);

    // Reference resolves to patient-like with resourceType and id
    expect(functions.resolve(context, [toTypedValue(createReference(patient))])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);

    // Number resolves to nothing
    expect(functions.resolve(context, [toTypedValue(123)])).toEqual([]);

    // Reference with embedded resource resolves to resource
    // We don't normally use embeded resources, except in GraphQL queries
    expect(
      functions.resolve(context, [toTypedValue({ reference: getReferenceString(patient), resource: patient })])
    ).toEqual([toTypedValue(patient)]);

    // Identifier references with a "type" should resolve to patient search reference
    expect(
      functions.resolve(context, [
        { type: PropertyType.Reference, value: { type: 'Patient', identifier: patient.identifier?.[0] } },
      ])
    ).toEqual([toTypedValue({ resourceType: 'Patient' })]);

    // Identifier references without a "type" resolves to nothing
    expect(
      functions.resolve(context, [{ type: PropertyType.Reference, value: { identifier: patient.identifier?.[0] } }])
    ).toEqual([]);
  });

  test('as', () => {
    expect(functions.as(context, [toTypedValue({ resourceType: 'Patient', id: '123' })])).toEqual([
      toTypedValue({ resourceType: 'Patient', id: '123' }),
    ]);
  });

  // 12. Formal Specifications

  test('type', () => {
    expect(functions.type(context, [TYPED_TRUE])).toEqual([toTypedValue({ namespace: 'System', name: 'Boolean' })]);
    expect(functions.type(context, [toTypedValue(123)])).toEqual([
      toTypedValue({ namespace: 'System', name: 'Integer' }),
    ]);
    expect(functions.type(context, [toTypedValue({ resourceType: 'Patient', id: '123' })])).toEqual([
      toTypedValue({ namespace: 'FHIR', name: 'Patient' }),
    ]);
  });
});
