// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import { applyPatch, createPatch } from '../index';
import { clone } from '../util';

const pairs = [
  [['A', 'Z', 'Z'], ['A']],
  [
    ['A', 'B'],
    ['B', 'A'],
  ],
  [[], ['A', 'B']],
  [
    ['B', 'A', 'M'],
    ['M', 'A', 'A'],
  ],
  [['A', 'A', 'R'], []],
  [
    ['A', 'B', 'C'],
    ['B', 'C', 'D'],
  ],
  [
    ['A', 'C'],
    ['A', 'B', 'C'],
  ],
  [
    ['A', 'B', 'C'],
    ['A', 'Z'],
  ],
];

// pairs.forEach(([input, output]) => {
//   test(`diff+patch: [${input}] => [${output}]`, (t) => {
//     const patch = createPatch(input, output);
//     const actual_output = clone(input);
//     applyPatch(actual_output, patch);
//     t.deepEqual(actual_output, output, 'should apply produced patch to arrive at output');
//   });
// });

// Convert the above to jest jest-each:

// import each from 'jest-each'

test.each(pairs)('diff+patch: %j => %j', (input, output) => {
  const patch = createPatch(input, output);
  const actual_output = clone(input);
  applyPatch(actual_output, patch);
  expect(actual_output).toStrictEqual(output);
});
