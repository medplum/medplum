import { isUUID } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';

const app = express();

describe('Well Known', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get /.well-known/jwks.json', async () => {
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.status).toBe(200);

    const keys = res.body.keys;
    expect(keys).toBeDefined();
    expect(Array.isArray(keys)).toStrictEqual(true);
    expect(keys.length).toBeGreaterThanOrEqual(1);

    for (const key of keys) {
      expect(key.kid).toBeDefined();
      expect(key.kid.length).toStrictEqual(36); // kid should be a UUID
      expect(isUUID(key.kid)).toStrictEqual(true);
      expect(key.alg).toStrictEqual('RS256');
      expect(key.kty).toStrictEqual('RSA');
      expect(key.use).toStrictEqual('sig');

      // Make sure public key properties are there
      expect(key.e).toBeDefined();
      expect(key.n).toBeDefined();

      // Make sure private key properties are *NOT* there
      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
      expect(key.q).toBeUndefined();
      expect(key.dp).toBeUndefined();
      expect(key.dq).toBeUndefined();
      expect(key.qi).toBeUndefined();
    }
  });

  test('Get /.well-known/openid-configuration', async () => {
    const res = await request(app).get('/.well-known/openid-configuration');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBeDefined();
    expect(res.body.authorization_endpoint).toBeDefined();
    expect(res.body.token_endpoint).toBeDefined();
    expect(res.body.userinfo_endpoint).toBeDefined();
    expect(res.body.jwks_uri).toBeDefined();
    expect(res.body.id_token_signing_alg_values_supported).toBeDefined();
    expect(res.body.response_types_supported).toBeDefined();
    expect(res.body.subject_types_supported).toBeDefined();
  });

  test('Get /.well-known/oauth-authorization-server', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBeDefined();
    expect(res.body.authorization_endpoint).toBeDefined();
    expect(res.body.token_endpoint).toBeDefined();
    expect(res.body.userinfo_endpoint).toBeDefined();
    expect(res.body.jwks_uri).toBeDefined();
    expect(res.body.id_token_signing_alg_values_supported).toBeDefined();
    expect(res.body.response_types_supported).toBeDefined();
    expect(res.body.subject_types_supported).toBeDefined();
  });

  test('Get /.well-known/oauth-protected-resource', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBeDefined();
    expect(res.body.authorization_servers).toBeDefined();
    expect(res.body.scopes_supported).toBeDefined();
    expect(res.body.bearer_methods_supported).toBeDefined();
    expect(res.body.introspection_endpoint).toBeDefined();
  });
});
