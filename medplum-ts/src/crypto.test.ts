import { encryptSHA256, getRandomString } from './crypto';
import * as nodeCrypto from 'crypto';
import { TextEncoder } from 'util';

global.crypto = {
  subtle: {
    digest: (algorithm: AlgorithmIdentifier, data: Uint8Array): Promise<ArrayBuffer> => {
      return Promise.resolve(data.buffer.slice(0));
    }
  } as any,
  getRandomValues: function (buffer) {
    return nodeCrypto.randomFillSync(buffer);
  }
};

global.TextEncoder = TextEncoder;

test('Create random string', () => {
  const str1 = getRandomString();
  const str2 = getRandomString();
  expect(str1).not.toBe(str2);
  expect(str1.length).toBe(str2.length);
});

test('Encrypt SHA256', async () => {
  const input = 'Hello world';
  const output = await encryptSHA256(input);
  expect(output).not.toBeNull();
});
