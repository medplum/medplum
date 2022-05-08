import { randomUUID } from 'crypto';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { closeDatabase, getClient, initDatabase } from '../database';
import { seedDatabase } from '../seed';
import {
  generateAccessToken,
  generateIdToken,
  generateRefreshToken,
  generateSecret,
  getJwks,
  initKeys,
  verifyJwt,
} from './keys';

describe('Keys', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Init keys', async () => {
    const config = await loadTestConfig();

    // First, delete all existing keys
    await getClient().query('DELETE FROM "JsonWebKey"');

    // Init once
    await initKeys(config);
    const jwks1 = getJwks();
    expect(jwks1.keys.length).toBe(1);

    // Init again
    await initKeys(config);
    const jwks2 = getJwks();
    expect(jwks2.keys.length).toBe(1);
    expect(jwks2.keys[0].kid).toEqual(jwks2.keys[0].kid);
  });

  test('Missing issuer', async () => {
    const config = await loadTestConfig();
    delete (config as any).issuer;
    expect(async () => await initKeys(config)).rejects.toThrowError('Missing issuer');
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
      expect(err).toEqual('Signing key not initialized');
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
      expect(err).toEqual('Signing key not initialized');
    }

    try {
      await verifyJwt('xyz');
    } catch (err) {
      expect(err).toEqual('Signing key not initialized');
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
    expect(generateSecret(48)).toHaveLength(96);
  });
});
