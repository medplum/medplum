// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, normalizeErrorString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import type { JWK, KeyLike } from 'jose';
import { calculateJwkThumbprint, CompactSign, compactVerify, exportJWK, generateKeyPair } from 'jose';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import QRCode from 'qrcode';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { makeOperationDefinition } from './definitions';
import { getPatientEverything } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

const SHC_VC_TYPE = ['https://smarthealth.cards#health-card'];
const FHIR_VERSION = '4.0.1';

let signingKeyPromise: Promise<SmartHealthCardSigningKey> | undefined;

interface SmartHealthCardSigningKey {
  privateKey: KeyLike;
  publicKey: KeyLike;
  publicJwk: JWK;
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
        keyId: (await getSmartHealthCardSigningKey()).kid,
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
    const payload = await verifySmartHealthCardCredential(credential);
    const header = JSON.parse(Buffer.from(credential.split('.')[0], 'base64url').toString('utf8')) as { kid?: string };

    return [
      allOk,
      makeParameters({
        valid: true,
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
  const key = await getSmartHealthCardSigningKey();
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
    .setProtectedHeader({ alg: 'ES256', kid: key.kid, zip: 'DEF' })
    .sign(key.privateKey);
}

async function verifySmartHealthCardCredential(credential: string): Promise<SmartHealthCardJwt> {
  const key = await getSmartHealthCardSigningKey();
  const { payload, protectedHeader } = await compactVerify(credential, key.publicKey);
  if (protectedHeader.alg !== 'ES256') {
    throw new Error('Unsupported SMART Health Card signing algorithm');
  }
  if (protectedHeader.kid !== key.kid) {
    throw new Error('Untrusted SMART Health Card key');
  }
  const bytes = protectedHeader.zip === 'DEF' ? inflateRawSync(payload) : payload;
  const jwt = JSON.parse(Buffer.from(bytes).toString('utf8')) as SmartHealthCardJwt;
  validateSmartHealthCardPayload(jwt);
  return jwt;
}

function validateSmartHealthCardPayload(payload: SmartHealthCardJwt): void {
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== getConfig().issuer) {
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

async function getSmartHealthCardSigningKey(): Promise<SmartHealthCardSigningKey> {
  signingKeyPromise ??= generateSmartHealthCardSigningKey();
  return signingKeyPromise;
}

async function generateSmartHealthCardSigningKey(): Promise<SmartHealthCardSigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';
  const kid = await calculateJwkThumbprint(publicJwk, 'sha256');
  return { privateKey, publicKey, publicJwk, kid };
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
