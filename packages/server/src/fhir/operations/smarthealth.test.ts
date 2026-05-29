// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, Parameters, Patient } from '@medplum/fhirtypes';
import express from 'express';
import type { KeyLike } from 'jose';
import { CompactSign, exportJWK, generateKeyPair } from 'jose';
import { deflateRawSync } from 'node:zlib';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('SMART Health operations', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Generate and verify SMART Health Card', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-card`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ _type: 'Patient', includeQrCode: true });
    expect(generateResponse.status).toBe(200);

    const credential = getStringParameter(generateResponse.body, 'credential');
    expect(credential.split('.')).toHaveLength(3);
    expect(getStringParameter(generateResponse.body, 'shcUri')).toMatch(/^shc:\//);
    expect(getStringParameter(generateResponse.body, 'file')).toContain('verifiableCredential');
    expect(getStringParameter(generateResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);

    const verifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential });
    expect(verifyResponse.status).toBe(200);
    expect(getBooleanParameter(verifyResponse.body, 'valid')).toBe(true);

    const bundle = JSON.parse(getStringParameter(verifyResponse.body, 'fhirBundle')) as Bundle;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry?.some((entry) => entry.resource?.resourceType === 'Patient')).toBe(true);

    const verifyShcUriResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shcUri: getStringParameter(generateResponse.body, 'shcUri') });
    expect(verifyShcUriResponse.status).toBe(200);
    expect(getBooleanParameter(verifyShcUriResponse.body, 'valid')).toBe(true);

    const verifyFileResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ file: getStringParameter(generateResponse.body, 'file') });
    expect(verifyFileResponse.status).toBe(200);
    expect(getBooleanParameter(verifyFileResponse.body, 'valid')).toBe(true);
  });

  test('Rejects invalid SMART Health Cards', async () => {
    const patient = await createPatient();
    const expiredResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-card`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(expiredResponse.status).toBe(200);

    const expiredVerifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential: getStringParameter(expiredResponse.body, 'credential') });
    expect(expiredVerifyResponse.status).toBe(200);
    expect(getBooleanParameter(expiredVerifyResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(expiredVerifyResponse.body, 'error')).toContain('expired');

    const missingInputResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingInputResponse.status).toBe(200);
    expect(getBooleanParameter(missingInputResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(missingInputResponse.body, 'error')).toContain('Expected credential');

    const invalidQrResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shcUri: 'shc:/123' });
    expect(invalidQrResponse.status).toBe(200);
    expect(getBooleanParameter(invalidQrResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(invalidQrResponse.body, 'error')).toContain('numeric encoding');

    const invalidFileResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ file: JSON.stringify({ verifiableCredential: [] }) });
    expect(invalidFileResponse.status).toBe(200);
    expect(getBooleanParameter(invalidFileResponse.body, 'valid')).toBe(false);

    const missingPatientResponse = await request(app)
      .post('/fhir/R4/Patient/not-found/$generate-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingPatientResponse.status).toBe(400);
  });

  test('Verifies external SMART Health Card signatures without trusting issuer', async () => {
    const issuer = 'https://issuer.example.com';
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = 'ES256';
    publicJwk.kid = 'external-key';
    publicJwk.use = 'sig';

    const credential = await createSmartHealthCardCredential({
      issuer,
      keyId: publicJwk.kid,
      privateKey,
      bundle: { resourceType: 'Bundle', type: 'collection' },
    });

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [publicJwk] }),
    } as Response);

    const verifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential });
    expect(verifyResponse.status).toBe(200);
    expect(getBooleanParameter(verifyResponse.body, 'valid')).toBe(true);
    expect(getBooleanParameter(verifyResponse.body, 'signatureValid')).toBe(true);
    expect(getBooleanParameter(verifyResponse.body, 'issuerTrusted')).toBe(false);
    expect(getBooleanParameter(verifyResponse.body, 'verified')).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(new URL('https://issuer.example.com/.well-known/jwks.json'), {
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });

    fetchSpy.mockRestore();

    const insecureCredential = await createSmartHealthCardCredential({
      issuer: 'http://issuer.example.com',
      keyId: publicJwk.kid,
      privateKey,
      bundle: { resourceType: 'Bundle', type: 'collection' },
    });
    const insecureVerifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential: insecureCredential });
    expect(insecureVerifyResponse.status).toBe(200);
    expect(getBooleanParameter(insecureVerifyResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(insecureVerifyResponse.body, 'error')).toContain('HTTPS');
  });

  test('Generate manifest and resolve SMART Health Link', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ passcode: '123456', label: 'Test Link' });
    expect(generateResponse.status).toBe(200);

    const shlink = getStringParameter(generateResponse.body, 'shlink');
    expect(shlink).toMatch(/^shlink:\//);

    const manifestUrl = new URL(getStringParameter(generateResponse.body, 'manifestUrl'));
    const manifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ recipient: 'Test Recipient', passcode: '123456' });
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.files).toHaveLength(1);
    expect(manifestResponse.body.files[0].embedded).toBeDefined();

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink, recipient: 'Test Recipient', passcode: '123456' });
    expect(resolveResponse.status).toBe(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);

    const fhirResources = JSON.parse(getStringParameter(resolveResponse.body, 'fhirResources')) as Bundle[];
    expect(fhirResources[0]?.resourceType).toBe('Bundle');

    const viewerResolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: `https://viewer.example/#${shlink}`, recipient: 'Test Recipient', passcode: '123456' });
    expect(viewerResolveResponse.status).toBe(200);
    expect(getBooleanParameter(viewerResolveResponse.body, 'valid')).toBe(true);
  });

  test('Rejects invalid SMART Health Links', async () => {
    const patient = await createPatient();
    const passcodeResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ _type: 'Patient', passcode: '123456', includeQrCode: true });
    expect(passcodeResponse.status).toBe(200);
    expect(getStringParameter(passcodeResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);

    const manifestUrl = new URL(getStringParameter(passcodeResponse.body, 'manifestUrl'));
    const missingPasscodeManifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ recipient: 'Test Recipient' });
    expect(missingPasscodeManifestResponse.status).toBe(400);
    expect(missingPasscodeManifestResponse.body.error).toContain('passcode');

    const wrongPasscodeResolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: getStringParameter(passcodeResponse.body, 'shlink'),
        recipient: 'Test Recipient',
        passcode: 'wrong',
      });
    expect(wrongPasscodeResolveResponse.status).toBe(200);
    expect(getBooleanParameter(wrongPasscodeResolveResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(wrongPasscodeResolveResponse.body, 'error')).toContain('passcode');

    const missingManifestResponse = await request(app)
      .post('/fhir/R4/.well-known/smart-health-links/not-found/manifest.json')
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingManifestResponse.status).toBe(404);

    const expiredResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(expiredResponse.status).toBe(200);

    const expiredResolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: getStringParameter(expiredResponse.body, 'shlink') });
    expect(expiredResolveResponse.status).toBe(200);
    expect(getBooleanParameter(expiredResolveResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(expiredResolveResponse.body, 'error')).toContain('expired');

    const invalidUriResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: 'https://example.com/no-link' });
    expect(invalidUriResponse.status).toBe(200);
    expect(getBooleanParameter(invalidUriResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(invalidUriResponse.body, 'error')).toContain('Invalid SMART Health Link URI');

    const invalidPayloadResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: 'shlink:/e30' });
    expect(invalidPayloadResponse.status).toBe(200);
    expect(getBooleanParameter(invalidPayloadResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(invalidPayloadResponse.body, 'error')).toContain('Invalid SMART Health Link payload');

    const unknownGeneratedLinkResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://example.com/fhir/R4/.well-known/smart-health-links/not-found/manifest.json',
          key: '0000000000000000000000000000000000000000000',
          v: 1,
        }),
      });
    expect(unknownGeneratedLinkResponse.status).toBe(200);
    expect(getBooleanParameter(unknownGeneratedLinkResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(unknownGeneratedLinkResponse.body, 'error')).toContain('Medplum-generated');

    const missingPatientResponse = await request(app)
      .post('/fhir/R4/Patient/not-found/$generate-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingPatientResponse.status).toBe(400);
  });
});

async function createPatient(): Promise<Patient> {
  const response = await request(app)
    .post('/fhir/R4/Patient')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send({ resourceType: 'Patient', name: [{ given: ['Alice'], family: 'Smith' }] });
  expect(response.status).toBe(201);
  return response.body as Patient;
}

function getStringParameter(parameters: Parameters, name: string): string {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueString;
  expect(value).toBeDefined();
  return value as string;
}

function getBooleanParameter(parameters: Parameters, name: string): boolean {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueBoolean;
  expect(value).toBeDefined();
  return value as boolean;
}

function encodeShlinkPayload(payload: object): string {
  return `shlink:/${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

async function createSmartHealthCardCredential(options: {
  issuer: string;
  keyId: string;
  privateKey: KeyLike;
  bundle: Bundle;
}): Promise<string> {
  const payload = {
    iss: options.issuer,
    nbf: Math.floor(Date.now() / 1000),
    vc: {
      type: ['https://smarthealth.cards#health-card'],
      credentialSubject: {
        fhirVersion: '4.0.1',
        fhirBundle: options.bundle,
      },
    },
  };
  return new CompactSign(deflateRawSync(Buffer.from(JSON.stringify(payload))))
    .setProtectedHeader({ alg: 'ES256', kid: options.keyId, zip: 'DEF' })
    .sign(options.privateKey);
}
