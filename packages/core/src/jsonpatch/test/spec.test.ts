// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import type { Operation } from '../index';
import { applyPatch, createPatch } from '../index';
import { Pointer } from '../pointer';
import { clone } from '../util';
import spec_data from './spec.json';

// interface Spec {
//   name: string;
//   input: any;
//   patch: Operation[];
//   output: any;
//   results: (string | null)[];
//   diffable: boolean;
// }

// const spec_data = yaml.load(readFileSync(join(__dirname, 'spec.yaml'), { encoding: 'utf8' })) as Spec[];

test('JSON Pointer - rfc-examples', () => {
  // > For example, given the JSON document
  const obj = {
    foo: ['bar', 'baz'],
    '': 0,
    'a/b': 1,
    'c%d': 2,
    'e^f': 3,
    'g|h': 4,
    'i\\j': 5,
    "k'l": 6,
    ' ': 7,
    'm~n': 8,
  };

  // > The following JSON strings evaluate to the accompanying values
  const pointers = [
    { path: '', expected: obj },
    { path: '/foo', expected: ['bar', 'baz'] },
    { path: '/foo/0', expected: 'bar' },
    { path: '/', expected: 0 },
    { path: '/a~1b', expected: 1 },
    { path: '/c%d', expected: 2 },
    { path: '/e^f', expected: 3 },
    { path: '/g|h', expected: 4 },
    { path: '/i\\j', expected: 5 },
    { path: "/k'l", expected: 6 },
    { path: '/ ', expected: 7 },
    { path: '/m~0n', expected: 8 },
  ];

  pointers.forEach((pointer) => {
    const actual = Pointer.fromJSON(pointer.path).evaluate(obj).value;
    expect(actual).toStrictEqual(pointer.expected);
  });
});

test('JSON Pointer - package example', () => {
  const obj = {
    first: 'chris',
    last: 'brown',
    github: {
      account: {
        id: 'chbrown',
        handle: '@chbrown',
      },
      repos: ['amulet', 'twilight', 'rfc6902'],
      stars: [
        {
          owner: 'raspberrypi',
          repo: 'userland',
        },
        {
          owner: 'angular',
          repo: 'angular.js',
        },
      ],
    },
    'github/account': 'deprecated',
  };

  const pointers = [
    { path: '/first', expected: 'chris' },
    { path: '/github~1account', expected: 'deprecated' },
    { path: '/github/account/handle', expected: '@chbrown' },
    { path: '/github/repos', expected: ['amulet', 'twilight', 'rfc6902'] },
    { path: '/github/repos/2', expected: 'rfc6902' },
    { path: '/github/stars/0/repo', expected: 'userland' },
  ];

  pointers.forEach((pointer) => {
    const actual = Pointer.fromJSON(pointer.path).evaluate(obj).value;
    expect(actual).toEqual(pointer.expected);
  });
});

test('Specification format', () => {
  expect(spec_data.length).toBe(19);

  // use sorted values and sort() to emulate set equality
  const props = ['diffable', 'input', 'name', 'output', 'patch', 'results'];
  spec_data.forEach((spec) => {
    expect(Object.keys(spec).sort()).toEqual(props);
  });
});

// take the input, apply the patch, and check the actual result against the
// expected output
spec_data.forEach((spec) => {
  test(`patch ${spec.name}`, () => {
    // patch operations are applied to object in-place
    const actual = clone(spec.input);
    const expected = spec.output;
    const results = applyPatch(actual, spec.patch as Operation[]);
    expect(actual).toEqual(expected);
    // since errors are object instances, reduce them to strings to match
    // the spec's results, which has the type `Array<string | null>`
    const results_names = results.map((error) => (error ? error.name : error));
    expect(results_names).toEqual(spec.results);
  });
});

spec_data
  .filter((spec) => spec.diffable)
  .forEach((spec) => {
    test(`diff ${spec.name}`, () => {
      // we read this separately because patch is destructive and it's easier just to start with a blank slate
      // ignore spec items that are marked as not diffable
      // perform diff (create patch = list of operations) and check result against non-test patches in spec
      const actual = createPatch(spec.input, spec.output);
      const expected = spec.patch.filter((operation) => operation.op !== 'test');
      expect(actual).toEqual(expected);
    });
  });
