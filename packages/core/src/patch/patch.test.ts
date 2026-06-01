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
import { applyPatch } from './index';

test('broken add', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'add', path: '/a/b', value: 1 }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken add (array does not exist)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'add', path: '/tag/-', value: 1 }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('working add (array exists)', () => {
  const user = { id: 'chbrown', tag: [] };
  const results = applyPatch(user, [{ op: 'add', path: '/tag/-', value: 123 }]);
  expect(results).toStrictEqual([null]);
  expect(user).toStrictEqual({ id: 'chbrown', tag: [123] });
});

test('working add (array exists and non-empty)', () => {
  const user = { id: 'chbrown', tag: [999] };
  const results = applyPatch(user, [{ op: 'add', path: '/tag/-', value: 123 }]);
  expect(results).toStrictEqual([null]);
  expect(user).toStrictEqual({ id: 'chbrown', tag: [999, 123] });
});

test('broken remove', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'remove', path: '/name' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken replace', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'replace', path: '/name', value: 1 }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken replace (array)', () => {
  const users = [{ id: 'chbrown' }];
  const results = applyPatch(users, [{ op: 'replace', path: '/1', value: { id: 'chbrown2' } }]);
  // cf. issues/36
  expect(users).toStrictEqual([{ id: 'chbrown' }]);
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken move (from)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'move', from: '/name', path: '/id' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken move (path)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'move', from: '/id', path: '/a/b' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken copy (from)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'copy', from: '/name', path: '/id' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('broken copy (path)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'copy', from: '/id', path: '/a/b' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

// Option: implicitArrayCreation

test('creates missing top-level array', () => {
  const object = {};
  const results = applyPatch(object, [{ op: 'add', path: '/identifier/-', value: { system: 'mrn' } }], {
    implicitArrayCreation: true,
  });
  expect(results).toStrictEqual([null]);
  expect(object).toStrictEqual({ identifier: [{ system: 'mrn' }] });
});

test('creates missing nested array when parent exists', () => {
  const object = { meta: {} };
  const results = applyPatch(object, [{ op: 'add', path: '/meta/tag/-', value: 'x' }], { implicitArrayCreation: true });
  expect(results).toStrictEqual([null]);
  expect(object).toStrictEqual({ meta: { tag: ['x'] } });
});

test('multiple appends to created array', () => {
  const object = { meta: {} };
  const results = applyPatch(
    object,
    [
      { op: 'add', path: '/meta/tag/-', value: 'a' },
      { op: 'add', path: '/meta/tag/-', value: 'b' },
    ],
    { implicitArrayCreation: true }
  );
  expect(results).toStrictEqual([null, null]);
  expect(object).toStrictEqual({ meta: { tag: ['a', 'b'] } });
});

test('fails when parent object missing', () => {
  const object = {};
  const results = applyPatch(object, [{ op: 'add', path: '/meta/tag/-', value: 'x' }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails when parent is not object (value)', () => {
  const object = { meta: true };
  const results = applyPatch(object, [{ op: 'add', path: '/meta/tag/-', value: 'x' }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails when parent is not object (array)', () => {
  const object = { meta: [] };
  const results = applyPatch(object, [{ op: 'add', path: '/meta/tag/-', value: 'x' }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails when parent is not object (null)', () => {
  const object = { meta: null };
  const results = applyPatch(object, [{ op: 'add', path: '/meta/tag/-', value: 'x' }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails on existing non-array property (value)', () => {
  const object = { a: 1 };
  const results = applyPatch(object, [{ op: 'add', path: '/a/-', value: 2 }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails on existing non-array property (object)', () => {
  const object = { a: { b: 2 } };
  const results = applyPatch(object, [{ op: 'add', path: '/a/-', value: 2 }], { implicitArrayCreation: true });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('fails on non-terminal /-', () => {
  const object = {};
  const results = applyPatch(object, [{ op: 'add', path: '/list/-/name', value: 'x' }], {
    implicitArrayCreation: true,
  });
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});
