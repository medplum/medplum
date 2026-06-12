/* eslint-disable header/header */
/*
 * Copyright © 2014-2021 Christopher Brown <io@henrian.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Pointer } from './pointer';
import { clone } from './util';

test('Pointer.fromJSON empty', () => {
  expect(() => Pointer.fromJSON('')).not.toThrow();
});
test('Pointer.fromJSON slash', () => {
  expect(() => Pointer.fromJSON('/')).not.toThrow();
});
test('Pointer.fromJSON invalid', () => {
  expect(() => Pointer.fromJSON('a')).toThrow('Invalid JSON Pointer');
});

test('Pointer.parent', () => {
  const pointer = Pointer.fromJSON('/abc/-');
  const parent = pointer.parent();
  expect(parent.toString()).toStrictEqual('/abc');
  const grandParent = parent.parent();
  expect(grandParent.toString()).toStrictEqual('');
  const greatGrandParent = grandParent.parent();
  expect(greatGrandParent.toString()).toStrictEqual('');
});

const example = { bool: false, arr: [10, 20, 30], obj: { a: 'A', b: 'B' } };

test('Pointer#get bool', () => {
  expect(Pointer.fromJSON('/bool').get(example)).toStrictEqual(false);
});
test('Pointer#get array', () => {
  expect(Pointer.fromJSON('/arr/1').get(example)).toStrictEqual(20);
});
test('Pointer#get object', () => {
  expect(Pointer.fromJSON('/obj/b').get(example)).toStrictEqual('B');
});
test('Pointer#push', () => {
  const pointer = Pointer.fromJSON('/obj');
  pointer.push('a');
  expect(pointer.toString()).toStrictEqual('/obj/a');
});
test('Pointer#get∘push', () => {
  const pointer = Pointer.fromJSON('/obj');
  pointer.push('a');
  expect(pointer.get(example)).toStrictEqual('A');
});

test('Pointer#set bool', () => {
  const input = { bool: true };
  Pointer.fromJSON('/bool').set(input, false);
  expect(input.bool).toStrictEqual(false);
});

test('Pointer#set array middle', () => {
  const input: any = { arr: ['10', '20', '30'] };
  Pointer.fromJSON('/arr/1').set(input, 0);
  expect(input.arr[1]).toStrictEqual(0);
});

test('Pointer#set array beyond', () => {
  const input: any = { arr: ['10', '20', '30'] };
  Pointer.fromJSON('/arr/3').set(input, 40);
  expect(input.arr[3]).toStrictEqual(40);
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
  expect(input.obj.b).toStrictEqual('BBB');
});

test('Pointer#set object new', () => {
  const input: any = { obj: { a: 'A', b: 'B' } };
  Pointer.fromJSON('/obj/c').set(input, 'C');
  expect(input.obj.c).toStrictEqual('C');
});

test('Pointer#set deep object new', () => {
  const input: any = { obj: { subobj: { a: 'A', b: 'B' } } };
  Pointer.fromJSON('/obj/subobj/c').set(input, 'C');
  expect(input.obj.subobj.c).toStrictEqual('C');
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
