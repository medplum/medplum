// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension } from '@medplum/fhirtypes';
import { getExtensions } from './extension';
import { getPath, withPath } from './withpath';

const URL_A = 'http://example.com/ext-a';
const URL_B = 'http://example.com/ext-b';
const URL_C = 'http://example.com/ext-c';

describe('getExtensions', () => {
  test('returns empty array when extension array is absent', () => {
    const extensible = withPath({}, 'root');
    expect(getExtensions(extensible, URL_A)).toEqual([]);
  });

  test('returns empty array when extension array is empty', () => {
    const extensible = withPath(
      {
        extension: [],
      },
      'root'
    );
    expect(getExtensions(extensible, URL_A)).toEqual([]);
  });

  test('returns empty array when no extension matches', () => {
    const obj = withPath(
      {
        extension: [{ url: URL_B, valueString: 'nope' }],
      },
      'root'
    );
    expect(getExtensions(obj, URL_A)).toEqual([]);
  });

  test('returns all matching extensions for a single URL', () => {
    const obj = withPath(
      {
        extension: [
          { url: URL_A, valueString: 'first' },
          { url: URL_B, valueString: 'skip' },
          { url: URL_A, valueString: 'second' },
        ],
      },
      'root'
    );
    const result = getExtensions(obj, URL_A);
    expect(result).toHaveLength(2);
    expect(result[0].valueString).toBe('first');
    expect(result[1].valueString).toBe('second');
  });

  test('path uses original array index, not filtered index', () => {
    const obj = withPath(
      {
        extension: [
          { url: URL_B, valueString: 'skip' },
          { url: URL_A, valueString: 'match' },
        ],
      },
      'root'
    );
    const [ext] = getExtensions(obj, URL_A);
    expect(getPath(ext)).toBe('root.extension[1]');
  });

  test('returns empty array when called with an empty URL array', () => {
    const obj = withPath({}, 'root');
    expect(getExtensions(obj, [])).toEqual([]);
  });

  describe('nested URL traversal', () => {
    // Build a complex extension: extension[0] has URL_A containing two URL_B sub-extensions,
    // and extension[1] has URL_A containing one URL_B sub-extension. URL_C extensions are noise.
    const obj = withPath(
      {
        extension: [
          {
            url: URL_A,
            extension: [
              { url: URL_B, valueString: 'ab0' },
              { url: URL_C, valueString: 'skip' },
              { url: URL_B, valueString: 'ab1' },
            ],
          },
          { url: URL_C, valueString: 'noise' },
          {
            url: URL_A,
            extension: [{ url: URL_B, valueString: 'ab2' }],
          },
        ] as Extension[],
      },
      'root'
    );

    test('finds all leaf extensions matching a two-level URL path', () => {
      const result = getExtensions(obj, [URL_A, URL_B]);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.valueString)).toEqual(['ab0', 'ab1', 'ab2']);
    });

    test('leaf paths reflect the full nesting chain', () => {
      const result = getExtensions(obj, [URL_A, URL_B]);
      expect(getPath(result[0])).toBe('root.extension[0].extension[0]');
      expect(getPath(result[1])).toBe('root.extension[0].extension[2]');
      expect(getPath(result[2])).toBe('root.extension[2].extension[0]');
    });

    test('returns empty array when outer URL matches but inner URL does not', () => {
      expect(getExtensions(obj, [URL_A, URL_C + '-nope'])).toEqual([]);
    });

    test('finds three-level nested extensions', () => {
      const deep = {
        extension: [
          {
            url: URL_A,
            extension: [
              {
                url: URL_B,
                extension: [{ url: URL_C, valueString: 'deep' }],
              },
            ],
          },
        ] as Extension[],
      };
      const result = getExtensions(withPath(deep, 'root'), [URL_A, URL_B, URL_C]);
      expect(result).toHaveLength(1);
      expect(result[0].valueString).toBe('deep');
      expect(getPath(result[0])).toBe('root.extension[0].extension[0].extension[0]');
    });
  });
});
