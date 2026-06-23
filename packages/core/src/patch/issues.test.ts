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
import type { Operation, VoidableDiff } from './diff';
import { applyPatch, createPatch } from './index';
import type { Pointer } from './pointer';
import { clone } from './util';

function checkRoundtrip(
  input: any,
  output: any,
  expected_patch: Operation[],
  diff?: VoidableDiff,
  actual_patch: Operation[] = createPatch(input, output, diff)
): void {
  expect(actual_patch).toStrictEqual(expected_patch);
  const actual_output = clone(input);
  const patch_results = applyPatch(actual_output, actual_patch);
  expect(actual_output).toEqual(output);
  expect(patch_results.length).toStrictEqual(actual_patch.length);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
}

test('issues/3', () => {
  const input = { arr: ['1', '2', '2'] };
  const output = { arr: ['1'] };
  const expected_patch: Operation[] = [
    { op: 'remove', path: '/arr/1' },
    { op: 'remove', path: '/arr/1' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/4', () => {
  const input = ['A', 'B'];
  const output = ['B', 'A'];
  const expected_patch: Operation[] = [
    { op: 'add', path: '/0', value: 'B' },
    { op: 'remove', path: '/2' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/5', () => {
  const input: string[] = [];
  const output = ['A', 'B'];
  const expected_patch: Operation[] = [
    { op: 'add', path: '/-', value: 'A' },
    { op: 'add', path: '/-', value: 'B' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/9', () => {
  const input = [{ A: 1, B: 2 }, { C: 3 }];
  const output = [{ A: 1, B: 20 }, { C: 3 }];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0/B', value: 20 }];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/12', () => {
  const input = { name: 'ABC', repositories: ['a', 'e'] };
  const output = { name: 'ABC', repositories: ['a', 'b', 'c', 'd', 'e'] };
  const expected_patch: Operation[] = [
    { op: 'add', path: '/repositories/1', value: 'b' },
    { op: 'add', path: '/repositories/2', value: 'c' },
    { op: 'add', path: '/repositories/3', value: 'd' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/15', () => {
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (input instanceof Date && output instanceof Date && input.valueOf() !== output.valueOf()) {
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };
  const input = { date: new Date(0) };
  const output = { date: new Date(1) };
  const expected_patch: Operation[] = [{ op: 'replace', path: '/date', value: new Date(1) }];
  checkRoundtrip(input, output, expected_patch, customDiff);
});

test('issues/15/array', () => {
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (input instanceof Date && output instanceof Date && input.valueOf() !== output.valueOf()) {
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };
  const input = [new Date(0)];
  const output = [new Date(1)];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0', value: new Date(1) }];
  checkRoundtrip(input, output, expected_patch, customDiff);
});

test('issues/29', () => {
  // Custom diff function that short-circuits recursion when the last token
  // in the current pointer is the key "stop_recursing", such that that key's
  // values are compared as primitives rather than objects/arrays.
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (ptr.tokens[ptr.tokens.length - 1] === 'stop_recursing') {
      // do not compare arrays, replace instead
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };

  const input = {
    normal: ['a', 'b'],
    stop_recursing: ['a', 'b'],
  };
  const output = {
    normal: ['a'],
    stop_recursing: ['a'],
  };
  const expected_patch: Operation[] = [
    { op: 'remove', path: '/normal/1' },
    { op: 'replace', path: '/stop_recursing', value: ['a'] },
  ];
  const actual_patch = createPatch(input, output, customDiff);
  checkRoundtrip(input, output, expected_patch, undefined, actual_patch);

  const nested_input = { root: input };
  const nested_output = { root: output };
  const nested_expected_patch: Operation[] = [
    { op: 'remove', path: '/root/normal/1' },
    { op: 'replace', path: '/root/stop_recursing', value: ['a'] },
  ];
  const nested_actual_patch = createPatch(nested_input, nested_output, customDiff);
  checkRoundtrip(nested_input, nested_output, nested_expected_patch, undefined, nested_actual_patch);
});

test('issues/32', () => {
  const input = 'a';
  const output = 'b';
  const expected_patch: Operation[] = [{ op: 'replace', path: '', value: 'b' }];
  const actual_patch = createPatch(input, output);
  expect(actual_patch).toStrictEqual(expected_patch);
  const actual_output = clone(input);
  const results = applyPatch(input, actual_patch);
  expect(actual_output).toStrictEqual('a');
  expect(results.map((r) => r?.name)).toStrictEqual(['MissingError']);
});

test('issues/33', () => {
  const object = { root: { 0: 4 } };
  const array = { root: [4] };
  checkRoundtrip(object, array, [{ op: 'replace', path: '/root', value: [4] }]);
  checkRoundtrip(array, object, [{ op: 'replace', path: '/root', value: { 0: 4 } }]);
});

test('issues/34', () => {
  const input = [3, 4];
  const output = [3, 4];
  delete output[0];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0', value: undefined }];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/35', () => {
  const input = { name: 'bob', image: undefined, cat: null };
  const output = { name: 'bob', image: 'foo.jpg', cat: 'nikko' };
  const expected_patch: Operation[] = [
    { op: 'add', path: '/image', value: 'foo.jpg' },
    { op: 'replace', path: '/cat', value: 'nikko' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/36', () => {
  const input = [undefined, 'B']; // same as: const input = ['A', 'B']; delete input[0]
  const output = ['A', 'B'];
  const expected_patch: Operation[] = [
    // could also be {op: 'add', ...} -- the spec isn't clear on what constitutes existence for arrays
    { op: 'replace', path: '/0', value: 'A' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/37', () => {
  const value = { id: 'chbrown' };
  const patch_results = applyPatch(value, [{ op: 'copy', from: '/id', path: '/name' }]);
  const expected_value = { id: 'chbrown', name: 'chbrown' };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
});

test('issues/38', () => {
  const value = {
    current: { timestamp: 23 },
    history: [],
  };
  const patch_results = applyPatch(value, [
    { op: 'copy', from: '/current', path: '/history/-' },
    { op: 'replace', path: '/current/timestamp', value: 24 },
    { op: 'copy', from: '/current', path: '/history/-' },
  ]);
  const expected_value = {
    current: { timestamp: 24 },
    history: [{ timestamp: 23 }, { timestamp: 24 }],
  };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
});

test('issues/44', () => {
  const value = {};
  const author = { firstName: 'Chris' };
  const patch_results = applyPatch(value, [
    { op: 'add', path: '/author', value: author },
    { op: 'add', path: '/author/lastName', value: 'Brown' },
  ]);
  const expected_value = {
    author: { firstName: 'Chris', lastName: 'Brown' },
  };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
  expect(author).toStrictEqual({ firstName: 'Chris' });
});

test('issues/76', () => {
  expect(({} as any).polluted).toBeUndefined();
  const value = {};
  applyPatch(value, [{ op: 'add', path: '/__proto__/polluted', value: 'Hello!' }]);
  expect(({} as any).polluted).toBeUndefined();
});

test('issues/78', () => {
  const user: any = { firstName: 'Chris' };
  const patch_results = applyPatch(user, [{ op: 'add', path: '/createdAt', value: new Date('2010-08-10T22:10:48Z') }]);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
  expect(user['createdAt'].getTime()).toStrictEqual(1281478248000);
});

test('issues/97', () => {
  const commits: any[] = [];
  const user = { firstName: 'Chris', commits: ['80f1243'] };
  const patch_results = applyPatch(user, [
    { op: 'replace', path: '/commits', value: commits },
    { op: 'add', path: '/commits/-', value: '5d565c8' },
  ]);
  expect(patch_results.every((result) => result === null)).toBeTruthy();
  expect(user).toStrictEqual({ firstName: 'Chris', commits: ['5d565c8'] });
  expect(commits).toHaveLength(0);
});
