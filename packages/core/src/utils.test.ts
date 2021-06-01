import { arrayBufferToBase64, arrayBufferToHex } from './utils';

if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return Buffer.from(str).toString('base64');
  };
}

test('Convert ArrayBuffer to hex string', () => {
  const input = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const output = arrayBufferToHex(input);
  expect(output).toBe('000102030405060708090a');
});

test('Convert ArrayBuffer to base-64 encoded string', () => {
  const input = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const output = arrayBufferToBase64(input);
  expect(output).toBe('AAECAwQFBgcICQo=');
});
