// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, concatUrls, ContentType, normalizeErrorString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, Parameters, Patient, Resource } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { base64url, compactDecrypt, CompactEncrypt } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { makeOperationDefinition } from './definitions';
import { getPatientEverything } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

const SHL_CONTENT_TYPE_FHIR_JSON = 'application/fhir+json';
const SHL_PASSCODE_BCRYPT_ROUNDS = 12;

interface GenerateSmartHealthLinkParams {
  _type?: string;
  exp?: number;
  label?: string;
  passcode?: string;
  includeQrCode?: boolean;
}

interface ResolveSmartHealthLinkParams {
  shlink?: string;
  recipient?: string;
  passcode?: string;
}

interface SmartHealthLinkPayload {
  url: string;
  key: string;
  exp?: number;
  flag?: string;
  label?: string;
  v: 1;
}

interface SmartHealthLinkRecord {
  id: string;
  projectId: string;
  patientReference: string;
  payload: SmartHealthLinkPayload;
  passcodeHash?: string;
  files: SmartHealthLinkManifestFile[];
}

interface SmartHealthLinkManifestFile {
  contentType: typeof SHL_CONTENT_TYPE_FHIR_JSON;
  embedded: string;
  lastUpdated: string;
}

const smartHealthLinkRecords = new Map<string, SmartHealthLinkRecord>();

export const generateSmartHealthLinkOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Patient' },
  {
    name: 'GenerateSmartHealthLink',
    code: 'generate-smart-health-link',
    affectsState: true,
    parameter: [
      { use: 'in', name: '_type', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'exp', type: 'integer', min: 0, max: '1' },
      { use: 'in', name: 'label', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'passcode', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'includeQrCode', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'shlink', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'manifestUrl', type: 'uri', min: 1, max: '1' },
      { use: 'out', name: 'qrCodeDataUrl', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'id', type: 'id', min: 1, max: '1' },
    ],
  }
);

export const resolveSmartHealthLinkOperation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'ResolveSmartHealthLink',
    code: 'resolve-smart-health-link',
    affectsState: false,
    parameter: [
      { use: 'in', name: 'shlink', type: 'string', min: 1, max: '1' },
      { use: 'in', name: 'recipient', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'passcode', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'valid', type: 'boolean', min: 1, max: '1' },
      { use: 'out', name: 'manifest', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'fhirResources', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'error', type: 'string', min: 0, max: '1' },
    ],
  }
);

export async function generateSmartHealthLinkHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const ctx = getAuthenticatedContext();
    const patient = await ctx.repo.readResource<Patient>('Patient', req.params.id);
    const params = parseInputParameters<GenerateSmartHealthLinkParams>(generateSmartHealthLinkOperation, req);
    const bundle = await getPatientEverything(ctx.repo, patient, {
      _count: 1000,
      _type: params._type
        ?.split(',')
        .map((s) => s.trim() as Resource['resourceType'])
        .filter(Boolean),
    });
    const key = base64url.encode(randomBytes(32));
    const id = randomUUID();
    const manifestUrl = concatUrls(getConfig().baseUrl, `/fhir/R4/.well-known/smart-health-links/${id}/manifest.json`);
    const payload: SmartHealthLinkPayload = {
      url: manifestUrl,
      key,
      exp: params.exp,
      flag: params.passcode ? 'P' : undefined,
      label: params.label,
      v: 1,
    };
    const encryptedBundle = await encryptSmartHealthLinkFile(bundle, key);
    smartHealthLinkRecords.set(id, {
      id,
      projectId: ctx.project.id,
      patientReference: `Patient/${patient.id}`,
      payload,
      passcodeHash: params.passcode ? await hashPasscode(params.passcode) : undefined,
      files: [
        {
          contentType: SHL_CONTENT_TYPE_FHIR_JSON,
          embedded: encryptedBundle,
          lastUpdated: new Date().toISOString(),
        },
      ],
    });
    const shlink = encodeSmartHealthLink(payload);
    const qrCodeDataUrl = params.includeQrCode ? await QRCode.toDataURL(shlink) : undefined;
    return [allOk, makeParameters({ shlink, manifestUrl, qrCodeDataUrl, id })];
  } catch (err) {
    return [badRequest(normalizeErrorString(err))];
  }
}

export async function resolveSmartHealthLinkHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const params = parseInputParameters<ResolveSmartHealthLinkParams>(resolveSmartHealthLinkOperation, req);
    const result = await resolveGeneratedSmartHealthLink(params.shlink as string, params.passcode);
    return [
      allOk,
      makeParameters({
        valid: true,
        manifest: JSON.stringify(result.manifest),
        fhirResources: JSON.stringify(result.fhirResources),
      }),
    ];
  } catch (err) {
    return [allOk, makeParameters({ valid: false, error: normalizeErrorString(err) })];
  }
}

export async function smartHealthLinkManifestHandler(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const record = smartHealthLinkRecords.get(id);
  if (!record) {
    res.status(404).json({ error: 'SMART Health Link not found' });
    return;
  }
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : undefined;
  const outcome = await validateSmartHealthLinkRecord(record, passcode);
  if (outcome) {
    res.status(400).json({ error: outcome });
    return;
  }
  res.status(200).contentType(ContentType.JSON).json(buildSmartHealthLinkManifest(record));
}

async function resolveGeneratedSmartHealthLink(
  shlink: string,
  passcode?: string
): Promise<{ manifest: object; fhirResources: Resource[] }> {
  const payload = parseSmartHealthLink(shlink);
  const id = getSmartHealthLinkId(payload.url);
  const record = id ? smartHealthLinkRecords.get(id) : undefined;
  if (!record) {
    throw new Error('Only Medplum-generated SMART Health Links are supported by this prototype');
  }
  const outcome = await validateSmartHealthLinkRecord(record, passcode);
  if (outcome) {
    throw new Error(outcome);
  }
  const manifest = buildSmartHealthLinkManifest(record);
  const fhirResources: Resource[] = [];
  for (const file of record.files) {
    const { contentType, plaintext } = await decryptSmartHealthLinkFile(file.embedded, payload.key);
    if (contentType === SHL_CONTENT_TYPE_FHIR_JSON) {
      fhirResources.push(JSON.parse(plaintext) as Resource);
    }
  }
  return { manifest, fhirResources };
}

async function encryptSmartHealthLinkFile(bundle: Bundle, key: string): Promise<string> {
  const plaintext = Buffer.from(JSON.stringify(bundle));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', cty: SHL_CONTENT_TYPE_FHIR_JSON })
    .encrypt(base64url.decode(key));
}

async function decryptSmartHealthLinkFile(
  jwe: string,
  key: string
): Promise<{ contentType: string | undefined; plaintext: string }> {
  const { plaintext, protectedHeader } = await compactDecrypt(jwe, base64url.decode(key));
  return { contentType: protectedHeader.cty, plaintext: Buffer.from(plaintext).toString('utf8') };
}

function buildSmartHealthLinkManifest(record: SmartHealthLinkRecord): object {
  return {
    status: 'finalized',
    files: record.files,
  };
}

async function validateSmartHealthLinkRecord(
  record: SmartHealthLinkRecord,
  passcode?: string
): Promise<string | undefined> {
  const now = Math.floor(Date.now() / 1000);
  if (record.payload.exp !== undefined && record.payload.exp <= now) {
    return 'SMART Health Link has expired';
  }
  if (record.payload.flag?.includes('P')) {
    if (!passcode || !record.passcodeHash || !(await bcrypt.compare(passcode, record.passcodeHash))) {
      return 'Invalid SMART Health Link passcode';
    }
  }
  return undefined;
}

function encodeSmartHealthLink(payload: SmartHealthLinkPayload): string {
  return `shlink:/${base64url.encode(Buffer.from(JSON.stringify(payload)))}`;
}

function parseSmartHealthLink(input: string): SmartHealthLinkPayload {
  const raw = input.includes('#shlink:/') ? input.substring(input.indexOf('#shlink:/') + 1) : input;
  if (!raw.startsWith('shlink:/')) {
    throw new Error('Invalid SMART Health Link URI');
  }
  const payload = JSON.parse(Buffer.from(base64url.decode(raw.substring('shlink:/'.length))).toString('utf8'));
  if (payload?.v !== 1 || typeof payload.url !== 'string' || typeof payload.key !== 'string') {
    throw new Error('Invalid SMART Health Link payload');
  }
  return payload as SmartHealthLinkPayload;
}

function getSmartHealthLinkId(manifestUrl: string): string | undefined {
  const match = /\/smart-health-links\/([^/]+)\/manifest\.json$/.exec(manifestUrl);
  return match?.[1];
}

function hashPasscode(passcode: string): Promise<string> {
  return bcrypt.hash(passcode, SHL_PASSCODE_BCRYPT_ROUNDS);
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
