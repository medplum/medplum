import { decodeBase64, encodeBase64 } from './base64';

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
