import { generateKeyPairSync } from 'crypto';
import { Signer } from './signer';

describe('Signer', () => {

  let signer: Signer;

  beforeAll(() => {

    jest.useFakeTimers();

    const keyId = 'xyz';
    const passphrase = 'top secret';

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase,
      },
    });

    signer = new Signer(keyId, privateKey, passphrase);
  })

  afterAll(() => {
    jest.useRealTimers();
  })

  test('Presign URL', () => {
    jest.setSystemTime(new Date("2023-02-10T00:00:00.000Z"));
    const withoutDate = signer.sign('https://example.com/test');
    expect(withoutDate).toMatch(/^https:\/\/example\.com\/test\?Expires=1675990800&Key-Pair-Id=/);
  },);
    
  test('Presign URL with date', () => {
    const signDate = new Date("2023-02-10T00:00:00.000Z");
    const withDate = signer.sign('https://example.com/test', signDate);
    expect(withDate).toMatch(/^https:\/\/example\.com\/test\?Expires=1675987200&Key-Pair-Id=/);
  });
});
