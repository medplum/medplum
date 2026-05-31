// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, normalizeErrorString, OAuthSigningAlgorithm } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { JWK, KeyLike, ProtectedHeaderParameters } from 'jose';
import { CompactSign, compactVerify, decodeProtectedHeader, importJWK } from 'jose';
import { isIP } from 'node:net';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import QRCode from 'qrcode';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getJwks, getSigningKey } from '../../oauth/keys';
import { makeOperationDefinition, makeParameters } from './definitions';
import { getPatientEverything } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

const SHC_VC_TYPE = ['https://smarthealth.cards#health-card'];
const FHIR_VERSION = '4.0.1';
const SHC_SIGNING_ALG = OAuthSigningAlgorithm.ES256;

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
      { use: 'out', name: 'issuerTrusted', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'verified', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'issuer', type: 'uri', min: 0, max: '1' },
      { use: 'out', name: 'keyId', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'fhirBundle', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'error', type: 'string', min: 0, max: '1' },
    ],
  }
);

/**
 * Handles the Patient/$generate-smart-health-card operation.
 *
 * Builds a Patient/$everything bundle for the requested patient, signs it as a SMART Health Card credential, and
 * returns the credential in JWS, SHC URI, and SMART Health Card file formats.
 *
 * @param req - FHIR request containing the patient ID and optional parameters for filtering, expiration, and QR code generation.
 * @returns FHIR response containing the generated SMART Health Card credential in multiple formats and related metadata.
 */
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

/**
 * Handles the system-level $verify-smart-health-card operation.
 *
 * Reads a SMART Health Card credential from one of the supported input formats, verifies the signature when possible,
 * and returns the decoded issuer, key ID, and FHIR Bundle details.
 *
 * @param req - FHIR request containing the SMART Health Card credential in one of the supported input formats.
 * @returns FHIR response containing the verification results, including validity, issuer trust, and decoded payload details.
 */
export async function verifySmartHealthCardHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<VerifySmartHealthCardParams>(verifySmartHealthCardOperation, req);
  const credential = readSmartHealthCardCredential(params);
  const unverifiedPayload = decodeSmartHealthCardPayload(credential);
  let issuerTrusted: boolean | undefined = undefined;
  let header: ProtectedHeaderParameters | undefined = undefined;
  let valid = true;
  let error: string | undefined = undefined;

  try {
    ({ issuerTrusted } = await verifySmartHealthCardCredential(credential));
    header = decodeProtectedHeader(credential);
  } catch (err) {
    getLogger().warn('SMART Health Card validation failed', { err });
    valid = false;
    error = normalizeErrorString(err);
  }

  return [
    allOk,
    makeParameters({
      valid,
      issuerTrusted,
      verified: issuerTrusted,
      issuer: unverifiedPayload.iss,
      keyId: header?.kid,
      fhirBundle: JSON.stringify(unverifiedPayload.vc.credentialSubject.fhirBundle),
      error,
    }),
  ];
}

/**
 * Creates a compressed JWS credential containing the given FHIR Bundle as a SMART Health Card Verifiable Credential.
 *
 * @param bundle - FHIR Bundle to embed in the credential subject.
 * @param issuer - Issuer URL to place in the JWT `iss` claim.
 * @param exp - Optional expiration time as a NumericDate value in seconds since the Unix epoch.
 * @returns Compact JWS string for the signed SMART Health Card credential.
 */
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

/**
 * Verifies a SMART Health Card credential signature and validates the decoded payload claims.
 *
 * @param credential - Compact JWS credential to verify.
 * @returns The decoded SMART Health Card JWT payload and whether the credential came from a trusted issuer.
 */
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

/**
 * Validates SMART Health Card JWT claims and embedded FHIR metadata.
 *
 * @param payload - Decoded SMART Health Card JWT payload to validate.
 * @param options - Validation options, including whether to require the configured issuer.
 * @param options.requireTrustedIssuer - When true, requires the JWT `iss` claim to match the configured issuer URL; otherwise, allows any issuer.
 */
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

/**
 * Extracts the compact JWS credential from supported verification input parameters.
 *
 * @param params - Verification parameters containing either `credential`, `shcUri`, or SMART Health Card file JSON.
 * @returns Compact JWS credential string.
 */
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

/**
 * Wraps a SMART Health Card credential in the standard file export shape.
 *
 * @param credential - Compact JWS credential to include in the file payload.
 * @returns SMART Health Card file object with a `verifiableCredential` array.
 */
function writeSmartHealthCardFile(credential: string): { verifiableCredential: string[] } {
  return { verifiableCredential: [credential] };
}

/**
 * Encodes a compact JWS credential as an `shc:/` SMART Health Card URI.
 *
 * @param credential - Compact JWS credential to numerically encode.
 * @returns SMART Health Card URI string.
 */
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

/**
 * Decodes a SMART Health Card URI or numeric payload back into a compact JWS credential.
 *
 * @param uri - `shc:/` URI or bare numeric SMART Health Card encoding.
 * @returns Compact JWS credential string.
 */
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

/**
 * Resolves the local private signing key and key ID for SMART Health Card issuance.
 *
 * @returns Private key and `kid` used to sign SMART Health Card credentials.
 */
function getSmartHealthCardSigningKey(): SmartHealthCardSigningKey {
  const jwk = getSmartHealthCardSigningJwk();
  return {
    privateKey: getSigningKey(SHC_SIGNING_ALG),
    kid: jwk.kid as string,
  };
}

/**
 * Finds the local JWK metadata for the configured SMART Health Card signing algorithm.
 *
 * @returns JWK containing the signing key metadata.
 */
function getSmartHealthCardSigningJwk(): JWK {
  const jwk = getJwks().keys.find((key) => key.alg === SHC_SIGNING_ALG);
  if (!jwk?.kid) {
    throw new Error(`Signing key not found for alg: ${SHC_SIGNING_ALG}`);
  }
  return jwk;
}

/**
 * Decodes a SMART Health Card credential payload without verifying its signature.
 *
 * @param credential - Compact JWS credential to decode.
 * @returns Decoded SMART Health Card JWT payload.
 */
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

/**
 * Resolves the public key needed to verify a SMART Health Card credential.
 *
 * Uses a matching local JWK when available; otherwise, fetches the issuer JWKS after issuer host validation.
 *
 * @param credential - Compact JWS credential whose protected header contains the key ID.
 * @param issuer - Issuer URL from the unverified credential payload.
 * @returns Public key and whether the issuer matches the configured local issuer.
 */
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

/**
 * Fetches external SMART Health Card issuer JWKS from the standard well-known URL.
 *
 * @param issuer - External issuer URL to query.
 * @returns JWK array from the issuer JWKS document.
 */
async function getExternalSmartHealthCardJwks(issuer: string): Promise<JWK[]> {
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== 'https:') {
    throw new Error('External SMART Health Card issuer must use HTTPS');
  }
  if (isUnsafeHostname(issuerUrl.hostname)) {
    throw new Error('Unsafe SMART Health Card issuer host');
  }
  const jwksUrl = new URL('/.well-known/jwks.json', issuerUrl);
  const response = await fetch(jwksUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`SMART Health Card issuer JWKS request failed: ${response.status}`);
  }
  const jwks = (await response.json()) as { keys?: JWK[] };
  return jwks.keys ?? [];
}

/**
 * Checks whether a hostname should be rejected for outbound SMART Health Card JWKS lookup.
 *
 * @param hostname - Hostname from an external issuer URL.
 * @returns True when the hostname is localhost, link-local, loopback, private, or otherwise unsafe.
 */
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
