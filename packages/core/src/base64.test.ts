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
  });

  test('Node.js', () => {
    Object.defineProperty(globalThis, 'Buffer', { get: () => originalBuffer });
    Object.defineProperty(globalThis, 'window', { get: () => undefined });

    const encoded = encodeBase64('Hello world');
    expect(encoded).toBe('SGVsbG8gd29ybGQ=');

    const decoded = decodeBase64(encoded);
    expect(decoded).toBe('Hello world');
  });

  test('Error', () => {
    Object.defineProperty(globalThis, 'Buffer', { get: () => undefined });
    Object.defineProperty(globalThis, 'window', { get: () => undefined });

    try {
      encodeBase64('Hello world');
      throw new Error('Expected error');
    } catch (e) {
      expect((e as Error).message).toBe('Unable to encode base64');
    }

    try {
      decodeBase64('SGVsbG8gd29ybGQ=');
      throw new Error('Expected error');
    } catch (e) {
      expect((e as Error).message).toBe('Unable to decode base64');
    }
  });
});
