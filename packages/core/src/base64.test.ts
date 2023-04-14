import { decodeBase64, encodeBase64 } from './base64';

let originalWindow: (Window & typeof globalThis) | undefined = undefined;
let originalBuffer: BufferConstructor | undefined = undefined;

describe('Base64', () => {
  beforeEach(() => {
    originalWindow = globalThis.window;
    originalBuffer = globalThis.Buffer;
  });

  afterEach(() => {
    globalThis.window = originalWindow as Window & typeof globalThis;
    globalThis.Buffer = originalBuffer as BufferConstructor;
  });

  test('Browser', () => {
    delete (global as any).Buffer;

    const encoded = encodeBase64('Hello world');
    expect(encoded).toBe('SGVsbG8gd29ybGQ=');

    const decoded = decodeBase64(encoded);
    expect(decoded).toBe('Hello world');
  });

  test('Node.js', () => {
    delete (global as any).window;

    const encoded = encodeBase64('Hello world');
    expect(encoded).toBe('SGVsbG8gd29ybGQ=');

    const decoded = decodeBase64(encoded);
    expect(decoded).toBe('Hello world');
  });

  test('Error', () => {
    delete (global as any).window;
    delete (global as any).Buffer;

    try {
      encodeBase64('Hello world');
      fail('Expected error');
    } catch (e) {
      expect((e as Error).message).toBe('Unable to encode base64');
    }

    try {
      decodeBase64('SGVsbG8gd29ybGQ=');
      fail('Expected error');
    } catch (e) {
      expect((e as Error).message).toBe('Unable to decode base64');
    }
  });
});
