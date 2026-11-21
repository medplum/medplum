// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Also runs in the `@medplum/core-node` project (see vite.config.ts)
import { vi } from 'vitest';
import { decodeBase64, decodeBase64Url, encodeBase64, encodeBase64Url } from './base64';
import { getBuffer, getWindow } from './environment';

// Spy without replacing, so other tests use the real environment
vi.mock('./environment', { spy: true });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Base64', () => {
  test('works', () => {
    const encoded = encodeBase64('Hello world');
    expect(encoded).toBe('SGVsbG8gd29ybGQ=');

    const decoded = decodeBase64(encoded);
    expect(decoded).toBe('Hello world');

    const encodedUnicode = encodeBase64('👋🌍');
    expect(encodedUnicode).toBe('8J+Ri/CfjI0=');

    const decodedUnicode = decodeBase64(encodedUnicode);
    expect(decodedUnicode).toBe('👋🌍');
  });

  test('Error', () => {
    vi.mocked(getWindow).mockReturnValue(undefined);
    vi.mocked(getBuffer).mockReturnValue(undefined);

    expect(() => encodeBase64('Hello world')).toThrow('Unable to encode base64');
    expect(() => decodeBase64('SGVsbG8gd29ybGQ=')).toThrow('Unable to decode base64');
  });
});

describe('Base64URL', () => {
  const paddingString = 'Hello world';
  const paddingStringBase64Url = 'SGVsbG8gd29ybGQ';
  const unicodeString = '👋🌍';
  const unicodeStringBase64Url = '8J-Ri_CfjI0';

  test('works', () => {
    expect(encodeBase64Url(paddingString)).toBe(paddingStringBase64Url);
    expect(encodeBase64Url(unicodeString)).toBe(unicodeStringBase64Url);

    expect(decodeBase64Url(paddingStringBase64Url)).toBe(paddingString);
    expect(decodeBase64Url(unicodeStringBase64Url)).toBe(unicodeString);
  });
});
