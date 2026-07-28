// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, ContentType } from '@medplum/core';
import type { Binary, Bundle, Parameters, Patient, SmartHealthLink } from '@medplum/fhirtypes';
import express from 'express';
import { base64url, CompactEncrypt, CompactSign, exportJWK, generateKeyPair } from 'jose';
import { deflateRawSync } from 'node:zlib';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { KeyLike } from '../../oauth/keys';
import { createTestProject, initTestAuth } from '../../test.setup';

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
    expect(generateResponse).toHaveStatus(200);

    const credential = getStringParameter(generateResponse.body, 'credential');
    expect(credential.split('.')).toHaveLength(3);
    expect(getStringParameter(generateResponse.body, 'shcUri')).toMatch(/^shc:\//);
    expect(getStringParameter(generateResponse.body, 'file')).toContain('verifiableCredential');
    expect(getStringParameter(generateResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);
    expect(getStringParameter(generateResponse.body, 'keyId')).toBeDefined();

    const verifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential });
    expect(verifyResponse).toHaveStatus(200);
    expect(getBooleanParameter(verifyResponse.body, 'valid')).toBe(true);

    const bundle = JSON.parse(getStringParameter(verifyResponse.body, 'fhirBundle')) as Bundle;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry?.some((entry) => entry.resource?.resourceType === 'Patient')).toBe(true);

    const verifyShcUriResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shcUri: getStringParameter(generateResponse.body, 'shcUri') });
    expect(verifyShcUriResponse).toHaveStatus(200);
    expect(getBooleanParameter(verifyShcUriResponse.body, 'valid')).toBe(true);

    const verifyFileResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ file: getStringParameter(generateResponse.body, 'file') });
    expect(verifyFileResponse).toHaveStatus(200);
    expect(getBooleanParameter(verifyFileResponse.body, 'valid')).toBe(true);
  });

  test('Detects invalid SMART Health Cards', async () => {
    const patient = await createPatient();
    const expiredResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-card`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(expiredResponse).toHaveStatus(200);

    const expiredVerifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential: getStringParameter(expiredResponse.body, 'credential') });
    expect(expiredVerifyResponse).toHaveStatus(200);
    expect(getBooleanParameter(expiredVerifyResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(expiredVerifyResponse.body, 'error')).toContain('expired');

    const missingInputResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingInputResponse).toHaveStatus(400);
    expect(missingInputResponse.body).toMatchObject(badRequest('Expected credential, shcUri, or file'));

    const invalidQrResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shcUri: 'shc:/123' });
    expect(invalidQrResponse).toHaveStatus(400);
    expect(invalidQrResponse.body).toMatchObject(badRequest('Invalid SMART Health Card numeric encoding'));

    const invalidFileResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ file: JSON.stringify({ verifiableCredential: [] }) });
    expect(invalidFileResponse).toHaveStatus(400);
    expect(invalidFileResponse.body).toMatchObject(badRequest('Expected credential, shcUri, or file'));

    const missingPatientResponse = await request(app)
      .post('/fhir/R4/Patient/not-found/$generate-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingPatientResponse).toHaveStatus(404);
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

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [publicJwk] }),
    } as Response);

    const verifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential });
    expect(verifyResponse).toHaveStatus(200);
    expect(getBooleanParameter(verifyResponse.body, 'valid')).toBe(true);
    expect(getBooleanParameter(verifyResponse.body, 'issuerTrusted')).toBe(false);
    expect(getBooleanParameter(verifyResponse.body, 'verified')).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://issuer.example.com/.well-known/jwks.json'),
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );

    fetchSpy.mockRestore();
  });

  test('Generate manifest and resolve SMART Health Link', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ passcode: '123456', label: 'Test Link' });
    expect(generateResponse).toHaveStatus(200);

    const shlink = getStringParameter(generateResponse.body, 'shlink');
    expect(shlink).toMatch(/^shlink:\//);

    const manifestUrl = new URL(getStringParameter(generateResponse.body, 'manifestUrl'));
    expect(manifestUrl.pathname).toMatch(/^\/shl\/[^/]+\/manifest$/);
    expect(getStringParameter(generateResponse.body, 'url')).toBe(manifestUrl.toString());
    const smartHealthLink = await readGeneratedSmartHealthLink(manifestUrl.pathname);
    expect(smartHealthLink).toMatchObject({
      resourceType: 'SmartHealthLink',
      status: 'active',
      mode: 'manifest',
      subject: { reference: `Patient/${patient.id}` },
      url: manifestUrl.toString(),
      label: 'Test Link',
      flag: 'P',
    });
    expect(smartHealthLink.file).toHaveLength(1);
    expect(smartHealthLink.file[0].attachment.url).toMatch(/^Binary\//);
    const manifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ recipient: 'Test Recipient', passcode: '123456' });
    expect(manifestResponse).toHaveStatus(200);
    expect(manifestResponse.body.files).toHaveLength(1);
    expect(manifestResponse.body.files[0].embedded).toBeDefined();

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink, recipient: 'Test Recipient', passcode: '123456' });
    expect(resolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);

    const fhirResources = JSON.parse(getStringParameter(resolveResponse.body, 'fhirResources')) as Bundle[];
    expect(fhirResources[0]?.resourceType).toBe('Bundle');

    const viewerResolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: `https://viewer.example/#${shlink}`, recipient: 'Test Recipient', passcode: '123456' });
    expect(viewerResolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(viewerResolveResponse.body, 'valid')).toBe(true);
  });

  test('Rejects invalid SMART Health Links', async () => {
    const patient = await createPatient();
    const passcodeResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ _type: 'Patient', passcode: '123456', includeQrCode: true });
    expect(passcodeResponse).toHaveStatus(200);
    expect(getStringParameter(passcodeResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);

    const manifestUrl = new URL(getStringParameter(passcodeResponse.body, 'manifestUrl'));
    const missingPasscodeManifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ recipient: 'Test Recipient' });
    expect(missingPasscodeManifestResponse).toHaveStatus(400);
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
    expect(wrongPasscodeResolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(wrongPasscodeResolveResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(wrongPasscodeResolveResponse.body, 'error')).toContain('passcode');

    const missingManifestResponse = await request(app)
      .post('/shl/not-found/manifest')
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingManifestResponse).toHaveStatus(404);

    const expiredResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(expiredResponse).toHaveStatus(200);

    const expiredResolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: getStringParameter(expiredResponse.body, 'shlink') });
    expect(expiredResolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(expiredResolveResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(expiredResolveResponse.body, 'error')).toContain('expired');

    const invalidUriResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: 'https://example.com/no-link' });
    expect(invalidUriResponse).toHaveStatus(200);
    expect(getBooleanParameter(invalidUriResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(invalidUriResponse.body, 'error')).toContain('Invalid SMART Health Link URI');

    const nonStringShlinkResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: 123 });
    expect(nonStringShlinkResponse).toHaveStatus(200);
    expect(getBooleanParameter(nonStringShlinkResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(nonStringShlinkResponse.body, 'error')).toContain('Expected shlink to be a string');

    const invalidPayloadResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: 'shlink:/e30' });
    expect(invalidPayloadResponse).toHaveStatus(200);
    expect(getBooleanParameter(invalidPayloadResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(invalidPayloadResponse.body, 'error')).toContain('Invalid SMART Health Link payload');

    const unknownGeneratedLinkResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://example.com/shl/not-found/manifest',
          key: '0000000000000000000000000000000000000000000',
          flag: 'U',
          v: 1,
        }),
      });
    expect(unknownGeneratedLinkResponse).toHaveStatus(200);
    expect(getBooleanParameter(unknownGeneratedLinkResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(unknownGeneratedLinkResponse.body, 'error')).toContain('recipient');

    const missingPatientResponse = await request(app)
      .post('/fhir/R4/Patient/not-found/$generate-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({});
    expect(missingPatientResponse).toHaveStatus(404);
  });

  test('Generate direct SMART Health Link and resolve payload', async () => {
    const patient = await createPatient();
    const exp = Math.floor(Date.now() / 1000) + 300;

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        mode: 'direct',
        exp,
        label: 'Test CMS Link',
        includeQrCode: true,
      });
    expect(generateResponse).toHaveStatus(200);

    const shlink = getStringParameter(generateResponse.body, 'shlink');
    expect(shlink).toMatch(/^shlink:\//);
    expect(getStringParameter(generateResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);

    const directUrl = new URL(getStringParameter(generateResponse.body, 'url'));
    expect(directUrl.pathname).toMatch(/^\/shl\/[^/]+\/payload$/);
    expect(generateResponse.body.parameter?.some((p: { name?: string }) => p.name === 'manifestUrl')).toBe(false);
    const smartHealthLink = await readGeneratedSmartHealthLink(directUrl.pathname);
    expect(smartHealthLink).toMatchObject({
      resourceType: 'SmartHealthLink',
      status: 'active',
      mode: 'direct',
      subject: { reference: `Patient/${patient.id}` },
      url: directUrl.toString(),
      label: 'Test CMS Link',
      flag: 'U',
    });
    expect(smartHealthLink.file).toHaveLength(1);
    expect(smartHealthLink.file[0].attachment.url).toMatch(/^Binary\//);

    const payload = decodeShlinkPayload(shlink);
    expect(payload.flag).toBe('U');
    expect(payload.exp).toBeDefined();
    expect(payload.label).toBe('Test CMS Link');
    expect(payload.url).not.toContain('/manifest');
    expect(payload.key).toBeDefined();
    expect(payload.v).toBe(1);

    const payloadResponse = await request(app).get(directUrl.pathname).query({ recipient: 'Test Recipient' });
    expect(payloadResponse).toHaveStatus(200);
    expect(payloadResponse.get('Content-Type')).toContain('application/jose');
    expect(payloadResponse.text.split('.')).toHaveLength(5);

    const missingRecipientResponse = await request(app).get(directUrl.pathname);
    expect(missingRecipientResponse).toHaveStatus(400);
    expect(missingRecipientResponse.body.error).toContain('recipient');

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink, recipient: 'Test Recipient' });
    expect(resolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);
    expect(getStringParameter(resolveResponse.body, 'recipient')).toBe('Test Recipient');
    expect(getStringParameter(resolveResponse.body, 'sourceOrigin')).toBe(directUrl.origin);
    expect(getDateTimeParameter(resolveResponse.body, 'expiresAt')).toBe(new Date(exp * 1000).toISOString());

    const fhirResources = JSON.parse(getStringParameter(resolveResponse.body, 'fhirResources')) as Bundle[];
    expect(fhirResources[0]?.resourceType).toBe('Bundle');
    expect(fhirResources[0]?.type).toBe('collection');
    expect(fhirResources[0]?.entry?.every((entry) => entry.search === undefined)).toBe(true);
  });

  test('Resolves external direct SMART Health Link payloads', async () => {
    const key = base64url.encode(Buffer.alloc(32, 1));
    const exp = Math.floor(Date.now() / 1000) + 300;
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: await createPatient() }],
    };
    const encrypted = await encryptSmartHealthLinkTestFile(bundle, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => encrypted,
    } as Response);

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload?existing=true',
          key,
          flag: 'LU',
          exp,
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(resolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);

    const fetchCall = fetchSpy.mock.calls.at(-1);
    const fetchUrl = fetchCall?.[0] as URL;
    expect(fetchUrl.toString()).toBe(
      'https://issuer.example.com/smart-link/payload?existing=true&recipient=Test+Recipient'
    );
    expect(fetchCall?.[1]).toEqual(
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
    expect(getStringParameter(resolveResponse.body, 'recipient')).toBe('Test Recipient');
    expect(getStringParameter(resolveResponse.body, 'sourceOrigin')).toBe('https://issuer.example.com');
    expect(getDateTimeParameter(resolveResponse.body, 'expiresAt')).toBe(new Date(exp * 1000).toISOString());

    const fhirResources = JSON.parse(getStringParameter(resolveResponse.body, 'fhirResources')) as Bundle[];
    expect(fhirResources).toHaveLength(1);
    expect(fhirResources[0]).toMatchObject({ resourceType: 'Bundle', type: 'collection' });

    fetchSpy.mockRestore();
  });

  test('Returns warnings for expired external SMART Health Link payloads', async () => {
    const key = base64url.encode(Buffer.alloc(32, 2));
    const encrypted = await encryptSmartHealthLinkTestFile({ resourceType: 'Bundle', type: 'collection' }, key);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => encrypted,
    } as Response);

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          flag: 'U',
          exp: Math.floor(Date.now() / 1000) - 60,
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(resolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);
    expect(getStringParameter(resolveResponse.body, 'warning')).toContain('expired');

    fetchSpy.mockRestore();
  });

  test('Rejects invalid external SMART Health Link payload responses', async () => {
    const key = base64url.encode(Buffer.alloc(32, 3));
    const unsupportedContentType = await encryptSmartHealthLinkTestFile(
      { resourceType: 'Bundle', type: 'collection' },
      key,
      ContentType.JSON as unknown as 'application/fhir+json'
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 410,
      text: async () => 'Gone',
    } as Response);
    const httpErrorResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          flag: 'U',
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(httpErrorResponse).toHaveStatus(200);
    expect(getBooleanParameter(httpErrorResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(httpErrorResponse.body, 'error')).toContain('HTTP 410');
    expect(getStringParameter(httpErrorResponse.body, 'error')).not.toContain('Gone');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => unsupportedContentType,
    } as Response);
    const unsupportedContentTypeResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          flag: 'U',
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(unsupportedContentTypeResponse).toHaveStatus(200);
    expect(getBooleanParameter(unsupportedContentTypeResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(unsupportedContentTypeResponse.body, 'error')).toContain(
      'Unsupported SMART Health Link content type'
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '10485761' }),
      text: async () => 'Unexpected text read',
    } as unknown as Response);
    const tooLargeResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          flag: 'U',
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(tooLargeResponse).toHaveStatus(200);
    expect(getBooleanParameter(tooLargeResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(tooLargeResponse.body, 'error')).toContain('too large');

    const unsupportedFlagResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          flag: 'P',
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(unsupportedFlagResponse).toHaveStatus(200);
    expect(getBooleanParameter(unsupportedFlagResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(unsupportedFlagResponse.body, 'error')).toContain('Only direct SMART Health Links');

    const missingFlagResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        shlink: encodeShlinkPayload({
          url: 'https://issuer.example.com/smart-link/payload',
          key,
          v: 1,
        }),
        recipient: 'Test Recipient',
      });
    expect(missingFlagResponse).toHaveStatus(200);
    expect(getBooleanParameter(missingFlagResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(missingFlagResponse.body, 'error')).toContain('Only direct SMART Health Links');

    fetchSpy.mockRestore();
  });

  test('Rejects invalid direct SMART Health Links', async () => {
    const patient = await createPatient();

    const passcodeResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        mode: 'direct',
        exp: Math.floor(Date.now() / 1000) + 300,
        passcode: '123456',
      });
    expect(passcodeResponse).toHaveStatus(400);
    expect(JSON.stringify(passcodeResponse.body)).toContain('Passcode is not supported');

    const missingExpResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ mode: 'direct' });
    expect(missingExpResponse).toHaveStatus(400);
    expect(JSON.stringify(missingExpResponse.body)).toContain('Expected exp');

    const expiredResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ mode: 'direct', exp: Math.floor(Date.now() / 1000) - 60 });
    expect(expiredResponse).toHaveStatus(400);
    expect(JSON.stringify(expiredResponse.body)).toContain('Expected exp to be in the future');
  });

  test('Returns not found when direct SMART Health Link Binary is deleted', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        mode: 'direct',
        exp: Math.floor(Date.now() / 1000) + 300,
      });
    expect(generateResponse).toHaveStatus(200);

    const directUrl = new URL(getStringParameter(generateResponse.body, 'url'));
    const smartHealthLink = await readGeneratedSmartHealthLink(directUrl.pathname);
    const binaryId = getBinaryId(smartHealthLink);
    const { getGlobalSystemRepo } = await import('../repo');
    await getGlobalSystemRepo().deleteResource('Binary', binaryId);

    const payloadResponse = await request(app).get(directUrl.pathname).query({ recipient: 'Test Recipient' });
    expect(payloadResponse).toHaveStatus(404);
    expect(payloadResponse.body.error).toContain('payload not found');

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink: getStringParameter(generateResponse.body, 'shlink'), recipient: 'Test Recipient' });
    expect(resolveResponse).toHaveStatus(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(false);
    expect(getStringParameter(resolveResponse.body, 'error')).toContain('payload not found');
  });

  test('Does not dereference SMART Health Link Binary from another project', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        mode: 'direct',
        exp: Math.floor(Date.now() / 1000) + 300,
      });
    expect(generateResponse).toHaveStatus(200);

    const directUrl = new URL(getStringParameter(generateResponse.body, 'url'));
    const smartHealthLink = await readGeneratedSmartHealthLink(directUrl.pathname);
    const otherProjectBinary = await createBinaryInAnotherProject();
    smartHealthLink.file[0].attachment.url = `Binary/${otherProjectBinary.id}`;
    await updateGeneratedSmartHealthLink(smartHealthLink);

    const payloadResponse = await request(app).get(directUrl.pathname).query({ recipient: 'Test Recipient' });
    expect(payloadResponse).toHaveStatus(404);
    expect(payloadResponse.body.error).toContain('payload not found');
  });

  test('Omits manifest files backed by Binary resources from another project', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ passcode: '123456' });
    expect(generateResponse).toHaveStatus(200);

    const manifestUrl = new URL(getStringParameter(generateResponse.body, 'manifestUrl'));
    const smartHealthLink = await readGeneratedSmartHealthLink(manifestUrl.pathname);
    const otherProjectBinary = await createBinaryInAnotherProject();
    smartHealthLink.file[0].attachment.url = `Binary/${otherProjectBinary.id}`;
    await updateGeneratedSmartHealthLink(smartHealthLink);

    const manifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ passcode: '123456' });
    expect(manifestResponse).toHaveStatus(200);
    expect(manifestResponse.body.files).toStrictEqual([]);
  });
});

async function createPatient(): Promise<Patient> {
  const response = await request(app)
    .post('/fhir/R4/Patient')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send({ resourceType: 'Patient', name: [{ given: ['Alice'], family: 'Smith' }] });
  expect(response).toHaveStatus(201);
  return response.body as Patient;
}

async function readGeneratedSmartHealthLink(pathname: string): Promise<SmartHealthLink> {
  const id = pathname.match(/^\/shl\/([^/]+)\//)?.[1];
  expect(id).toBeDefined();
  const { getGlobalSystemRepo } = await import('../repo');
  return getGlobalSystemRepo().readResource<SmartHealthLink>('SmartHealthLink', id as string);
}

async function updateGeneratedSmartHealthLink(smartHealthLink: SmartHealthLink): Promise<void> {
  const { getGlobalSystemRepo } = await import('../repo');
  await getGlobalSystemRepo().updateResource(smartHealthLink);
}

async function createBinaryInAnotherProject(): Promise<Binary> {
  const { project } = await createTestProject();
  const { getGlobalSystemRepo } = await import('../repo');
  return getGlobalSystemRepo().createResource<Binary>({
    resourceType: 'Binary',
    meta: { project: project.id },
    contentType: ContentType.JOSE,
  });
}

function getBinaryId(smartHealthLink: SmartHealthLink): string {
  const binaryReference = smartHealthLink.file[0].attachment.url;
  expect(binaryReference).toMatch(/^Binary\//);
  return (binaryReference as string).substring('Binary/'.length);
}

function getStringParameter(parameters: Parameters, name: string): string {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueString;
  expect(value).toBeDefined();
  return value as string;
}

function getDateTimeParameter(parameters: Parameters, name: string): string {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueDateTime;
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

function decodeShlinkPayload(shlink: string): any {
  return JSON.parse(Buffer.from(shlink.substring('shlink:/'.length), 'base64url').toString('utf8'));
}

async function encryptSmartHealthLinkTestFile(
  bundle: Bundle,
  key: string,
  contentType = ContentType.FHIR_JSON
): Promise<string> {
  return new CompactEncrypt(Buffer.from(JSON.stringify(bundle)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', cty: contentType })
    .encrypt(base64url.decode(key));
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
