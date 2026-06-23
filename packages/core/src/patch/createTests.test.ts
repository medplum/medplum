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
import type {
  AddOperation,
  CopyOperation,
  MoveOperation,
  RemoveOperation,
  ReplaceOperation,
  TestOperation,
} from './diff';
import { applyPatch, createTests } from './index';

test('simple patch', () => {
  // > For example, given the JSON document
  const obj = { itemCodes: ['123', '456', '789'] };

  // > and the following patch
  const patch: RemoveOperation[] = [{ op: 'remove', path: '/itemCodes/1' }];

  // > should generate the following test
  const expected: TestOperation[] = [{ op: 'test', path: '/itemCodes/1', value: '456' }];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);

  const actualApply = applyPatch(obj, actual);
  expect(actualApply).toStrictEqual([null]);
});

test('complex patch', () => {
  // > For example, given the JSON document
  const obj = {
    items: [
      {
        code: '123',
        description: 'item # 123',
        componentCodes: ['456', '789'],
      },
      {
        code: '456',
        description: 'item # 456',
        componentCodes: ['789'],
      },
      {
        code: '789',
        description: 'item # 789',
        componentCodes: [],
      },
    ],
  };

  // > and the following patch
  const patch: RemoveOperation[] = [{ op: 'remove', path: '/items/1' }];

  // > should generate the following test
  const expected: TestOperation[] = [
    {
      op: 'test',
      path: '/items/1',
      value: {
        code: '456',
        description: 'item # 456',
        componentCodes: ['789'],
      },
    },
  ];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);

  const actualApply = applyPatch(obj, actual);
  expect(actualApply).toStrictEqual([null]);
});

test('simple patch with add', () => {
  // > For example, given the JSON document
  const obj = { itemCodes: ['123', '456', '789'] };

  // > and the following patch
  const patch: AddOperation[] = [{ op: 'add', path: '/itemCodes/-', value: 'abc' }];

  // > should generate the following test
  const expected: TestOperation[] = [];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);
});

test('simple patch with move', () => {
  // > For example, given the JSON document
  const obj = { itemCodes: ['123', '456', '789'], alternateItemCodes: ['abc'] };

  // > and the following patch
  const patch: MoveOperation[] = [{ op: 'move', from: '/itemCodes/1', path: '/alternateItemCodes/0' }];

  // > should generate the following test
  const expected: TestOperation[] = [
    { op: 'test', path: '/alternateItemCodes/0', value: 'abc' },
    { op: 'test', path: '/itemCodes/1', value: '456' },
  ];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);

  const actualApply = applyPatch(obj, actual);
  expect(actualApply).toStrictEqual([null, null]);
});

test('simple patch with copy', () => {
  // > For example, given the JSON document
  const obj = { itemCodes: ['123', '456', '789'], alternateItemCodes: [] };

  // > and the following patch
  const patch: CopyOperation[] = [
    {
      op: 'copy',
      from: '/itemCodes/1',
      path: '/alternateItemCodes/0',
    },
  ];

  // > should generate the following test
  const expected: TestOperation[] = [
    { op: 'test', path: '/alternateItemCodes/0', value: undefined },
    { op: 'test', path: '/itemCodes/1', value: '456' },
  ];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);

  const actualApply = applyPatch(obj, actual);
  expect(actualApply).toStrictEqual([null, null]);
});

test('simple patch with replace', () => {
  // > For example, given the JSON document
  const obj = { itemCodes: ['123', '456', '789'] };

  // > and the following patch
  const patch: ReplaceOperation[] = [{ op: 'replace', path: '/itemCodes/1', value: 'abc' }];

  // > should generate the following test
  const expected: TestOperation[] = [{ op: 'test', path: '/itemCodes/1', value: '456' }];

  const actual = createTests(obj, patch);
  expect(actual).toStrictEqual(expected);

  const actualApply = applyPatch(obj, actual);
  expect(actualApply).toStrictEqual([null]);
});
