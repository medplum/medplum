import { Atom, LiteralAtom } from './atoms';
import * as functions from './functions';

const isEven: Atom = {
  eval: num => [num % 2 === 0]
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

  test('intersect', () => {
    expect(functions.intersect([], undefined as any as Atom)).toEqual([]);
    expect(functions.intersect([], null as any as Atom)).toEqual([]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.intersect([], num1)).toEqual([]);
    expect(functions.intersect([1], num1)).toEqual([1]);
    expect(functions.intersect([1, 2], num1)).toEqual([1]);
    expect(functions.intersect([1, 1, 3], num1)).toEqual([1]);
  });

  test('exclude', () => {
    expect(functions.exclude([], undefined as any as Atom)).toEqual([]);
    expect(functions.exclude([], null as any as Atom)).toEqual([]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.exclude([], num1)).toEqual([]);
    expect(functions.exclude([1], num1)).toEqual([]);
    expect(functions.exclude([1, 2], num1)).toEqual([2]);
    expect(functions.exclude([1, 2, 3], num1)).toEqual([2, 3]);
  });

  // 5.4. Combining

  test('union', () => {
    expect(functions.union([], undefined as any as Atom)).toEqual([]);
    expect(functions.union([], null as any as Atom)).toEqual([]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.union([], num1)).toEqual([1]);
    expect(functions.union([1], num1)).toEqual([1]);
    expect(functions.union([1, 2], num1)).toEqual([1, 2]);
    expect(functions.union([1, 2, 3], num1)).toEqual([1, 2, 3]);
  });

  test('combine', () => {
    expect(functions.combine([], undefined as any as Atom)).toEqual([]);
    expect(functions.combine([], null as any as Atom)).toEqual([]);

    const num1: Atom = { eval: () => 1 };
    expect(functions.combine([], num1)).toEqual([1]);
    expect(functions.combine([1], num1)).toEqual([1, 1]);
    expect(functions.combine([1, 2], num1)).toEqual([1, 2, 1]);
    expect(functions.combine([1, 2, 3], num1)).toEqual([1, 2, 3, 1]);
  });

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
    expect(functions.toBoolean([{}])).toEqual([]);
  });

  test('convertsToBoolean', () => {
    expect(functions.convertsToBoolean([])).toEqual([]);
    expect(functions.convertsToBoolean([true])).toEqual([true]);
    expect(functions.convertsToBoolean([false])).toEqual([true]);
    expect(functions.convertsToBoolean([1])).toEqual([true]);
    expect(() => functions.convertsToBoolean([1, 2])).toThrow();
    expect(functions.convertsToBoolean(['true'])).toEqual([true]);
    expect(functions.convertsToBoolean(['false'])).toEqual([true]);
    expect(functions.convertsToBoolean(['xyz'])).toEqual([false]);
    expect(functions.convertsToBoolean([{}])).toEqual([false]);
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

  test('toDecimal', () => {
    expect(functions.toDecimal([])).toEqual([]);
    expect(functions.toDecimal([true])).toEqual([1]);
    expect(functions.toDecimal([false])).toEqual([0]);
    expect(functions.toDecimal([0])).toEqual([0]);
    expect(functions.toDecimal([1])).toEqual([1]);
    expect(() => functions.toDecimal([1, 2])).toThrow();
    expect(functions.toDecimal(['1'])).toEqual([1]);
    expect(functions.toDecimal(['true'])).toEqual([]);
    expect(functions.toDecimal(['false'])).toEqual([]);
    expect(functions.toDecimal(['xyz'])).toEqual([]);
    expect(functions.toDecimal([{}])).toEqual([]);
  });

  test('convertsToDecimal', () => {
    expect(functions.convertsToDecimal([])).toEqual([]);
    expect(functions.convertsToDecimal([true])).toEqual([true]);
    expect(functions.convertsToDecimal([false])).toEqual([true]);
    expect(functions.convertsToDecimal([0])).toEqual([true]);
    expect(functions.convertsToDecimal([1])).toEqual([true]);
    expect(() => functions.convertsToDecimal([1, 2])).toThrow();
    expect(functions.convertsToDecimal(['1'])).toEqual([true]);
    expect(functions.convertsToDecimal(['true'])).toEqual([false]);
    expect(functions.convertsToDecimal(['false'])).toEqual([false]);
    expect(functions.convertsToDecimal(['xyz'])).toEqual([false]);
    expect(functions.convertsToDecimal([{}])).toEqual([false]);
  });

  test('toQuantity', () => {
    expect(functions.toQuantity([])).toEqual([]);
    expect(functions.toQuantity([{ value: 123, unit: 'mg' }])).toEqual([{ value: 123, unit: 'mg' }]);
    expect(functions.toQuantity([true])).toEqual([{ value: 1, unit: '1' }]);
    expect(functions.toQuantity([false])).toEqual([{ value: 0, unit: '1' }]);
    expect(functions.toQuantity([0])).toEqual([{ value: 0, unit: '1' }]);
    expect(functions.toQuantity([1])).toEqual([{ value: 1, unit: '1' }]);
    expect(() => functions.toQuantity([1, 2])).toThrow();
    expect(functions.toQuantity(['1'])).toEqual([{ value: 1, unit: '1' }]);
    expect(functions.toQuantity(['true'])).toEqual([]);
    expect(functions.toQuantity(['false'])).toEqual([]);
    expect(functions.toQuantity(['xyz'])).toEqual([]);
    expect(functions.toQuantity([{}])).toEqual([]);
  });

  test('convertsToQuantity', () => {
    expect(functions.convertsToQuantity([])).toEqual([]);
    expect(functions.convertsToQuantity([true])).toEqual([true]);
    expect(functions.convertsToQuantity([false])).toEqual([true]);
    expect(functions.convertsToQuantity([0])).toEqual([true]);
    expect(functions.convertsToQuantity([1])).toEqual([true]);
    expect(() => functions.convertsToQuantity([1, 2])).toThrow();
    expect(functions.convertsToQuantity(['1'])).toEqual([true]);
    expect(functions.convertsToQuantity(['true'])).toEqual([false]);
    expect(functions.convertsToQuantity(['false'])).toEqual([false]);
    expect(functions.convertsToQuantity(['xyz'])).toEqual([false]);
    expect(functions.convertsToQuantity([{}])).toEqual([false]);
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

  test('substring', () => {
    expect(functions.substring([], new LiteralAtom(0))).toEqual([]);
    expect(() => functions.substring([1], new LiteralAtom(0))).toThrow();
    expect(functions.substring(['apple'], new LiteralAtom(-1))).toEqual([]);
    expect(functions.substring(['apple'], new LiteralAtom(6))).toEqual([]);
    expect(functions.substring(['apple'], new LiteralAtom(0))).toEqual(['apple']);
    expect(functions.substring(['apple'], new LiteralAtom(2))).toEqual(['ple']);
  });

  test('startsWith', () => {
    expect(functions.startsWith(['apple'], new LiteralAtom('app'))).toEqual([true]);
    expect(functions.startsWith(['apple'], new LiteralAtom('ple'))).toEqual([false]);
  });

  test('endsWith', () => {
    expect(functions.endsWith(['apple'], new LiteralAtom('app'))).toEqual([false]);
    expect(functions.endsWith(['apple'], new LiteralAtom('ple'))).toEqual([true]);
  });

  test('contains', () => {
    expect(functions.contains(['apple'], new LiteralAtom('app'))).toEqual([true]);
    expect(functions.contains(['apple'], new LiteralAtom('ple'))).toEqual([true]);
    expect(functions.contains(['apple'], new LiteralAtom('ppl'))).toEqual([true]);
    expect(functions.contains(['apple'], new LiteralAtom('xyz'))).toEqual([false]);
  });

  test('upper', () => {
    expect(functions.upper(['apple'])).toEqual(['APPLE']);
    expect(functions.upper(['Apple'])).toEqual(['APPLE']);
    expect(functions.upper(['APPLE'])).toEqual(['APPLE']);
  });

  test('lower', () => {
    expect(functions.lower(['apple'])).toEqual(['apple']);
    expect(functions.lower(['Apple'])).toEqual(['apple']);
    expect(functions.lower(['APPLE'])).toEqual(['apple']);
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

  test('length', () => {
    expect(functions.length([''])).toEqual([0]);
    expect(functions.length(['x'])).toEqual([1]);
    expect(functions.length(['xy'])).toEqual([2]);
    expect(functions.length(['xyz'])).toEqual([3]);
  });

  test('toChars', () => {
    expect(functions.toChars([''])).toEqual([]);
    expect(functions.toChars(['x'])).toEqual([['x']]);
    expect(functions.toChars(['xy'])).toEqual([['x', 'y']]);
    expect(functions.toChars(['xyz'])).toEqual([['x', 'y', 'z']]);
  });

  // 5.7. Math

  test('abs', () => {
    expect(() => functions.abs(['xyz'])).toThrow();
    expect(functions.abs([])).toEqual([]);
    expect(functions.abs([-1])).toEqual([1]);
    expect(functions.abs([0])).toEqual([0]);
    expect(functions.abs([1])).toEqual([1]);
  });

  // 5.8. Tree navigation

  // 5.9. Utility functions

  test('now', () => {
    expect(functions.now()[0]).toBeDefined();
  });

  test('timeOfDay', () => {
    expect(functions.timeOfDay()[0]).toBeDefined();
  });

  test('today', () => {
    expect(functions.today()[0]).toBeDefined();
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
