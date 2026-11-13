// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
  allOk,
  badRequest,
  businessRule,
  forbidden,
  notFound,
  serverError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { parseIfMatchHeader } from '@medplum/fhir-router';
import type { EncryptedSecret, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { AuditEventOutcome } from '../../util/auditevent';
import type { EncryptionContext } from '../../util/secret-encryption';
import { open, seal } from '../../util/secret-encryption';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const MAX_VALUE_BYTES = 64 * 1024;

export const setValueOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'EncryptedSecret' },
  {
    id: 'EncryptedSecret-set-value',
    name: 'encryptedsecret-set-value',
    code: 'set-value',
    parameter: [
      { use: 'in', name: 'value', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'EncryptedSecret', min: 1, max: '1' },
    ],
  }
);

export const getValueOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'EncryptedSecret' },
  {
    id: 'EncryptedSecret-get-value',
    name: 'encryptedsecret-get-value',
    code: 'get-value',
    parameter: [{ use: 'out', name: 'value', type: 'string', min: 1, max: '1' }],
  }
);

/**
 * Handles EncryptedSecret $set-value: encrypts the value and saves it as a new version of the secret.
 * Requires update access to the secret. The plaintext is never returned.
 * @param req - The FHIR request.
 * @returns The updated EncryptedSecret.
 */
export async function encryptedSecretSetValueHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const { value } = parseInputParameters<{ value: string }>(setValueOperation, req);
  if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
    return [badRequest(`Value must be at most ${MAX_VALUE_BYTES} bytes`)];
  }

  const secret = await readStoredSecret(req.params.id);
  if (!secret || !repo.canPerformInteraction(AccessPolicyInteraction.READ, secret)) {
    return [notFound];
  }
  if (secret.status === 'revoked') {
    return [businessRule('revoked', 'Cannot set the value of a revoked secret')];
  }

  let updated: WithId<EncryptedSecret>;
  try {
    updated = await repo.patchResource<EncryptedSecret>(
      'EncryptedSecret',
      secret.id,
      [{ op: 'add', path: '/encryptedValue', value: seal(getEncryptionContext(secret), value) }],
      { ifMatch: parseIfMatchHeader(req.headers?.['if-match']) }
    );
  } catch (err) {
    logSecretEvent(AuditEventOutcome.MinorFailure, secret, 'set-value failed');
    throw err;
  }
  logSecretEvent(AuditEventOutcome.Success, secret, 'set-value');
  return [allOk, buildOutputParameters(setValueOperation, updated)];
}

/**
 * Handles EncryptedSecret $get-value: decrypts and returns the current value of the secret.
 * Requires an access policy entry that names the `get-value` operation; read access alone is not enough.
 * @param req - The FHIR request.
 * @returns Parameters with the plaintext `value`.
 */
export async function encryptedSecretGetValueHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const secret = await readStoredSecret(req.params.id);
  const reference: Reference = { reference: `EncryptedSecret/${req.params.id}` };

  if (!secret || !repo.canPerformOperation('get-value', secret)) {
    logSecretEvent(AuditEventOutcome.MinorFailure, secret ?? reference, 'get-value denied');
    // Callers who cannot read the secret cannot learn that it exists
    return [secret && repo.canPerformInteraction(AccessPolicyInteraction.READ, secret) ? forbidden : notFound];
  }

  const unavailable = getUnavailableReason(secret);
  if (unavailable) {
    logSecretEvent(AuditEventOutcome.MinorFailure, secret, `get-value failed: ${unavailable}`);
    return [businessRule('unavailable', `Secret value is unavailable: ${unavailable}`)];
  }

  let value: string;
  try {
    value = open(getEncryptionContext(secret), secret.encryptedValue as string);
  } catch (err) {
    // Ciphertext that does not match this secret, or whose key is gone, is a server-side integrity failure
    logSecretEvent(AuditEventOutcome.SeriousFailure, secret, 'get-value failed: decryption error');
    return [serverError(err as Error)];
  }
  logSecretEvent(AuditEventOutcome.Success, secret, 'get-value');
  return [allOk, buildOutputParameters(getValueOperation, { value })];
}

/**
 * Reads the complete stored secret, bypassing access policy.
 * Callers must check access on the result before using or revealing anything about it.
 * @param id - The EncryptedSecret ID.
 * @returns The stored secret, or undefined if it does not exist or is deleted.
 */
async function readStoredSecret(id: string): Promise<WithId<EncryptedSecret> | undefined> {
  try {
    return await getAuthenticatedContext().systemRepo.readResource<EncryptedSecret>('EncryptedSecret', id);
  } catch {
    return undefined;
  }
}

function getUnavailableReason(secret: EncryptedSecret): string | undefined {
  if (secret.status !== 'active') {
    return `status is ${secret.status}`;
  }
  if (secret.expires && new Date(secret.expires) <= new Date()) {
    return 'expired';
  }
  if (!secret.encryptedValue) {
    return 'no value set';
  }
  return undefined;
}

function getEncryptionContext(secret: WithId<EncryptedSecret>): EncryptionContext {
  const projectId = secret.meta?.project;
  if (!projectId) {
    throw new Error('EncryptedSecret has no project');
  }
  return {
    projectId,
    resourceType: secret.resourceType,
    id: secret.id,
    owner: secret.owner?.reference ?? '',
    code: secret.code,
  };
}

function logSecretEvent(outcome: AuditEventOutcome, secret: EncryptedSecret | Reference, description: string): void {
  getAuthenticatedContext().repo.logOperationEvent(outcome, secret, {
    description,
    entityDetail: 'code' in secret && secret.code ? [{ type: 'code', valueString: secret.code }] : undefined,
  });
}
