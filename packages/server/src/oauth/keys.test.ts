import { randomUUID } from 'crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import {
  generateAccessToken,
  generateIdToken,
  generateRefreshToken,
  generateSecret,
  getSigningKey,
  initKeys,
  verifyJwt,
} from './keys';

describe('Keys', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing issuer', async () => {
    const config = await loadTestConfig();
    delete (config as any).issuer;
    try {
      await initKeys(config);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing issuer');
    }
  });

  test('Generate before initialized', async () => {
    const config = await loadTestConfig();
    expect.assertions(2);

    try {
      await initKeys(undefined as unknown as MedplumServerConfig);
    } catch (err) {
      expect((err as Error).message).toEqual('Invalid server configuration');
    }

    try {
      await generateIdToken({ iss: config.issuer, login_id: '123', nonce: randomUUID() });
    } catch (err) {
      expect((err as Error).message).toEqual('Signing key not initialized');
    }
  });

  test('Missing issuer', async () => {
    const config = await loadTestConfig();
    expect.assertions(3);

    try {
      await initKeys({} as unknown as MedplumServerConfig);
    } catch (err) {
      expect((err as Error).message).toEqual('Missing issuer');
    }

    try {
      await generateIdToken({ iss: config.issuer, login_id: '123', nonce: randomUUID() });
    } catch (err) {
      expect((err as Error).message).toEqual('Signing key not initialized');
    }

    try {
      await verifyJwt('xyz');
    } catch (err) {
      expect((err as Error).message).toEqual('Signing key not initialized');
    }
  });

  test('Missing kid', async () => {
    expect.assertions(1);

    const config = await loadTestConfig();
    await initKeys(config);

    // Construct a broken JWT with empty "kid"
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: '', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(config.issuer)
      .setAudience('my-audience')
      .setExpirationTime('1h')
      .sign(getSigningKey());

    try {
      await verifyJwt(accessToken);
    } catch (err) {
      expect((err as Error).message).toEqual('Missing kid header');
    }
  });

  test('Key not found', async () => {
    expect.assertions(1);

    const config = await loadTestConfig();
    await initKeys(config);

    // Construct a JWT with different key
    const { privateKey } = await generateKeyPair('RS256');
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'my-kid', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(config.issuer)
      .setAudience('my-audience')
      .setExpirationTime('1h')
      .sign(privateKey);

    try {
      await verifyJwt(accessToken);
    } catch (err) {
      expect((err as Error).message).toEqual('Key not found');
    }
  });

  test('Generate ID token', async () => {
    const config = await loadTestConfig();
    await initKeys(config);

    const token = await generateIdToken({
      iss: config.issuer,
      login_id: '123',
      nonce: randomUUID(),
    });
    expect(token).toBeDefined();

    const result = await verifyJwt(token);
    expect(result.payload.login_id).toEqual('123');
  });

  test('Generate access token', async () => {
    const config = await loadTestConfig();
    await initKeys(config);

    const token = await generateAccessToken({
      iss: config.issuer,
      login_id: '123',
      username: 'username',
      scope: 'scope',
      profile: 'profile',
    });
    expect(token).toBeDefined();

    const result = await verifyJwt(token);
    expect(result.payload.login_id).toEqual('123');
  });

  test('Generate refresh token', async () => {
    const config = await loadTestConfig();
    await initKeys(config);

    const token = await generateRefreshToken({
      iss: config.issuer,
      login_id: '123',
      refresh_secret: 'secret',
    });
    expect(token).toBeDefined();

    const result = await verifyJwt(token);
    expect(result.payload.login_id).toEqual('123');
  });

  test('Generate secret', () => {
    expect(generateSecret(16)).toHaveLength(32);
    expect(generateSecret(32)).toHaveLength(64);
  });
});
