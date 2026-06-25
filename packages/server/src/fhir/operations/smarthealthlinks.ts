// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  concatUrls,
  ContentType,
  isNotFound,
  isString,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, Bundle, Patient, Resource, SmartHealthLink } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { base64url, compactDecrypt, CompactEncrypt } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import QRCode from 'qrcode';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';
import { getGlobalSystemRepo } from '../repo';
import { makeOperationDefinition } from './definitions';
import { getPatientEverything } from './patienteverything';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const SHL_CONTENT_TYPE_FHIR_JSON = 'application/fhir+json';
const SHL_CONTENT_TYPE_JOSE = 'application/jose';
const SHL_PASSCODE_BCRYPT_ROUNDS = 10;

type SmartHealthLinkMode = 'manifest' | 'direct';

interface GenerateSmartHealthLinkParams {
  mode?: SmartHealthLinkMode;
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

interface SmartHealthLinkManifestFile {
  contentType: string;
  embedded: string;
  lastUpdated?: string;
}

export const smartHealthLinkRouter = Router();
smartHealthLinkRouter.post('/:id/manifest', smartHealthLinkManifestHandler);
smartHealthLinkRouter.get('/:id/payload', smartHealthLinkPayloadHandler);

export const generateSmartHealthLinkOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Patient' },
  {
    name: 'GenerateSmartHealthLink',
    code: 'generate-smart-health-link',
    affectsState: true,
    parameter: [
      { use: 'in', name: 'mode', type: 'string', min: 0, max: '1' },
      { use: 'in', name: '_type', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'exp', type: 'integer', min: 0, max: '1' },
      { use: 'in', name: 'label', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'passcode', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'includeQrCode', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'shlink', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'url', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'manifestUrl', type: 'string', min: 0, max: '1' },
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
  const ctx = getAuthenticatedContext();
  const patient = await ctx.repo.readResource<Patient>('Patient', req.params.id);
  const params = parseInputParameters<GenerateSmartHealthLinkParams>(generateSmartHealthLinkOperation, req);
  const mode = params.mode ?? 'manifest';
  if (mode !== 'manifest' && mode !== 'direct') {
    throw new OperationOutcomeError(badRequest('Expected mode to be manifest or direct'));
  }
  if (mode === 'direct') {
    if (params.exp === undefined) {
      throw new OperationOutcomeError(badRequest('Expected exp for direct SMART Health Link'));
    }
    if (params.passcode) {
      throw new OperationOutcomeError(badRequest('Passcode is not supported for direct SMART Health Links'));
    }
  }
  const bundle = await getPatientEverything(ctx.repo, patient, {
    _count: 1000,
    _type: params._type
      ?.split(',')
      .map((s) => s.trim() as Resource['resourceType'])
      .filter(Boolean),
  });
  const key = base64url.encode(randomBytes(32));
  const id = randomUUID();
  const url = concatUrls(getConfig().baseUrl, `/shl/${id}/${mode === 'direct' ? 'payload' : 'manifest'}`);
  let flag: string | undefined;
  if (mode === 'direct') {
    flag = 'U';
  } else if (params.passcode) {
    flag = 'P';
  }
  const payload: SmartHealthLinkPayload = {
    url,
    key,
    exp: params.exp,
    flag,
    label: params.label,
    v: 1,
  };
  const shlBundle: Bundle = mode === 'direct' ? { ...bundle, type: 'collection' } : bundle;
  const encryptedBundle = await encryptSmartHealthLinkFile(shlBundle, key);
  const binary = await ctx.systemRepo.createResource<Binary>({
    resourceType: 'Binary',
    meta: { project: ctx.project.id },
    contentType: SHL_CONTENT_TYPE_JOSE,
  });
  await getBinaryStorage().writeBinary(binary, undefined, SHL_CONTENT_TYPE_JOSE, Readable.from(encryptedBundle));
  await ctx.systemRepo.createResource<SmartHealthLink>(
    {
      resourceType: 'SmartHealthLink',
      id,
      meta: { project: ctx.project.id },
      status: 'active',
      mode,
      subject: { reference: `Patient/${patient.id}` },
      url,
      label: params.label,
      flag,
      expiresAt: params.exp !== undefined ? new Date(params.exp * 1000).toISOString() : undefined,
      passcodeHash: params.passcode ? await hashPasscode(params.passcode) : undefined,
      file: [
        {
          contentType: SHL_CONTENT_TYPE_FHIR_JSON,
          attachment: {
            contentType: SHL_CONTENT_TYPE_JOSE,
            url: `Binary/${binary.id}`,
          },
        },
      ],
    },
    { assignedId: true }
  );
  const shlink = encodeSmartHealthLink(payload);
  const qrCodeDataUrl = params.includeQrCode ? await QRCode.toDataURL(shlink) : undefined;
  return [
    allOk,
    buildOutputParameters(generateSmartHealthLinkOperation, {
      shlink,
      url,
      manifestUrl: mode === 'manifest' ? url : undefined,
      qrCodeDataUrl,
      id,
    }),
  ];
}

export async function resolveSmartHealthLinkHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const params = parseInputParameters<ResolveSmartHealthLinkParams>(resolveSmartHealthLinkOperation, req);
    if (!isString(params.shlink)) {
      throw new Error('Expected shlink to be a string');
    }
    const result = await resolveGeneratedSmartHealthLink(params.shlink, params.recipient, params.passcode);
    return [
      allOk,
      buildOutputParameters(resolveSmartHealthLinkOperation, {
        valid: true,
        manifest: JSON.stringify(result.manifest),
        fhirResources: JSON.stringify(result.fhirResources),
      }),
    ];
  } catch (err) {
    return [
      allOk,
      buildOutputParameters(resolveSmartHealthLinkOperation, { valid: false, error: normalizeErrorString(err) }),
    ];
  }
}

export async function smartHealthLinkManifestHandler(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const smartHealthLink = await readSmartHealthLink(id);
  if (!smartHealthLink) {
    res.status(404).json({ error: 'SMART Health Link not found' });
    return;
  }
  if (smartHealthLink.mode !== 'manifest') {
    res.status(404).json({ error: 'SMART Health Link not found' });
    return;
  }
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : undefined;
  const outcome = await validateSmartHealthLink(smartHealthLink, passcode);
  if (outcome) {
    res.status(400).json({ error: outcome });
    return;
  }
  res.status(200).contentType(ContentType.JSON).json(await buildSmartHealthLinkManifest(smartHealthLink));
}

export async function smartHealthLinkPayloadHandler(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const smartHealthLink = await readSmartHealthLink(id);
  if (smartHealthLink?.mode !== 'direct') {
    res.status(404).json({ error: 'SMART Health Link not found' });
    return;
  }
  const recipient = Array.isArray(req.query.recipient) ? req.query.recipient[0] : req.query.recipient;
  if (!isString(recipient) || !recipient) {
    res.status(400).json({ error: 'Expected recipient query parameter' });
    return;
  }
  const outcome = await validateSmartHealthLink(smartHealthLink);
  if (outcome) {
    res.status(400).json({ error: outcome });
    return;
  }
  const encrypted = await readSmartHealthLinkEncryptedFile(smartHealthLink);
  if (!encrypted) {
    res.status(404).json({ error: 'SMART Health Link payload not found' });
    return;
  }
  res.status(200).contentType(SHL_CONTENT_TYPE_JOSE).send(encrypted);
}

async function resolveGeneratedSmartHealthLink(
  shlink: string,
  recipient?: string,
  passcode?: string
): Promise<{ manifest: object; fhirResources: Resource[] }> {
  const payload = parseSmartHealthLink(shlink);
  const id = getSmartHealthLinkId(payload.url);
  const smartHealthLink = id ? await readSmartHealthLink(id) : undefined;
  if (!smartHealthLink) {
    throw new Error('Only Medplum-generated SMART Health Links are supported by this prototype');
  }
  const outcome = await validateSmartHealthLink(smartHealthLink, passcode);
  if (outcome) {
    throw new Error(outcome);
  }
  if (smartHealthLink.mode === 'direct' && !recipient) {
    throw new Error('Expected recipient query parameter');
  }
  const fhirResources: Resource[] = [];
  if (smartHealthLink.mode === 'direct') {
    const encrypted = await readSmartHealthLinkEncryptedFile(smartHealthLink);
    if (!encrypted) {
      throw new Error('SMART Health Link payload not found');
    }
    const { contentType, plaintext } = await decryptSmartHealthLinkFile(encrypted, payload.key);
    if (contentType === SHL_CONTENT_TYPE_FHIR_JSON) {
      fhirResources.push(JSON.parse(plaintext) as Resource);
    }
    return { manifest: {}, fhirResources };
  }
  const manifest = await buildSmartHealthLinkManifest(smartHealthLink);
  for (const file of manifest.files) {
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

async function buildSmartHealthLinkManifest(
  smartHealthLink: SmartHealthLink
): Promise<{ status: 'finalized'; files: SmartHealthLinkManifestFile[] }> {
  const files: SmartHealthLinkManifestFile[] = [];
  for (const file of smartHealthLink.file) {
    const encrypted = await readSmartHealthLinkEncryptedFile(smartHealthLink, file);
    if (encrypted) {
      files.push({
        contentType: file.contentType,
        embedded: encrypted,
        lastUpdated: smartHealthLink.meta?.lastUpdated,
      });
    }
  }
  return {
    status: 'finalized',
    files,
  };
}

async function validateSmartHealthLink(
  smartHealthLink: SmartHealthLink,
  passcode?: string
): Promise<string | undefined> {
  if (smartHealthLink.status !== 'active') {
    return 'SMART Health Link has been revoked';
  }
  if (smartHealthLink.expiresAt !== undefined && new Date(smartHealthLink.expiresAt).getTime() <= Date.now()) {
    return 'SMART Health Link has expired';
  }
  if (smartHealthLink.flag?.includes('P')) {
    if (!passcode || !smartHealthLink.passcodeHash || !(await bcrypt.compare(passcode, smartHealthLink.passcodeHash))) {
      return 'Invalid SMART Health Link passcode';
    }
  }
  return undefined;
}

async function readSmartHealthLink(id: string | undefined): Promise<SmartHealthLink | undefined> {
  if (!id) {
    return undefined;
  }
  try {
    return await getGlobalSystemRepo().readResource<SmartHealthLink>('SmartHealthLink', id);
  } catch (err) {
    if (isNotFound(normalizeOperationOutcome(err))) {
      return undefined;
    }
    throw err;
  }
}

async function readSmartHealthLinkEncryptedFile(
  smartHealthLink: SmartHealthLink,
  file = smartHealthLink.file[0]
): Promise<string | undefined> {
  const attachment = file?.attachment;
  if (!attachment) {
    return undefined;
  }
  if (attachment.data) {
    return Buffer.from(attachment.data, 'base64').toString('utf8');
  }
  const binaryReference = attachment.url;
  if (!binaryReference?.startsWith('Binary/')) {
    return undefined;
  }
  const binary = await getGlobalSystemRepo().readResource<Binary>('Binary', binaryReference.substring('Binary/'.length));
  const stream = await getBinaryStorage().readBinary(binary);
  return readStreamToString(stream);
}

function encodeSmartHealthLink(payload: SmartHealthLinkPayload): string {
  return `shlink:/${base64url.encode(Buffer.from(JSON.stringify(payload)))}`;
}

function parseSmartHealthLink(input: string): SmartHealthLinkPayload {
  const fragmentIndex = input.indexOf('#shlink:/');
  const raw = fragmentIndex === -1 ? input : input.substring(fragmentIndex + 1);
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
  const match = /\/shl\/([^/]+)\/(?:manifest|payload)$/.exec(manifestUrl);
  return match?.[1];
}

function hashPasscode(passcode: string): Promise<string> {
  return bcrypt.hash(passcode, SHL_PASSCODE_BCRYPT_ROUNDS);
}
