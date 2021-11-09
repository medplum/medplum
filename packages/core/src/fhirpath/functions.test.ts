import { Atom, LiteralAtom } from './atoms';
import { functions } from './functions';

const isEven: Atom = {
  eval: num => num % 2 === 0
};

describe('FHIRPath functions', () => {

  // 5.1 Existence

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

  // 5.2. Filtering and projection

  test('where', () => {
    expect(functions.where([], isEven)).toEqual([]);
    expect(functions.where([1], isEven)).toEqual([]);
    expect(functions.where([1, 2], isEven)).toEqual([2]);
    expect(functions.where([1, 2, 3, 4], isEven)).toEqual([2, 4]);
  });

  // 5.3 Subsetting

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

  // 5.4. Combining

  // 5.5. Conversion

  test('toBoolean', () => {
    expect(functions.toBoolean([])).toEqual([]);
    expect(functions.toBoolean([true])).toEqual([true]);
    expect(functions.toBoolean([false])).toEqual([false]);
    expect(functions.toBoolean([1])).toEqual([true]);
    expect(() => functions.toBoolean([1, 2])).toThrow();
    expect(functions.toBoolean(['true'])).toEqual([true]);
    expect(functions.toBoolean(['false'])).toEqual([false]);
    expect(functions.toBoolean(['xyz'])).toEqual([]);
    expect(functions.toBoolean([{}])).toEqual([true]);
  });

  test('toInteger', () => {
    expect(functions.toInteger([])).toEqual([]);
    expect(functions.toInteger([true])).toEqual([1]);
    expect(functions.toInteger([false])).toEqual([0]);
    expect(functions.toInteger([0])).toEqual([0]);
    expect(functions.toInteger([1])).toEqual([1]);
    expect(() => functions.toInteger([1, 2])).toThrow();
    expect(functions.toInteger(['1'])).toEqual([1]);
    expect(functions.toInteger(['true'])).toEqual([]);
    expect(functions.toInteger(['false'])).toEqual([]);
    expect(functions.toInteger(['xyz'])).toEqual([]);
    expect(functions.toInteger([{}])).toEqual([]);
  });

  test('convertsToInteger', () => {
    expect(functions.convertsToInteger([])).toEqual([]);
    expect(functions.convertsToInteger([true])).toEqual([true]);
    expect(functions.convertsToInteger([false])).toEqual([true]);
    expect(functions.convertsToInteger([0])).toEqual([true]);
    expect(functions.convertsToInteger([1])).toEqual([true]);
    expect(() => functions.convertsToInteger([1, 2])).toThrow();
    expect(functions.convertsToInteger(['1'])).toEqual([true]);
    expect(functions.convertsToInteger(['true'])).toEqual([false]);
    expect(functions.convertsToInteger(['false'])).toEqual([false]);
    expect(functions.convertsToInteger(['xyz'])).toEqual([false]);
    expect(functions.convertsToInteger([{}])).toEqual([false]);
  });

  test('toString', () => {
    const toString = functions.toString as any as (input: any[]) => string[];
    expect(toString([])).toEqual([]);
    expect(() => toString([1, 2])).toThrow();
    expect(toString([true])).toEqual(['true']);
    expect(toString([false])).toEqual(['false']);
    expect(toString([0])).toEqual(['0']);
    expect(toString([1])).toEqual(['1']);
    expect(toString(['1'])).toEqual(['1']);
    expect(toString(['true'])).toEqual(['true']);
    expect(toString(['false'])).toEqual(['false']);
    expect(toString(['xyz'])).toEqual(['xyz']);
  });

  test('convertsToString', () => {
    expect(functions.convertsToString([])).toEqual([]);
    expect(() => functions.convertsToString([1, 2])).toThrow();
    expect(functions.convertsToString([true])).toEqual([true]);
    expect(functions.convertsToString([false])).toEqual([true]);
    expect(functions.convertsToString([0])).toEqual([true]);
    expect(functions.convertsToString([1])).toEqual([true]);
    expect(functions.convertsToString(['1'])).toEqual([true]);
    expect(functions.convertsToString(['true'])).toEqual([true]);
    expect(functions.convertsToString(['false'])).toEqual([true]);
    expect(functions.convertsToString(['xyz'])).toEqual([true]);
    expect(functions.convertsToString([{}])).toEqual([true]);
  });

  // 5.6. String Manipulation.

  test('indexOf', () => {
    expect(functions.indexOf(['apple'], new LiteralAtom('a'))).toEqual([0]);
  });

  test('replace', () => {
    expect(functions.replace(['banana'], new LiteralAtom('nana'), new LiteralAtom('tman'))).toEqual(['batman']);
  });

  test('matches', () => {
    expect(functions.matches(['apple'], new LiteralAtom('a'))).toEqual([true]);
  });

  test('replaceMatches', () => {
    expect(functions.replaceMatches(['banana'], new LiteralAtom('nana'), new LiteralAtom('tman'))).toEqual(['batman']);
  });

  // 5.7. Math

  // 5.8. Tree navigation

  // 5.9. Utility functions

  test('now', () => {
    expect(functions.now()[0]).toBeInstanceOf(Date);
  });

  test('timeOfDay', () => {
    expect(functions.timeOfDay()[0]).toBeInstanceOf(Date);
  });

  test('today', () => {
    expect(functions.today()[0]).toBeInstanceOf(Date);
  });

  // Other

  test('resolve', () => {
    expect(functions.resolve(['Patient/123'])).toEqual([{ resourceType: 'Patient', id: '123' }]);
    expect(functions.resolve([{ reference: 'Patient/123' }])).toEqual([{ resourceType: 'Patient', id: '123' }]);
    expect(functions.resolve([123])).toEqual([]);
  });

  test('as', () => {
    expect(functions.as([{ resourceType: 'Patient', id: '123' }])).toEqual([{ resourceType: 'Patient', id: '123' }]);
  });

  // 12. Formal Specifications

  test('type', () => {
    expect(functions.type([true]))
      .toEqual([{ namespace: 'System', name: 'Boolean' }]);
    expect(functions.type([123]))
      .toEqual([{ namespace: 'System', name: 'Integer' }]);
    expect(functions.type([{ resourceType: 'Patient', id: '123' }]))
      .toEqual([{ namespace: 'FHIR', name: 'Patient' }]);
    expect(functions.type([{}])).toEqual([null]);
  });

});
