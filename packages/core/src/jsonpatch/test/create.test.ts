// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import type {
  AddOperation,
  CopyOperation,
  MoveOperation,
  RemoveOperation,
  ReplaceOperation,
  TestOperation,
} from '../diff';
import { applyPatch, createTests } from '../index';

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
