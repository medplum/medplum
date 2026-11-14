// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ClientApplication, Login } from '@medplum/fhirtypes';
import express from 'express';
import type { JWK } from 'jose';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';
import { generateAccessToken } from './keys';
import { getLoginForAccessToken } from './utils';

const URL = 'http://localhost:8103/fhir/R4/Patient';

describe('DPoP', () => {
  const app = express();
  let client: WithId<ClientApplication>;
  let login: WithId<Login>;
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  let boundToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ client, login } = await createTestProject({ withClient: true, withAccessToken: true }));

    const keyPair = await generateKeyPair('ES256', { extractable: true });
    privateKey = keyPair.privateKey;
    publicJwk = await exportJWK(keyPair.publicKey);
    boundToken = await mintToken(await calculateJwkThumbprint(publicJwk));
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
    accessToken: string,
    options?: { htm?: string; htu?: string; iat?: number; key?: CryptoKey; jwk?: JWK; typ?: string }
  ): Promise<string> {
    return new SignJWT({
      htm: options?.htm ?? 'GET',
      htu: options?.htu ?? URL,
      ath: createHash('sha256').update(accessToken).digest('base64url'),
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
});
