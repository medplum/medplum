// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ClientApplication, Login } from '@medplum/fhirtypes';
import express from 'express';
import type { JWK } from 'jose';
import { calculateJwkThumbprint, decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig } from '../config/loader';
import { getProjectSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { generateAccessToken } from './keys';
import { getLoginForAccessToken } from './utils';

const URL = 'http://localhost:8103/fhir/R4/Patient';
const TOKEN_URL = 'http://localhost:8103/oauth2/token';

describe('DPoP', () => {
  const app = express();
  let client: WithId<ClientApplication>;
  let login: WithId<Login>;
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  let boundToken: string;
  let jkt: string;
  const email = `dpop-${randomUUID()}@example.com`;
  const password = randomUUID();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    let project;
    ({ project, client, login } = await createTestProject({ withClient: true, withAccessToken: true }));

    const { user } = await inviteUser({ project, resourceType: 'Practitioner', firstName: 'D', lastName: 'P', email });
    await setPassword(await getProjectSystemRepo(project), user, password);

    const keyPair = await generateKeyPair('ES256', { extractable: true });
    privateKey = keyPair.privateKey;
    publicJwk = await exportJWK(keyPair.publicKey);
    jkt = await calculateJwkThumbprint(publicJwk);
    boundToken = await mintToken(jkt);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function mintToken(jkt?: string): Promise<string> {
    return generateAccessToken({
      login_id: login.id,
      sub: client.id,
      username: client.id,
      client_id: client.id,
      profile: 'ClientApplication/' + client.id,
      scope: 'openid',
      cnf: jkt ? { jkt } : undefined,
    });
  }

  function createProof(
    accessToken: string | undefined,
    options?: { htm?: string; htu?: string; iat?: number; key?: CryptoKey; jwk?: JWK; typ?: string }
  ): Promise<string> {
    return new SignJWT({
      htm: options?.htm ?? 'GET',
      htu: options?.htu ?? URL,
      ath: accessToken && createHash('sha256').update(accessToken).digest('base64url'),
    })
      .setProtectedHeader({ alg: 'ES256', typ: options?.typ ?? 'dpop+jwt', jwk: options?.jwk ?? publicJwk })
      .setJti(randomUUID())
      .setIssuedAt(options?.iat)
      .sign(options?.key ?? privateKey);
  }

  function get(path: string, authorization: string, proof?: string | string[]): request.Test {
    const req = request(app).get(path).set('Authorization', authorization);
    return proof ? req.set({ DPoP: proof }) : req;
  }

  test('Bound token with valid proof', async () => {
    const res = await get('/fhir/R4/Patient', 'DPoP ' + boundToken, await createProof(boundToken));
    expect(res).toHaveStatus(200);
  });

  test('Query string is ignored when matching htu', async () => {
    const res = await get('/fhir/R4/Patient?_count=1', 'DPoP ' + boundToken, await createProof(boundToken));
    expect(res).toHaveStatus(200);
  });

  test('Bound token with Bearer scheme', async () => {
    const res = await get('/fhir/R4/Patient', 'Bearer ' + boundToken, await createProof(boundToken));
    expect(res).toHaveStatus(401);
  });

  test('Bound token without proof', async () => {
    const res = await get('/fhir/R4/Patient', 'DPoP ' + boundToken);
    expect(res).toHaveStatus(401);
    expect(res.header['www-authenticate']).toMatch(/^DPoP /);
  });

  test('Unbound token with DPoP scheme', async () => {
    const token = await mintToken();
    const res = await get('/fhir/R4/Patient', 'DPoP ' + token, await createProof(token));
    expect(res).toHaveStatus(401);
  });

  test('Replayed proof', async () => {
    const proof = await createProof(boundToken);
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(200);
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(401);
  });

  test('Multiple DPoP headers', async () => {
    const proofs = [await createProof(boundToken), await createProof(boundToken)];
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proofs)).toHaveStatus(401);
  });

  test('Proof signed by a different key', async () => {
    const other = await generateKeyPair('ES256', { extractable: true });
    const proof = await createProof(boundToken, { key: other.privateKey, jwk: await exportJWK(other.publicKey) });
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(401);
  });

  test('Proof with private key in header', async () => {
    const proof = await createProof(boundToken, { jwk: await exportJWK(privateKey) });
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(401);
  });

  test.each([
    ['wrong typ', { typ: 'JWT' }],
    ['wrong htm', { htm: 'POST' }],
    ['wrong htu path', { htu: 'http://localhost:8103/fhir/R4/Observation' }],
    ['wrong htu host', { htu: 'http://evil.example.com/fhir/R4/Patient' }],
    ['stale iat', { iat: Math.floor(Date.now() / 1000) - 600 }],
    ['future iat', { iat: Math.floor(Date.now() / 1000) + 600 }],
  ])('Proof with %s', async (_name, options) => {
    const proof = await createProof(boundToken, options);
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(401);
  });

  test('Proof for a different access token', async () => {
    const proof = await createProof(await mintToken(await calculateJwkThumbprint(publicJwk)));
    expect(await get('/fhir/R4/Patient', 'DPoP ' + boundToken, proof)).toHaveStatus(401);
  });

  test('Bound token without an HTTP request', async () => {
    expect(await getLoginForAccessToken(undefined, boundToken)).toBeUndefined();
  });

  describe('Token endpoint', () => {
    function tokenProof(options?: { key?: CryptoKey; jwk?: JWK; htu?: string }): Promise<string> {
      return createProof(undefined, { htm: 'POST', htu: TOKEN_URL, ...options });
    }

    async function getTokens(proof?: string): Promise<request.Response> {
      const loginRes = await request(app).post('/auth/login').type('json').send({
        email,
        password,
        clientId: client.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        scope: 'openid offline_access',
      });
      expect(loginRes).toHaveStatus(200);
      const req = request(app).post('/oauth2/token').type('form');
      if (proof) {
        req.set('DPoP', proof);
      }
      return req.send({ grant_type: 'authorization_code', code: loginRes.body.code, code_verifier: 'xyz' });
    }

    function refresh(refreshToken: string, proof?: string): request.Test {
      const req = request(app).post('/oauth2/token').type('form');
      if (proof) {
        req.set('DPoP', proof);
      }
      return req.send({ grant_type: 'refresh_token', refresh_token: refreshToken });
    }

    test('Issues a bound token that requires a proof', async () => {
      const res = await getTokens(await tokenProof());
      expect(res).toHaveStatus(200);
      expect(res.body.token_type).toBe('DPoP');
      const accessToken = res.body.access_token;
      expect(decodeJwt(accessToken).cnf).toStrictEqual({ jkt });

      expect(await get('/fhir/R4/Patient', 'DPoP ' + accessToken, await createProof(accessToken))).toHaveStatus(200);
      expect(await get('/fhir/R4/Patient', 'Bearer ' + accessToken)).toHaveStatus(401);

      const introspect = await request(app)
        .post('/oauth2/introspect')
        .auth(client.id, client.secret as string)
        .type('form')
        .send({ token: accessToken });
      expect(introspect.body).toMatchObject({ active: true, cnf: { jkt } });
    });

    test('Without a proof, issues a Bearer token', async () => {
      const res = await getTokens();
      expect(res).toHaveStatus(200);
      expect(res.body.token_type).toBe('Bearer');
      expect(decodeJwt(res.body.access_token).cnf).toBeUndefined();
    });

    test('Invalid proof', async () => {
      const res = await getTokens(await tokenProof({ htu: URL }));
      expect(res).toHaveStatus(400);
      expect(res.body.error).toBe('invalid_dpop_proof');
    });

    test('Refresh of a bound login requires the bound key', async () => {
      const tokens = (await getTokens(await tokenProof())).body;
      const other = await generateKeyPair('ES256', { extractable: true });
      const otherProof = await tokenProof({ key: other.privateKey, jwk: await exportJWK(other.publicKey) });

      for (const proof of [undefined, otherProof]) {
        const res = await refresh(tokens.refresh_token, proof);
        expect(res).toHaveStatus(400);
        expect(res.body.error).toBe('invalid_dpop_proof');
      }

      // The rejected attempts did not consume the refresh token
      const res = await refresh(tokens.refresh_token, await tokenProof());
      expect(res).toHaveStatus(200);
      expect(res.body.token_type).toBe('DPoP');
      expect(decodeJwt(res.body.access_token).cnf).toStrictEqual({ jkt });
    });
  });
});
