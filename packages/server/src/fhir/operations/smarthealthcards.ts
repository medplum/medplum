// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, normalizeErrorString, OAuthSigningAlgorithm } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import type { JWK, KeyLike } from 'jose';
import { CompactSign, compactVerify, decodeProtectedHeader, importJWK } from 'jose';
import { isIP } from 'node:net';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import QRCode from 'qrcode';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getJwks, getSigningKey } from '../../oauth/keys';
import { makeOperationDefinition } from './definitions';
import { getPatientEverything } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

const SHC_VC_TYPE = ['https://smarthealth.cards#health-card'];
const FHIR_VERSION = '4.0.1';
const SHC_SIGNING_ALG = OAuthSigningAlgorithm.ES256;
const jwksCache = new Map<string, JWK[]>();

interface SmartHealthCardSigningKey {
  privateKey: KeyLike;
  kid: string;
}

interface SmartHealthCardJwt {
  iss: string;
  nbf: number;
  exp?: number;
  vc: {
    type: string[];
    credentialSubject: {
      fhirVersion: string;
      fhirBundle: Bundle;
    };
  };
}

interface GenerateSmartHealthCardParams {
  _type?: string;
  exp?: number;
  includeQrCode?: boolean;
}

interface VerifySmartHealthCardParams {
  credential?: string;
  shcUri?: string;
  file?: string;
}

export const generateSmartHealthCardOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Patient' },
  {
    name: 'GenerateSmartHealthCard',
    code: 'generate-smart-health-card',
    affectsState: false,
    parameter: [
      { use: 'in', name: '_type', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'exp', type: 'integer', min: 0, max: '1' },
      { use: 'in', name: 'includeQrCode', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'credential', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'shcUri', type: 'uri', min: 1, max: '1' },
      { use: 'out', name: 'file', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'qrCodeDataUrl', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'issuer', type: 'uri', min: 1, max: '1' },
      { use: 'out', name: 'keyId', type: 'string', min: 1, max: '1' },
    ],
  }
);

export const verifySmartHealthCardOperation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'VerifySmartHealthCard',
    code: 'verify-smart-health-card',
    affectsState: false,
    parameter: [
      { use: 'in', name: 'credential', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'shcUri', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'file', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'valid', type: 'boolean', min: 1, max: '1' },
      { use: 'out', name: 'signatureValid', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'issuerTrusted', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'verified', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'issuer', type: 'uri', min: 0, max: '1' },
      { use: 'out', name: 'keyId', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'fhirBundle', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'error', type: 'string', min: 0, max: '1' },
    ],
  }
);

export async function generateSmartHealthCardHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const ctx = getAuthenticatedContext();
    const patient = await ctx.repo.readResource<Patient>('Patient', req.params.id);
    const params = parseInputParameters<GenerateSmartHealthCardParams>(generateSmartHealthCardOperation, req);
    const bundle = await getPatientEverything(ctx.repo, patient, {
      _count: 1000,
      _type: params._type
        ?.split(',')
        .map((s) => s.trim() as Resource['resourceType'])
        .filter(Boolean),
    });
    const issuer = getConfig().issuer;
    const credential = await createSmartHealthCardCredential(bundle, issuer, params.exp);
    const shcUri = encodeSmartHealthCardUri(credential);
    const file = JSON.stringify(writeSmartHealthCardFile(credential));
    const qrCodeDataUrl = params.includeQrCode ? await QRCode.toDataURL(shcUri) : undefined;

    return [
      allOk,
      makeParameters({
        credential,
        shcUri,
        file,
        qrCodeDataUrl,
        issuer,
        keyId: getSmartHealthCardSigningKey().kid,
      }),
    ];
  } catch (err) {
    return [badRequest(normalizeErrorString(err))];
  }
}

export async function verifySmartHealthCardHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const params = parseInputParameters<VerifySmartHealthCardParams>(verifySmartHealthCardOperation, req);
    const credential = readSmartHealthCardCredential(params);
    const { payload, issuerTrusted } = await verifySmartHealthCardCredential(credential);
    const header = decodeProtectedHeader(credential);

    return [
      allOk,
      makeParameters({
        valid: true,
        signatureValid: true,
        issuerTrusted,
        verified: issuerTrusted,
        issuer: payload.iss,
        keyId: header.kid,
        fhirBundle: JSON.stringify(payload.vc.credentialSubject.fhirBundle),
      }),
    ];
  } catch (err) {
    return [allOk, makeParameters({ valid: false, error: normalizeErrorString(err) })];
  }
}

async function createSmartHealthCardCredential(bundle: Bundle, issuer: string, exp?: number): Promise<string> {
  const key = getSmartHealthCardSigningKey();
  const payload: SmartHealthCardJwt = {
    iss: issuer,
    nbf: Math.floor(Date.now() / 1000),
    exp,
    vc: {
      type: SHC_VC_TYPE,
      credentialSubject: {
        fhirVersion: FHIR_VERSION,
        fhirBundle: bundle,
      },
    },
  };
  const compressedPayload = deflateRawSync(Buffer.from(JSON.stringify(payload)));
  return new CompactSign(compressedPayload)
    .setProtectedHeader({ alg: SHC_SIGNING_ALG, kid: key.kid, zip: 'DEF' })
    .sign(key.privateKey);
}

async function verifySmartHealthCardCredential(
  credential: string
): Promise<{ payload: SmartHealthCardJwt; issuerTrusted: boolean }> {
  const unverifiedPayload = decodeSmartHealthCardPayload(credential);
  const { publicKey, issuerTrusted } = await getSmartHealthCardPublicKey(credential, unverifiedPayload.iss);
  const { payload, protectedHeader } = await compactVerify(credential, publicKey);
  if (protectedHeader.alg !== SHC_SIGNING_ALG) {
    throw new Error('Unsupported SMART Health Card signing algorithm');
  }
  const bytes = protectedHeader.zip === 'DEF' ? inflateRawSync(payload) : payload;
  const jwt = JSON.parse(Buffer.from(bytes).toString('utf8')) as SmartHealthCardJwt;
  validateSmartHealthCardPayload(jwt, { requireTrustedIssuer: issuerTrusted });
  return { payload: jwt, issuerTrusted };
}

function validateSmartHealthCardPayload(
  payload: SmartHealthCardJwt,
  options: { requireTrustedIssuer?: boolean } = {}
): void {
  const now = Math.floor(Date.now() / 1000);
  if (options.requireTrustedIssuer && payload.iss !== getConfig().issuer) {
    throw new Error('Untrusted SMART Health Card issuer');
  }
  if (typeof payload.nbf !== 'number' || payload.nbf > now) {
    throw new Error('SMART Health Card is not yet valid');
  }
  if (payload.exp !== undefined && payload.exp <= now) {
    throw new Error('SMART Health Card has expired');
  }
  if (!payload.vc?.type?.includes(SHC_VC_TYPE[0])) {
    throw new Error('Invalid SMART Health Card credential type');
  }
  if (payload.vc.credentialSubject.fhirVersion !== FHIR_VERSION) {
    throw new Error('Unsupported SMART Health Card FHIR version');
  }
  if (payload.vc.credentialSubject.fhirBundle?.resourceType !== 'Bundle') {
    throw new Error('Missing SMART Health Card FHIR Bundle');
  }
}

function readSmartHealthCardCredential(params: VerifySmartHealthCardParams): string {
  if (params.credential) {
    return params.credential;
  }
  if (params.shcUri) {
    return decodeSmartHealthCardUri(params.shcUri);
  }
  if (params.file) {
    const parsed = JSON.parse(params.file) as { verifiableCredential?: string[] };
    const credential = parsed.verifiableCredential?.[0];
    if (credential) {
      return credential;
    }
  }
  throw new Error('Expected credential, shcUri, or file');
}

function writeSmartHealthCardFile(credential: string): { verifiableCredential: string[] } {
  return { verifiableCredential: [credential] };
}

function encodeSmartHealthCardUri(credential: string): string {
  return (
    'shc:/' +
    credential
      .split('')
      .map((char) => {
        const value = (char.codePointAt(0) as number) - 45;
        if (value < 0 || value > 77) {
          throw new Error(`Invalid SMART Health Card JWS character: ${char}`);
        }
        return value.toString().padStart(2, '0');
      })
      .join('')
  );
}

function decodeSmartHealthCardUri(uri: string): string {
  const numeric = uri.startsWith('shc:/') ? uri.substring(5) : uri;
  if (!/^\d+$/.test(numeric) || numeric.length % 2 !== 0) {
    throw new Error('Invalid SMART Health Card numeric encoding');
  }
  let result = '';
  for (let i = 0; i < numeric.length; i += 2) {
    result += String.fromCodePoint(Number.parseInt(numeric.substring(i, i + 2), 10) + 45);
  }
  return result;
}

function getSmartHealthCardSigningKey(): SmartHealthCardSigningKey {
  const jwk = getSmartHealthCardSigningJwk();
  return {
    privateKey: getSigningKey(SHC_SIGNING_ALG),
    kid: jwk.kid as string,
  };
}

function getSmartHealthCardSigningJwk(): JWK {
  const jwk = getJwks().keys.find((key) => key.alg === SHC_SIGNING_ALG);
  if (!jwk?.kid) {
    throw new Error(`Signing key not found for alg: ${SHC_SIGNING_ALG}`);
  }
  return jwk;
}

function decodeSmartHealthCardPayload(credential: string): SmartHealthCardJwt {
  const [headerPart, payloadPart] = credential.split('.');
  if (!headerPart || !payloadPart) {
    throw new Error('Invalid SMART Health Card credential');
  }
  const header = decodeProtectedHeader(credential);
  const payload = Buffer.from(payloadPart, 'base64url');
  const bytes = header.zip === 'DEF' ? inflateRawSync(payload) : payload;
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as SmartHealthCardJwt;
}

async function getSmartHealthCardPublicKey(
  credential: string,
  issuer: string
): Promise<{ publicKey: KeyLike; issuerTrusted: boolean }> {
  const header = decodeProtectedHeader(credential);
  if (header.alg !== SHC_SIGNING_ALG) {
    throw new Error('Unsupported SMART Health Card signing algorithm');
  }
  if (!header.kid) {
    throw new Error('Missing SMART Health Card key ID');
  }
  const localJwk = getJwks().keys.find((key) => key.kid === header.kid && key.alg === SHC_SIGNING_ALG);
  if (localJwk) {
    return {
      publicKey: (await importJWK(localJwk, SHC_SIGNING_ALG)) as KeyLike,
      issuerTrusted: issuer === getConfig().issuer,
    };
  }
  const externalJwk = (await getExternalSmartHealthCardJwks(issuer)).find(
    (key) => key.kid === header.kid && key.alg === SHC_SIGNING_ALG
  );
  if (!externalJwk) {
    throw new Error('SMART Health Card key not found');
  }
  return { publicKey: (await importJWK(externalJwk, SHC_SIGNING_ALG)) as KeyLike, issuerTrusted: false };
}

async function getExternalSmartHealthCardJwks(issuer: string): Promise<JWK[]> {
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== 'https:') {
    throw new Error('External SMART Health Card issuer must use HTTPS');
  }
  if (isUnsafeHostname(issuerUrl.hostname)) {
    throw new Error('Unsafe SMART Health Card issuer host');
  }
  const jwksUrl = new URL('/.well-known/jwks.json', issuerUrl);
  const cached = jwksCache.get(jwksUrl.toString());
  if (cached) {
    return cached;
  }
  const response = await fetch(jwksUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`SMART Health Card issuer JWKS request failed: ${response.status}`);
  }
  const jwks = (await response.json()) as { keys?: JWK[] };
  const keys = jwks.keys ?? [];
  jwksCache.set(jwksUrl.toString(), keys);
  return keys;
}

function isUnsafeHostname(hostname: string): boolean {
  const ipVersion = isIP(hostname);
  if (ipVersion === 0) {
    return ['localhost', 'localhost.localdomain'].includes(hostname.toLowerCase());
  }
  if (ipVersion === 4) {
    return /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(hostname);
  }
  return hostname === '::1' || hostname.toLowerCase().startsWith('fe80:') || hostname.toLowerCase().startsWith('fc');
}

function makeParameters(values: Record<string, string | boolean | undefined>): Parameters {
  const parameters: Parameters = { resourceType: 'Parameters', parameter: [] };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    parameters.parameter?.push(
      typeof value === 'boolean' ? { name, valueBoolean: value } : { name, valueString: value }
    );
  }
  return parameters;
}
