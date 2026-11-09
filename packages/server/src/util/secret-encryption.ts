// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getConfig } from '../config/loader';
import type { EncryptedSecretKeyConfig } from '../config/types';

const FORMAT_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Context bound to an encrypted value as AES-GCM additional authenticated data.
 * Decryption fails unless the same context is supplied, so a value only decrypts on the resource it was written for.
 */
export interface EncryptionContext {
  projectId: string;
  resourceType: string;
  id: string;
  /** Relative `Type/id` reference, or empty. */
  owner: string;
  code: string;
}

interface SealedValue {
  v: number;
  kid: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

/**
 * Encrypts a value under the active key.
 * @param context - The context to bind to the value.
 * @param plaintext - The value to encrypt.
 * @returns The encrypted value: base64url of `{ v, kid, iv, ciphertext, tag }`, with binary fields base64url.
 */
export function seal(context: EncryptionContext, plaintext: string): string {
  const { kid, key } = getActiveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(encodeContext(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const sealed: SealedValue = {
    v: FORMAT_VERSION,
    kid,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
  return Buffer.from(JSON.stringify(sealed), 'utf8').toString('base64url');
}

/**
 * Decrypts a value written by `seal`.
 * @param context - The context the value was bound to.
 * @param encryptedValue - The encrypted value.
 * @returns The plaintext.
 */
export function open(context: EncryptionContext, encryptedValue: string): string {
  const sealed = parseSealedValue(encryptedValue);
  const decipher = createDecipheriv(ALGORITHM, getKey(sealed.kid), Buffer.from(sealed.iv, 'base64url'), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(encodeContext(context));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64url')), decipher.final()]).toString(
    'utf8'
  );
}

function parseSealedValue(encryptedValue: string): SealedValue {
  let sealed: Partial<SealedValue>;
  try {
    sealed = JSON.parse(Buffer.from(encryptedValue, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid encrypted value');
  }
  if (sealed.v !== FORMAT_VERSION) {
    throw new Error('Unsupported encrypted value version');
  }
  if (
    typeof sealed.kid !== 'string' ||
    typeof sealed.iv !== 'string' ||
    typeof sealed.ciphertext !== 'string' ||
    typeof sealed.tag !== 'string'
  ) {
    throw new Error('Invalid encrypted value');
  }
  return sealed as SealedValue;
}

/**
 * Encodes the context as length-prefixed fields, so no two different contexts share an encoding.
 * @param context - The encryption context.
 * @returns The encoded additional authenticated data.
 */
function encodeContext(context: EncryptionContext): Buffer {
  const fields = [context.projectId, context.resourceType, context.id, context.owner, context.code];
  return Buffer.concat(
    fields.flatMap((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return [length, bytes];
    })
  );
}

function getActiveKey(): { kid: string; key: Buffer } {
  const active = getKeys().filter((k) => k.status === 'active');
  if (active.length !== 1) {
    throw new Error('Exactly one active EncryptedSecret key must be configured');
  }
  return { kid: active[0].kid, key: decodeKey(active[0]) };
}

function getKey(kid: string): Buffer {
  const config = getKeys().find((k) => k.kid === kid);
  if (!config) {
    throw new Error('EncryptedSecret key not found');
  }
  return decodeKey(config);
}

function getKeys(): EncryptedSecretKeyConfig[] {
  const keys = getConfig().encryptedSecretKeys;
  if (!keys?.length) {
    throw new Error('EncryptedSecret keys are not configured');
  }
  return keys;
}

function decodeKey(config: EncryptedSecretKeyConfig): Buffer {
  const key = Buffer.from(config.key, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('EncryptedSecret key must be 256 bits');
  }
  return key;
}
