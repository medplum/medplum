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

import type { AddOperation, Operation } from './diff';
import { applyPatch, createPatch } from './index';
import { Pointer } from './pointer';
import { clone } from './util';

interface Spec {
  name: string;
  input: any;
  patch: Operation[];
  output: any;
  results: (string | null)[];
  diffable: boolean;
}

// const spec_data = yaml.load(readFileSync(join(__dirname, 'spec.yaml'), { encoding: 'utf8' })) as Spec[];
const specData: Spec[] = [
  {
    name: 'A.1. Adding an Object Member',
    input: {
      foo: 'bar',
    },
    patch: [
      {
        op: 'add',
        path: '/baz',
        value: 'qux',
      },
    ],
    output: {
      baz: 'qux',
      foo: 'bar',
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.2. Adding an Array Element',
    input: {
      foo: ['bar', 'baz'],
    },
    patch: [
      {
        op: 'add',
        path: '/foo/1',
        value: 'qux',
      },
    ],
    output: {
      foo: ['bar', 'qux', 'baz'],
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.3. Removing an Object Member',
    input: {
      baz: 'qux',
      foo: 'bar',
    },
    patch: [
      {
        op: 'remove',
        path: '/baz',
      },
    ],
    output: {
      foo: 'bar',
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.4. Removing an Array Element',
    input: {
      foo: ['bar', 'qux', 'baz'],
    },
    patch: [
      {
        op: 'remove',
        path: '/foo/1',
      },
    ],
    output: {
      foo: ['bar', 'baz'],
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.5. Replacing a Value',
    input: {
      baz: 'qux',
      foo: 'bar',
    },
    patch: [
      {
        op: 'replace',
        path: '/baz',
        value: 'boo',
      },
    ],
    output: {
      baz: 'boo',
      foo: 'bar',
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.6. Moving a Value',
    input: {
      foo: {
        bar: 'baz',
        waldo: 'fred',
      },
      qux: {
        corge: 'grault',
      },
    },
    patch: [
      {
        op: 'move',
        from: '/foo/waldo',
        path: '/qux/thud',
      },
    ],
    output: {
      foo: {
        bar: 'baz',
      },
      qux: {
        corge: 'grault',
        thud: 'fred',
      },
    },
    results: [null],
    diffable: false,
  },
  {
    name: 'A.7. Moving an Array Element',
    input: {
      foo: ['all', 'grass', 'cows', 'eat'],
    },
    patch: [
      {
        op: 'move',
        from: '/foo/1',
        path: '/foo/3',
      },
    ],
    output: {
      foo: ['all', 'cows', 'eat', 'grass'],
    },
    results: [null],
    diffable: false,
  },
  {
    name: 'A.8. Testing a Value: Success',
    input: {
      baz: 'qux',
      foo: ['a', 2, 'c'],
    },
    patch: [
      {
        op: 'test',
        path: '/baz',
        value: 'qux',
      },
      {
        op: 'test',
        path: '/foo/1',
        value: 2,
      },
    ],
    output: {
      baz: 'qux',
      foo: ['a', 2, 'c'],
    },
    results: [null, null],
    diffable: true,
  },
  {
    name: 'A.9. Testing a Value: Error',
    input: {
      baz: 'qux',
    },
    patch: [
      {
        op: 'test',
        path: '/baz',
        value: 'bar',
      },
    ],
    output: {
      baz: 'qux',
    },
    results: ['TestError'],
    diffable: false,
  },
  {
    name: 'A.10. Adding a Nested Member Object',
    input: {
      foo: 'bar',
    },
    patch: [
      {
        op: 'add',
        path: '/child',
        value: {
          grandchild: {},
        },
      },
    ],
    output: {
      foo: 'bar',
      child: {
        grandchild: {},
      },
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.11. Ignoring Unrecognized Elements',
    input: {
      foo: 'bar',
    },
    patch: [
      {
        op: 'add',
        path: '/baz',
        value: 'qux',
        xyz: 123,
      } as AddOperation,
    ],
    output: {
      foo: 'bar',
      baz: 'qux',
    },
    results: [null],
    diffable: false,
  },
  {
    name: 'A.12. Adding to a Nonexistent Target',
    input: {
      foo: 'bar',
    },
    patch: [
      {
        op: 'add',
        path: '/baz/bat',
        value: 'qux',
      },
    ],
    output: {
      foo: 'bar',
    },
    results: ['MissingError'],
    diffable: false,
  },
  {
    name: 'A.13.2 Invalid JSON Patch Document',
    input: {
      foo: 'bar',
    },
    patch: [
      {
        op: 'transcend',
        path: '/baz',
        value: 'qux',
      } as unknown as Operation,
    ],
    output: {
      foo: 'bar',
    },
    results: ['InvalidOperationError'],
    diffable: false,
  },
  {
    name: 'A.14. ~ Escape Ordering',
    input: {
      '/': 9,
      '~1': 10,
    },
    patch: [
      {
        op: 'test',
        path: '/~01',
        value: 10,
      },
    ],
    output: {
      '/': 9,
      '~1': 10,
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'A.15. Comparing Strings and Numbers',
    input: {
      '/': 9,
      '~1': 10,
    },
    patch: [
      {
        op: 'test',
        path: '/~01',
        value: '10',
      },
    ],
    output: {
      '/': 9,
      '~1': 10,
    },
    results: ['TestError'],
    diffable: false,
  },
  {
    name: 'A.16. Adding an Array Value',
    input: {
      foo: ['bar'],
    },
    patch: [
      {
        op: 'add',
        path: '/foo/-',
        value: ['abc', 'def'],
      },
    ],
    output: {
      foo: ['bar', ['abc', 'def']],
    },
    results: [null],
    diffable: true,
  },
  {
    name: 'Test types (failure)',
    input: {
      whole: 3,
      ish: '3.14',
      parts: [3, 141, 592, 654],
      exact: false,
      natural: null,
      approximation: 'true',
      float: {
        significand: 314,
        exponent: -2,
      },
    },
    output: {
      whole: 3,
      ish: '3.14',
      parts: [3, 141, 592, 654],
      exact: false,
      natural: null,
      approximation: 'true',
      float: {
        significand: 314,
        exponent: -2,
      },
    },
    patch: [
      {
        op: 'test',
        path: '/whole',
        value: '3',
      },
      {
        op: 'test',
        path: '/ish',
        value: 3.14,
      },
      {
        op: 'test',
        path: '/parts',
        value: '3,141,592,654',
      },
      {
        op: 'test',
        path: '/parts/3',
        value: 654.001,
      },
      {
        op: 'test',
        path: '/natural',
      } as Operation,
      {
        op: 'test',
        path: '/approximation',
        value: true,
      },
      {
        op: 'test',
        path: '/float',
        value: [
          ['significand', 314],
          ['exponent', -2],
        ],
      },
    ],
    results: ['TestError', 'TestError', 'TestError', 'TestError', 'TestError', 'TestError', 'TestError'],
    diffable: false,
  },
  {
    name: 'Test types (success)',
    input: {
      whole: 3,
      ish: '3.14',
      parts: [3, 141, 592, 654],
      exact: false,
      natural: null,
      approximation: 'true',
      float: {
        significand: 314,
        exponent: -2,
      },
    },
    output: {
      whole: 3,
      ish: '3.14',
      parts: [3, 141, 592, 654],
      exact: false,
      natural: null,
      approximation: 'true',
      float: {
        significand: 314,
        exponent: -2,
      },
    },
    patch: [
      {
        op: 'test',
        path: '/whole',
        value: 3,
      },
      {
        op: 'test',
        path: '/ish',
        value: '3.14',
      },
      {
        op: 'test',
        path: '/parts',
        value: [3, 141, 592, 654],
      },
      {
        op: 'test',
        path: '/parts/3',
        value: 654,
      },
      {
        op: 'test',
        path: '/natural',
        value: null,
      },
      {
        op: 'test',
        path: '/approximation',
        value: 'true',
      },
      {
        op: 'test',
        path: '/float',
        value: {
          significand: 314,
          exponent: -2,
        },
      },
    ],
    results: [null, null, null, null, null, null, null],
    diffable: true,
  },
  {
    name: 'Array vs. Object',
    input: {
      repositories: ['amulet', 'flickr-with-uploads'],
    },
    output: {
      repositories: {},
    },
    patch: [
      {
        op: 'replace',
        path: '/repositories',
        value: {},
      },
    ],
    results: [null],
    diffable: true,
  },
];

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
    expect(actual).toStrictEqual(pointer.expected);
  });
});

test('Specification format', () => {
  expect(specData).toHaveLength(19);
  // use sorted values and sort() to emulate set equality
  const props = ['diffable', 'input', 'name', 'output', 'patch', 'results'];
  specData.forEach((spec) => {
    expect(Object.keys(spec).sort()).toStrictEqual(props);
  });
});

// take the input, apply the patch, and check the actual result against the
// expected output
test.each(specData)(`patch $name`, (spec) => {
  // patch operations are applied to object in-place
  const actual = clone(spec.input);
  const expected = spec.output;
  const results = applyPatch(actual, spec.patch);
  expect(actual).toStrictEqual(expected);
  // since errors are object instances, reduce them to strings to match
  // the spec's results, which has the type `Array<string | null>`
  const results_names = results.map((error) => (error ? error.name : error));
  expect(results_names).toStrictEqual(spec.results);
});

test.each(specData.filter((s) => s.diffable))(`diff $name`, (spec) => {
  // we read this separately because patch is destructive and it's easier just to start with a blank slate
  // ignore spec items that are marked as not diffable
  // perform diff (create patch = list of operations) and check result against non-test patches in spec
  const actual = createPatch(spec.input, spec.output);
  const expected = spec.patch.filter((operation) => operation.op !== 'test');
  expect(actual).toStrictEqual(expected);
});
