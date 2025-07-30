import { decodeBase64, decodeBase64Url, encodeBase64, encodeBase64Url } from './base64';

const originalWindow = globalThis.window;
const originalBuffer = globalThis.Buffer;

describe('Base64', () => {
  test('Browser', () => {
    Object.defineProperty(globalThis, 'Buffer', { get: () => undefined });
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });

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
    Object.defineProperty(globalThis, 'Buffer', { get: () => originalBuffer });
    Object.defineProperty(globalThis, 'window', { get: () => undefined });

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
    Object.defineProperty(globalThis, 'Buffer', { get: () => undefined });
    Object.defineProperty(globalThis, 'window', { get: () => undefined });

    expect(() => encodeBase64('Hello world')).toThrow('Unable to encode base64');
    expect(() => decodeBase64('SGVsbG8gd29ybGQ=')).toThrow('Unable to decode base64');
  });
});

describe('Base64URL', () => {
  const paddingString = 'Hello world';
  const paddingStringBase64Url = 'SGVsbG8gd29ybGQ';
  const unicodeString = '👋🌍';
  const unicodeStringBase64Url = '8J-Ri_CfjI0';

  afterEach(() => {
    Object.defineProperty(globalThis, 'Buffer', { value: originalBuffer, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  });

  test('Browser', () => {
    Object.defineProperty(globalThis, 'Buffer', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });

    // Test encoding
    expect(encodeBase64Url(paddingString)).toBe(paddingStringBase64Url);
    expect(encodeBase64Url(unicodeString)).toBe(unicodeStringBase64Url);

    // Test decoding
    expect(decodeBase64Url(paddingStringBase64Url)).toBe(paddingString);
    expect(decodeBase64Url(unicodeStringBase64Url)).toBe(unicodeString);
  });

  test('Node.js', () => {
    Object.defineProperty(globalThis, 'Buffer', { value: originalBuffer, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });

    // Test encoding
    expect(encodeBase64Url(paddingString)).toBe(paddingStringBase64Url);
    expect(encodeBase64Url(unicodeString)).toBe(unicodeStringBase64Url);

    // Test decoding
    expect(decodeBase64Url(paddingStringBase64Url)).toBe(paddingString);
    expect(decodeBase64Url(unicodeStringBase64Url)).toBe(unicodeString);
  });
});
