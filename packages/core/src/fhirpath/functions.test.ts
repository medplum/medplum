import { functions } from './functions';
import { Atom } from './parse';

const isEven: Atom = {
  eval: num => num % 2 === 0
};

describe('FHIRPath functions', () => {

  test('empty', () => {
    expect(functions.empty([])).toEqual(true);
    expect(functions.empty([1])).toEqual(false);
    expect(functions.empty([1, 2])).toEqual(false);
  });

  test('exists', () => {
    expect(functions.exists([])).toEqual(false);
    expect(functions.exists([1])).toEqual(true);
    expect(functions.exists([1, 2])).toEqual(true);
    expect(functions.exists([], isEven)).toEqual(false);
    expect(functions.exists([1], isEven)).toEqual(false);
    expect(functions.exists([1, 2], isEven)).toEqual(true);
  });

  test('all', () => {
    expect(functions.all([], isEven)).toEqual(true);
    expect(functions.all([1], isEven)).toEqual(false);
    expect(functions.all([2], isEven)).toEqual(true);
    expect(functions.all([1, 2], isEven)).toEqual(false);
    expect(functions.all([2, 4], isEven)).toEqual(true);
  });

  test('allTrue', () => {
    expect(functions.allTrue([])).toEqual(true);
    expect(functions.allTrue([true])).toEqual(true);
    expect(functions.allTrue([false])).toEqual(false);
    expect(functions.allTrue([true, false])).toEqual(false);
    expect(functions.allTrue([true, true])).toEqual(true);
    expect(functions.allTrue([false, false])).toEqual(false);
  });

  test('anyTrue', () => {
    expect(functions.anyTrue([])).toEqual(false);
    expect(functions.anyTrue([true])).toEqual(true);
    expect(functions.anyTrue([false])).toEqual(false);
    expect(functions.anyTrue([true, false])).toEqual(true);
    expect(functions.anyTrue([true, true])).toEqual(true);
    expect(functions.anyTrue([false, false])).toEqual(false);
  });

  test('allFalse', () => {
    expect(functions.allFalse([])).toEqual(true);
    expect(functions.allFalse([true])).toEqual(false);
    expect(functions.allFalse([false])).toEqual(true);
    expect(functions.allFalse([true, false])).toEqual(false);
    expect(functions.allFalse([true, true])).toEqual(false);
    expect(functions.allFalse([false, false])).toEqual(true);
  });

  test('anyFalse', () => {
    expect(functions.anyFalse([])).toEqual(false);
    expect(functions.anyFalse([true])).toEqual(false);
    expect(functions.anyFalse([false])).toEqual(true);
    expect(functions.anyFalse([true, false])).toEqual(true);
    expect(functions.anyFalse([true, true])).toEqual(false);
    expect(functions.anyFalse([false, false])).toEqual(true);
  });

  test('count', () => {
    expect(functions.count([])).toEqual(0);
    expect(functions.count([1])).toEqual(1);
    expect(functions.count([1, 2])).toEqual(2);
  });

  test('distinct', () => {
    expect(functions.distinct([])).toEqual([]);
    expect(functions.distinct([1])).toEqual([1]);
    expect(functions.distinct([1, 2])).toEqual([1, 2]);
    expect(functions.distinct([1, 1])).toEqual([1]);
    expect(functions.distinct(['a'])).toEqual(['a']);
    expect(functions.distinct(['a', 'b'])).toEqual(['a', 'b']);
    expect(functions.distinct(['a', 'a'])).toEqual(['a']);
  });

  test('isDistinct', () => {
    expect(functions.isDistinct([])).toEqual(true);
    expect(functions.isDistinct([1])).toEqual(true);
    expect(functions.isDistinct([1, 2])).toEqual(true);
    expect(functions.isDistinct([1, 1])).toEqual(false);
    expect(functions.isDistinct(['a'])).toEqual(true);
    expect(functions.isDistinct(['a', 'b'])).toEqual(true);
    expect(functions.isDistinct(['a', 'a'])).toEqual(false);
  });

  test('where', () => {
    expect(functions.where([], isEven)).toEqual([]);
    expect(functions.where([1], isEven)).toEqual([]);
    expect(functions.where([1, 2], isEven)).toEqual([2]);
    expect(functions.where([1, 2, 3, 4], isEven)).toEqual([2, 4]);
  });

  test('single', () => {
    expect(functions.single([])).toEqual([]);
    expect(functions.single([1])).toEqual([1]);
    expect(() => functions.single([1, 2])).toThrowError('Expected input length one for single()');
  });

  test('first', () => {
    expect(functions.first([])).toEqual([]);
    expect(functions.first([1])).toEqual([1]);
    expect(functions.first([1, 2])).toEqual([1]);
    expect(functions.first([1, 2, 3])).toEqual([1]);
    expect(functions.first([1, 2, 3, 4])).toEqual([1]);
  });

  test('last', () => {
    expect(functions.last([])).toEqual([]);
    expect(functions.last([1])).toEqual([1]);
    expect(functions.last([1, 2])).toEqual([2]);
    expect(functions.last([1, 2, 3])).toEqual([3]);
    expect(functions.last([1, 2, 3, 4])).toEqual([4]);
  });

  test('tail', () => {
    expect(functions.tail([])).toEqual([]);
    expect(functions.tail([1])).toEqual([]);
    expect(functions.tail([1, 2])).toEqual([2]);
    expect(functions.tail([1, 2, 3])).toEqual([2, 3]);
    expect(functions.tail([1, 2, 3, 4])).toEqual([2, 3, 4]);
  });

  test('skip', () => {
    const nonNumber: Atom = { eval: () => 'xyz' };
    expect(() => functions.skip([1, 2, 3], nonNumber)).toThrowError('Expected a number for skip(num)');

    const num0: Atom = { eval: () => 0 };
    expect(functions.skip([], num0)).toEqual([]);
    expect(functions.skip([1], num0)).toEqual([1]);
    expect(functions.skip([1, 2], num0)).toEqual([1, 2]);
    expect(functions.skip([1, 2, 3], num0)).toEqual([1, 2, 3]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.skip([], num1)).toEqual([]);
    expect(functions.skip([1], num1)).toEqual([]);
    expect(functions.skip([1, 2], num1)).toEqual([2]);
    expect(functions.skip([1, 2, 3], num1)).toEqual([2, 3]);

    const num2: Atom = { eval: () => 2 };
    expect(functions.skip([], num2)).toEqual([]);
    expect(functions.skip([1], num2)).toEqual([]);
    expect(functions.skip([1, 2], num2)).toEqual([]);
    expect(functions.skip([1, 2, 3], num2)).toEqual([3]);
  });

  test('take', () => {
    const nonNumber: Atom = { eval: () => 'xyz' };
    expect(() => functions.take([1, 2, 3], nonNumber)).toThrowError('Expected a number for take(num)');

    const num0: Atom = { eval: () => 0 };
    expect(functions.take([], num0)).toEqual([]);
    expect(functions.take([1], num0)).toEqual([]);
    expect(functions.take([1, 2], num0)).toEqual([]);
    expect(functions.take([1, 2, 3], num0)).toEqual([]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.take([], num1)).toEqual([]);
    expect(functions.take([1], num1)).toEqual([1]);
    expect(functions.take([1, 2], num1)).toEqual([1]);
    expect(functions.take([1, 2, 3], num1)).toEqual([1]);

    const num2: Atom = { eval: () => 2 };
    expect(functions.take([], num2)).toEqual([]);
    expect(functions.take([1], num2)).toEqual([1]);
    expect(functions.take([1, 2], num2)).toEqual([1, 2]);
    expect(functions.take([1, 2, 3], num2)).toEqual([1, 2]);
  });

  test('resolve', () => {
    expect(functions.resolve(['Patient/123'])).toEqual([{ resourceType: 'Patient', id: '123' }]);
    expect(functions.resolve([{ reference: 'Patient/123' }])).toEqual([{ resourceType: 'Patient', id: '123' }]);
    expect(functions.resolve([123])).toEqual([]);
  });

  test('as', () => {
    expect(functions.as([{ resourceType: 'Patient', id: '123' }])).toEqual([{ resourceType: 'Patient', id: '123' }]);
  });

});
