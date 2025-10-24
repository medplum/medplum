// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { decodeBase64, decodeBase64Url, encodeBase64, encodeBase64Url } from './base64';

// Mock the environment module
jest.mock('./environment');

import * as environment from './environment';

const mockEnvironment = environment as jest.Mocked<typeof environment>;

describe('Base64', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('Browser', () => {
    // Mock browser environment
    mockEnvironment.isBrowserEnvironment.mockReturnValue(true);
    mockEnvironment.isNodeEnvironment.mockReturnValue(false);
    mockEnvironment.getWindow.mockReturnValue(window as any);

    const encoded = encodeBase64('Hello world');
    expect(encoded).toBe('SGVsbG8gd29ybGQ=');

    const decoded = decodeBase64(encoded);
    expect(decoded).toBe('Hello world');

    const encodedUnicode = encodeBase64('👋🌍');
    expect(encodedUnicode).toBe('8J+Ri/CfjI0=');

    const decodedUnicode = decodeBase64(encodedUnicode);
    expect(decodedUnicode).toBe('👋🌍');
  });

  test('Node.js', () => {
    // Mock Node.js environment
    mockEnvironment.isBrowserEnvironment.mockReturnValue(false);
    mockEnvironment.isNodeEnvironment.mockReturnValue(true);
    mockEnvironment.getBuffer.mockReturnValue(Buffer as any);

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
    // Mock environment with neither browser nor Node.js
    mockEnvironment.isBrowserEnvironment.mockReturnValue(false);
    mockEnvironment.isNodeEnvironment.mockReturnValue(false);

    expect(() => encodeBase64('Hello world')).toThrow('Unable to encode base64');
    expect(() => decodeBase64('SGVsbG8gd29ybGQ=')).toThrow('Unable to decode base64');
  });
});

describe('Base64URL', () => {
  const paddingString = 'Hello world';
  const paddingStringBase64Url = 'SGVsbG8gd29ybGQ';
  const unicodeString = '👋🌍';
  const unicodeStringBase64Url = '8J-Ri_CfjI0';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('Browser', () => {
    // Mock browser environment
    mockEnvironment.isBrowserEnvironment.mockReturnValue(true);
    mockEnvironment.isNodeEnvironment.mockReturnValue(false);
    mockEnvironment.getWindow.mockReturnValue(window as any);

    // Test encoding
    expect(encodeBase64Url(paddingString)).toBe(paddingStringBase64Url);
    expect(encodeBase64Url(unicodeString)).toBe(unicodeStringBase64Url);

    // Test decoding
    expect(decodeBase64Url(paddingStringBase64Url)).toBe(paddingString);
    expect(decodeBase64Url(unicodeStringBase64Url)).toBe(unicodeString);
  });

  test('Node.js', () => {
    // Mock Node.js environment
    mockEnvironment.isBrowserEnvironment.mockReturnValue(false);
    mockEnvironment.isNodeEnvironment.mockReturnValue(true);
    mockEnvironment.getBuffer.mockReturnValue(Buffer as any);

    // Test encoding
    expect(encodeBase64Url(paddingString)).toBe(paddingStringBase64Url);
    expect(encodeBase64Url(unicodeString)).toBe(unicodeStringBase64Url);

    // Test decoding
    expect(decodeBase64Url(paddingStringBase64Url)).toBe(paddingString);
    expect(decodeBase64Url(unicodeStringBase64Url)).toBe(unicodeString);
  });
});
