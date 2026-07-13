// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  GenerateSmartHealthLinkParams,
  ResolveSmartHealthLinkParams,
  SmartHealthLinkManifestFile,
  SmartHealthLinkPayload,
} from '@medplum/core';
import {
  allOk,
  badRequest,
  concatUrls,
  ContentType,
  encodeSmartHealthLink,
  getSmartHealthLinkId,
  isGone,
  isNotFound,
  isString,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  parseSmartHealthLink,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, Bundle, Patient, Resource, SmartHealthLink } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Router } from 'express';
import { base64url, compactDecrypt, CompactEncrypt } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';
import QRCode from 'qrcode';
import { bcryptHashPassword } from '../../auth/utils';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';
import { safeFetch } from '../../util/url';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../repo';
import { makeOperationDefinition } from './definitions';
import { getPatientEverything } from './patienteverything';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const EXTERNAL_SMART_HEALTH_LINK_FETCH_TIMEOUT_MS = 5000;
const MAX_EXTERNAL_SMART_HEALTH_LINK_PAYLOAD_BYTES = 10 * 1024 * 1024;

interface ResolvedSmartHealthLink {
  manifest?: Record<string, unknown>;
  fhirResources: Resource[];
  recipient?: string;
  sourceOrigin?: string;
  expiresAt?: string;
  warnings?: string[];
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
      { use: 'out', name: 'recipient', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'sourceOrigin', type: 'string', min: 0, max: '1' },
      { use: 'out', name: 'expiresAt', type: 'dateTime', min: 0, max: '1' },
      { use: 'out', name: 'warning', type: 'string', min: 0, max: '*' },
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
    if (params.exp <= Math.floor(Date.now() / 1000)) {
      throw new OperationOutcomeError(badRequest('Expected exp to be in the future for direct SMART Health Link'));
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
  const shlBundle: Bundle =
    mode === 'direct'
      ? {
          ...bundle,
          type: 'collection',
          entry: bundle.entry?.map((entry) => {
            const result = { ...entry };
            delete result.search;
            return result;
          }),
        }
      : bundle;
  const encryptedBundle = await encryptSmartHealthLinkFile(shlBundle, key);
  const binary = await ctx.systemRepo.createResource<Binary>({
    resourceType: 'Binary',
    meta: { project: ctx.project.id },
    contentType: ContentType.JOSE,
  });
  await getBinaryStorage().writeBinary(binary, undefined, ContentType.JOSE, Readable.from(encryptedBundle));
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
      passcodeHash: params.passcode ? await bcryptHashPassword(params.passcode) : undefined,
      file: [
        {
          contentType: ContentType.FHIR_JSON,
          attachment: {
            contentType: ContentType.JOSE,
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
        recipient: result.recipient,
        sourceOrigin: result.sourceOrigin,
        expiresAt: result.expiresAt,
        warning: result.warnings,
      }),
    ];
  } catch (err) {
    return [
      allOk,
      buildOutputParameters(resolveSmartHealthLinkOperation, { valid: false, error: normalizeErrorString(err) }),
    ];
  }
}

export async function smartHealthLinkManifestHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
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
  res
    .status(200)
    .contentType(ContentType.JSON)
    .json(await buildSmartHealthLinkManifest(smartHealthLink));
}

export async function smartHealthLinkPayloadHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
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
  res.status(200).contentType(ContentType.JOSE).send(encrypted);
}

async function resolveGeneratedSmartHealthLink(
  shlink: string,
  recipient?: string,
  passcode?: string
): Promise<ResolvedSmartHealthLink> {
  const payload = parseSmartHealthLink(shlink);
  const id = getSmartHealthLinkId(payload.url);
  const smartHealthLink = id ? await readSmartHealthLink(id) : undefined;
  if (!smartHealthLink) {
    return resolveExternalSmartHealthLink(payload, recipient);
  }
  const outcome = await validateSmartHealthLink(smartHealthLink, passcode);
  if (outcome) {
    throw new Error(outcome);
  }
  if (smartHealthLink.mode === 'direct' && !recipient) {
    throw new Error('Expected recipient parameter');
  }
  const fhirResources: Resource[] = [];
  if (smartHealthLink.mode === 'direct') {
    const encrypted = await readSmartHealthLinkEncryptedFile(smartHealthLink);
    if (!encrypted) {
      throw new Error('SMART Health Link payload not found');
    }
    const { contentType, plaintext } = await decryptSmartHealthLinkFile(encrypted, payload.key);
    if (contentType === ContentType.FHIR_JSON) {
      fhirResources.push(JSON.parse(plaintext) as Resource);
    }
    return {
      fhirResources,
      recipient,
      sourceOrigin: new URL(smartHealthLink.url).origin,
      expiresAt: smartHealthLink.expiresAt,
    };
  }
  const manifest = await buildSmartHealthLinkManifest(smartHealthLink);
  for (const file of manifest.files) {
    const { contentType, plaintext } = await decryptSmartHealthLinkFile(file.embedded, payload.key);
    if (contentType === ContentType.FHIR_JSON) {
      fhirResources.push(JSON.parse(plaintext) as Resource);
    }
  }
  return {
    manifest,
    fhirResources,
    sourceOrigin: new URL(smartHealthLink.url).origin,
    expiresAt: smartHealthLink.expiresAt,
  };
}

async function resolveExternalSmartHealthLink(
  payload: SmartHealthLinkPayload,
  recipient?: string
): Promise<ResolvedSmartHealthLink> {
  if (!payload.flag?.includes('U')) {
    throw new Error('Only direct SMART Health Links are supported');
  }
  if (!recipient) {
    throw new Error('Expected recipient parameter');
  }

  const warnings: string[] = [];
  if (payload.exp !== undefined && payload.exp <= Math.floor(Date.now() / 1000)) {
    warnings.push('SMART Health Link is expired. Content was still available and decrypted.');
  }

  const url = new URL(payload.url);
  url.searchParams.set('recipient', recipient);
  const response = await safeFetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(EXTERNAL_SMART_HEALTH_LINK_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SMART Health Link payload request failed with HTTP ${response.status}`);
  }
  const contentLength = response.headers?.get('content-length');
  if (isString(contentLength) && Number(contentLength) > MAX_EXTERNAL_SMART_HEALTH_LINK_PAYLOAD_BYTES) {
    throw new Error('SMART Health Link payload response is too large');
  }
  const body = await response.text();

  const { contentType, plaintext } = await decryptSmartHealthLinkFile(body, payload.key);
  if (contentType !== ContentType.FHIR_JSON) {
    throw new Error(`Unsupported SMART Health Link content type: ${contentType || 'unknown'}`);
  }

  return {
    fhirResources: [JSON.parse(plaintext) as Resource],
    recipient,
    sourceOrigin: url.origin,
    expiresAt: payload.exp !== undefined ? new Date(payload.exp * 1000).toISOString() : undefined,
    warnings,
  };
}

async function encryptSmartHealthLinkFile(bundle: Bundle, key: string): Promise<string> {
  const plaintext = Buffer.from(JSON.stringify(bundle));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', cty: ContentType.FHIR_JSON })
    .encrypt(base64url.decode(key));
}

async function decryptSmartHealthLinkFile(
  jwe: string,
  key: string
): Promise<{ contentType: string | undefined; plaintext: string }> {
  const { plaintext, protectedHeader } = await compactDecrypt(jwe, base64url.decode(key));
  const bytes = protectedHeader.zip === 'DEF' ? inflateRawSync(plaintext) : plaintext;
  return { contentType: protectedHeader.cty, plaintext: Buffer.from(bytes).toString('utf8') };
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
    // Public SHL URLs currently contain only the SmartHealthLink id, so the first
    // lookup must be global. If SmartHealthLink moves to per-project shards, the
    // URL will need to carry project/shard context or SmartHealthLink must remain
    // globally addressable.
    return await getGlobalSystemRepo().readResource<SmartHealthLink>('SmartHealthLink', id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isNotFound(outcome) || isGone(outcome)) {
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
  const projectId = smartHealthLink.meta?.project;
  if (!projectId) {
    return undefined;
  }
  try {
    const systemRepo = await getProjectSystemRepo(projectId);
    const binary = await systemRepo.readResource<Binary>('Binary', binaryReference.substring('Binary/'.length));
    if (binary.meta?.project !== projectId) {
      return undefined;
    }
    const stream = await getBinaryStorage().readBinary(binary);
    return await readStreamToString(stream);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isNotFound(outcome) || isGone(outcome)) {
      return undefined;
    }
    throw err;
  }
}
