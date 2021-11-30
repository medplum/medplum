import { generateKeyPairSync } from 'crypto';
import { Signer } from './signer';

describe('Signer', () => {

  test('Presign URL', () => {
    const keyId = 'xyz';
    const passphrase = 'top secret';

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase
      }
    });

    const signer = new Signer(keyId, privateKey, passphrase);
    const result = signer.sign('https://example.com/test', new Date().getTime() / 1000 + 3600);
    expect(result).toBeDefined();

    const resultUrl = new URL(result);
    expect(resultUrl.hostname).toBe('example.com');
  });

});
