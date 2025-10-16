// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import { Pointer } from '../pointer';
import { clone } from '../util';

test('Pointer.fromJSON empty', () => {
  expect(() => Pointer.fromJSON('')).not.toThrow();
});

test('Pointer.fromJSON slash', () => {
  expect(() => Pointer.fromJSON('/')).not.toThrow();
});

test('Pointer.fromJSON invalid', () => {
  expect(() => Pointer.fromJSON('a')).toThrow(/Invalid JSON Pointer/);
});

const example = { bool: false, arr: [10, 20, 30], obj: { a: 'A', b: 'B' } };

test('Pointer#get bool', () => {
  expect(Pointer.fromJSON('/bool').get(example)).toBe(false);
});
test('Pointer#get array', () => {
  expect(Pointer.fromJSON('/arr/1').get(example)).toBe(20);
});
test('Pointer#get object', () => {
  expect(Pointer.fromJSON('/obj/b').get(example)).toBe('B');
});
test('Pointer#push', () => {
  const pointer = Pointer.fromJSON('/obj');
  pointer.push('a');
  expect(pointer.toString()).toBe('/obj/a');
});
test('Pointer#get∘push', () => {
  const pointer = Pointer.fromJSON('/obj');
  pointer.push('a');
  expect(pointer.get(example)).toBe('A');
});

test('Pointer#set bool', () => {
  const input = { bool: true };
  Pointer.fromJSON('/bool').set(input, false);
  expect(input.bool).toBe(false);
});

test('Pointer#set array middle', () => {
  const input: any = { arr: ['10', '20', '30'] };
  Pointer.fromJSON('/arr/1').set(input, 0);
  expect(input.arr[1]).toBe(0);
});

test('Pointer#set array beyond', () => {
  const input: any = { arr: ['10', '20', '30'] };
  Pointer.fromJSON('/arr/3').set(input, 40);
  expect(input.arr[3]).toBe(40);
});

test('Pointer#set top-level', () => {
  const input: any = { obj: { a: 'A', b: 'B' } };
  const original = clone(input);
  Pointer.fromJSON('').set(input, { other: { c: 'C' } });
  expect(input).toStrictEqual(original);
  // You might think, well, why? Why shouldn't we do it and then have a test:
  // t.deepEqual(input, {other: {c: 'C'}}, 'should replace whole object')
  // And true, we could hack that by removing the current properties and setting the new ones,
  // but that only works for the case of object-replacing-object;
  // the following is just as valid (though clearly impossible)...
  Pointer.fromJSON('').set(input, 'root');
  expect(input).toStrictEqual(original);
  // ...and it'd be weird to have it work for one but not the other.
  // See Issue #92 for more discussion of this limitation / behavior.
});

test('Pointer#set object existing', () => {
  const input = { obj: { a: 'A', b: 'B' } };
  Pointer.fromJSON('/obj/b').set(input, 'BBB');
  expect(input.obj.b).toBe('BBB');
});

test('Pointer#set object new', () => {
  const input: any = { obj: { a: 'A', b: 'B' } };
  Pointer.fromJSON('/obj/c').set(input, 'C');
  expect(input.obj.c).toBe('C');
});

test('Pointer#set deep object new', () => {
  const input: any = { obj: { subobj: { a: 'A', b: 'B' } } };
  Pointer.fromJSON('/obj/subobj/c').set(input, 'C');
  expect(input.obj.subobj.c).toBe('C');
});

test('Pointer#set not found', () => {
  const input: any = { obj: { a: 'A', b: 'B' } };
  const original = clone(input);
  Pointer.fromJSON('/notfound/c').set(input, 'C');
  expect(input).toStrictEqual(original);
  Pointer.fromJSON('/obj/notfound/c').set(input, 'C');
  expect(input).toStrictEqual(original);
  Pointer.fromJSON('/notfound/subobj/c').set(input, 'C');
  expect(input).toStrictEqual(original);
});
