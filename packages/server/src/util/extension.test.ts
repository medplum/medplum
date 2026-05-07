// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension } from '@medplum/fhirtypes';
import {
  assertExtensionBoolean,
  assertExtensionCode,
  assertExtensionDuration,
  assertExtensionReference,
  assertExtensionTime,
  getExtensions,
} from './extension';
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

describe('assertExtensionBoolean', () => {
  test('passes when valueBoolean is true', () => {
    const ext = withPath({ url: 'http://example.com', valueBoolean: true }, 'root');
    expect(() => assertExtensionBoolean(ext)).not.toThrow();
  });

  test('passes when valueBoolean is false', () => {
    const ext = withPath({ url: 'http://example.com', valueBoolean: false }, 'root');
    expect(() => assertExtensionBoolean(ext)).not.toThrow();
  });

  test('throws when valueBoolean is missing', () => {
    const ext = withPath({ url: 'http://example.com' }, 'root');
    expect(() => assertExtensionBoolean(ext)).toThrow('Extension valueBoolean missing');
  });

  test('throws when valueBoolean has wrong type', () => {
    const ext = withPath({ url: 'http://example.com', valueBoolean: 'true' as unknown as boolean }, 'root');
    expect(() => assertExtensionBoolean(ext)).toThrow('Extension valueBoolean has wrong type');
  });
});

describe('assertExtensionCode', () => {
  test('passes when valueCode is a string', () => {
    const ext = withPath({ url: 'http://example.com', valueCode: 'active' }, 'root');
    expect(() => assertExtensionCode(ext)).not.toThrow();
  });

  test('throws when valueCode is missing', () => {
    const ext = withPath({ url: 'http://example.com' }, 'root');
    expect(() => assertExtensionCode(ext)).toThrow('Extension valueCode missing');
  });

  test('throws when valueCode has wrong type', () => {
    const ext = withPath({ url: 'http://example.com', valueCode: 42 as unknown as string }, 'root');
    expect(() => assertExtensionCode(ext)).toThrow('Extension valueCode has wrong type');
  });
});

describe('assertExtensionDuration', () => {
  test('passes when valueDuration is present', () => {
    const ext = withPath({ url: 'http://example.com', valueDuration: { value: 30, unit: 'min' } }, 'root');
    expect(() => assertExtensionDuration(ext)).not.toThrow();
  });

  test('throws when valueDuration is missing', () => {
    const ext = withPath({ url: 'http://example.com' }, 'root');
    expect(() => assertExtensionDuration(ext)).toThrow('Extension valueDuration missing');
  });

  test('throws when valueDuration has wrong type', () => {
    const ext = withPath({ url: 'http://example.com', valueDuration: 'invalid' as any }, 'root');
    expect(() => assertExtensionDuration(ext)).toThrow('Extension valueDuration has wrong type');
  });
});

describe('assertExtensionReference', () => {
  test('passes for a valid reference without resourceType constraint', () => {
    const ext = withPath({ url: 'http://example.com', valueReference: { reference: 'Patient/123' } }, 'root');
    expect(() => assertExtensionReference(ext)).not.toThrow();
  });

  test('passes for a valid reference matching the expected resourceType', () => {
    const ext = withPath({ url: 'http://example.com', valueReference: { reference: 'Patient/123' } }, 'root');
    expect(() => assertExtensionReference(ext, 'Patient')).not.toThrow();
  });

  test('throws when valueReference is missing', () => {
    const ext = withPath({ url: 'http://example.com' }, 'root');
    expect(() => assertExtensionReference(ext)).toThrow('Extension valueReference missing');
  });

  test('throws when valueReference has no reference string', () => {
    const ext = withPath({ url: 'http://example.com', valueReference: {} }, 'root');
    expect(() => assertExtensionReference(ext)).toThrow('Extension valueReference invalid');
  });

  test('throws when valueReference is wrong resourceType', () => {
    const ext = withPath({ url: 'http://example.com', valueReference: { reference: 'Practitioner/456' } }, 'root');
    expect(() => assertExtensionReference(ext, 'Patient')).toThrow('Extension valueReference invalid');
  });
});

describe('assertExtensionTime', () => {
  test('passes when valueTime is a string', () => {
    const ext = withPath({ url: 'http://example.com', valueTime: '09:00:00' }, 'root');
    expect(() => assertExtensionTime(ext)).not.toThrow();
  });

  test('throws when valueTime is missing', () => {
    const ext = withPath({ url: 'http://example.com' }, 'root');
    expect(() => assertExtensionTime(ext)).toThrow('Extension valueTime missing');
  });

  test('throws when valueTime has wrong type', () => {
    const ext = withPath({ url: 'http://example.com', valueTime: 900 as unknown as string }, 'root');
    expect(() => assertExtensionTime(ext)).toThrow('Extension valueTime has wrong type');
  });
});
