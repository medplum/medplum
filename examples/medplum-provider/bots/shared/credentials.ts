// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Per-tenant EHR credential storage for bots.
 *
 * WHERE CREDENTIALS LIVE
 * ----------------------
 * One `Basic` resource per (Organization, integration) pair:
 *
 *   identifier  https://lyfe.health/integration | "drchrono" | "zus"
 *   subject     Organization/<id>          (the lookup key)
 *   meta.account Organization/<id>         (the compartment)
 *   extension   .../config/<name>  plaintext, non-secret configuration
 *               .../secret/<name>  AES-256-GCM ciphertext
 *               .../state/<name>   bot-written connection state
 *
 * `Basic` is deliberately absent from "Lyfe Clinic Access Policy". Medplum
 * access policies are allow-lists, so a clinic user cannot read these records at
 * all, whatever compartment they are in — only a bot running with its own
 * project membership can. The compartment is defence in depth, not the fence.
 *
 * WHY THE (ORG, INTEGRATION) PAIR IS UNIQUE, AND WHY A SECOND ROW IS FATAL
 * -----------------------------------------------------------------------
 * The Lyfe Prisma implementation this replaces looked credentials up with
 * `orderBy: { updatedAt: 'desc' }` and took `[0]`. When the filter was not tight
 * enough, that silently handed one tenant another tenant's credentials — the
 * row that happened to be saved last. Nothing failed; the wrong clinic's data
 * simply came back. Every lookup here therefore reads ALL matches and throws on
 * more than one. Never add an `orderBy` and a `[0]` to this file.
 */
import type { MedplumClient } from '@medplum/core';
import type { Basic, Extension, Organization, Reference } from '@medplum/fhirtypes';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/** Identifier and extension namespace for every credential record. */
export const INTEGRATION_SYSTEM = 'https://lyfe.health/integration';

/** Extension url prefix for non-secret configuration, stored in the clear. */
export const CONFIG_PREFIX = `${INTEGRATION_SYSTEM}/config/`;

/** Extension url prefix for encrypted secrets. */
export const SECRET_PREFIX = `${INTEGRATION_SYSTEM}/secret/`;

/** Extension url prefix for bot-written connection state. */
export const STATE_PREFIX = `${INTEGRATION_SYSTEM}/state/`;

/** Project secret holding the AES key. */
export const ENCRYPTION_KEY_SECRET_NAME = 'LYFE_CREDENTIAL_ENCRYPTION_KEY';

/** The integrations this module knows how to store. */
export type IntegrationKey = 'drchrono' | 'zus';

/** Every integration key, for input validation. */
export const INTEGRATION_KEYS: readonly IntegrationKey[] = ['drchrono', 'zus'];

/**
 * Field allow-lists, one per integration.
 *
 * These are allow-lists for the same reason the access policy is: a name that is
 * not listed is rejected rather than stored. That keeps a typo ("clientsecret")
 * from being silently written as a plaintext config field and then read back as
 * "not configured", and it keeps a secret from ever landing in the `config`
 * bucket, where it would be returned by `status` in the clear.
 */
export interface IntegrationSchema {
  /** Non-secret field names, stored as plaintext. */
  readonly config: readonly string[];
  /** Secret field names, stored encrypted. */
  readonly secrets: readonly string[];
}

/**
 * Field names mirror `OrganizationDrChronoMetadata` and `OrganizationZusMetadata`
 * in lyfe-provider-ui, minus the `drchrono`/`zus` prefix that the identifier
 * already carries, and minus the plaintext `*ClientSecret` fields that exist
 * there only as a migration fallback.
 */
export const INTEGRATION_SCHEMAS: Record<IntegrationKey, IntegrationSchema> = {
  drchrono: {
    config: ['apiUrl', 'authUrl', 'tokenUrl', 'redirectUri', 'defaultDoctorId', 'environment'],
    // `clientId` is not really a secret, but the Integrations UI posts it in the
    // `secrets` bag alongside the client secret, and a field must live in
    // exactly one bucket. Encrypting it costs nothing; classifying it as config
    // would make every save from the UI fail validation.
    secrets: ['clientId', 'clientSecret', 'accessToken', 'refreshToken'],
  },
  zus: {
    config: [
      'apiUrl',
      'authUrl',
      'builderId',
      'builderName',
      'packageId',
      'practitionerNpi',
      'practitionerRole',
      'practiceName',
      'environment',
      'authMode',
    ],
    secrets: ['clientId', 'clientSecret', 'accessToken'],
  },
};

/** A decrypted credential set, ready to authenticate with. */
export interface CredentialValues {
  /** Plaintext configuration, keyed by field name. */
  readonly config: Record<string, string>;
  /** Decrypted secrets, keyed by field name. */
  readonly secrets: Record<string, string>;
  /** Bot-written state, such as the last connection test result. */
  readonly state: Record<string, string>;
  /** Secret field names whose ciphertext could not be decrypted. */
  readonly unreadableSecrets: string[];
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const KEY_SALT = 'lyfe-medplum-credential-salt-v1';
const HEX_KEY_LENGTH = KEY_LENGTH * 2;
const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Memoized scrypt output, keyed on the material it was derived from.
 *
 * `scryptSync` costs tens of milliseconds and the key is needed on every
 * encrypt and decrypt, so a single `save` of four secrets would otherwise pay
 * the KDF four times. Deriving the same key from the same input always yields
 * the same bytes, so caching is safe; keying the cache on the source material
 * means a rotated key still re-derives rather than serving the previous one.
 *
 * A VM-context bot is evaluated fresh per execution, so this cache lives for one
 * bot run. That is the point at which it pays for itself.
 */
let derivedKeyCache: { cacheKey: string; derived: Buffer } | null = null;

/**
 * Turn the project secret into 32 key bytes.
 * @param props - Holds the raw secret value.
 * @param props.material - The `LYFE_CREDENTIAL_ENCRYPTION_KEY` project secret.
 * @returns The 32-byte AES key.
 */
export function deriveEncryptionKey(props: { material: string }): Buffer {
  const material = props.material;
  if (!material) {
    throw new Error(`${ENCRYPTION_KEY_SECRET_NAME} is not set in project secrets`);
  }

  // 64 hex characters is exactly 32 bytes of entropy, which is what
  // scripts/seed-credential-key.ts writes. Use it directly.
  if (material.length === HEX_KEY_LENGTH && /^[0-9a-fA-F]+$/.test(material)) {
    return Buffer.from(material, 'hex');
  }

  if (material.length < KEY_LENGTH) {
    throw new Error(
      `${ENCRYPTION_KEY_SECRET_NAME} is shorter than ${KEY_LENGTH} characters. ` +
        'Generate a real key with scripts/seed-credential-key.ts.'
    );
  }

  const cacheKey = `${KEY_SALT}:${material}`;
  if (derivedKeyCache?.cacheKey === cacheKey) {
    return derivedKeyCache.derived;
  }
  const derived = scryptSync(material, KEY_SALT, KEY_LENGTH);
  derivedKeyCache = { cacheKey, derived };
  return derived;
}

/**
 * Encrypt one secret.
 * @param props - The plaintext and the key to use.
 * @param props.plaintext - The value to protect.
 * @param props.key - The 32-byte AES key.
 * @returns `iv:tag:ciphertext`, all hex.
 */
export function encryptSecret(props: { plaintext: string; key: Buffer }): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, props.key, iv);
  const encrypted = cipher.update(props.plaintext, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

/**
 * Decrypt one secret.
 * @param props - The ciphertext and the key to use.
 * @param props.ciphertext - An `iv:tag:ciphertext` string from {@link encryptSecret}.
 * @param props.key - The 32-byte AES key.
 * @returns The plaintext.
 */
export function decryptSecret(props: { ciphertext: string; key: Buffer }): string {
  const parts = props.ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }
  const decipher = createDecipheriv(ALGORITHM, props.key, Buffer.from(parts[0], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
  return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
}

/**
 * Validate an integration key supplied by a caller.
 * @param props - Holds the unvalidated value.
 * @param props.value - The candidate integration key.
 * @returns The value, narrowed.
 */
export function parseIntegrationKey(props: { value: unknown }): IntegrationKey {
  const value = props.value;
  if (typeof value === 'string' && (INTEGRATION_KEYS as readonly string[]).includes(value)) {
    return value as IntegrationKey;
  }
  throw new Error(`Unknown integration ${JSON.stringify(value)}. Expected one of: ${INTEGRATION_KEYS.join(', ')}`);
}

/**
 * Read every extension under one prefix into a flat record.
 * @param props - The record and the prefix to collect.
 * @param props.record - The credential record, if one exists.
 * @param props.prefix - One of the `*_PREFIX` constants.
 * @returns Field name to value.
 */
function collect(props: { record: Basic | undefined; prefix: string }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ext of props.record?.extension ?? []) {
    if (ext.url?.startsWith(props.prefix) && typeof ext.valueString === 'string') {
      out[ext.url.slice(props.prefix.length)] = ext.valueString;
    }
  }
  return out;
}

/**
 * Find the single credential record for an organization and integration.
 *
 * Reads every match and refuses to choose between two, rather than taking the
 * most recently updated one. See the note at the top of this file.
 * @param props - Identifies the record.
 * @param props.medplum - Bot-scoped Medplum client.
 * @param props.organization - The owning organization.
 * @param props.integration - Which integration to read.
 * @returns The record, or undefined when the organization has never saved one.
 */
export async function readCredentialRecord(props: {
  medplum: MedplumClient;
  organization: Reference<Organization>;
  integration: IntegrationKey;
}): Promise<Basic | undefined> {
  const matches = await props.medplum.searchResources(
    'Basic',
    `identifier=${encodeURIComponent(INTEGRATION_SYSTEM)}|${props.integration}` +
      `&subject=${encodeURIComponent(props.organization.reference as string)}&_count=10`
  );

  if (matches.length > 1) {
    throw new Error(
      `${matches.length} ${props.integration} credential records exist for ${props.organization.reference} ` +
        `(${matches.map((m) => m.id).join(', ')}). Refusing to guess which one is current — ` +
        'delete the duplicates before using this integration.'
    );
  }
  return matches[0];
}

/**
 * Decrypt a credential record.
 *
 * A secret that will not decrypt is reported in `unreadableSecrets` rather than
 * being dropped. lyfe-provider-ui's Zus config falls back to a plaintext copy in
 * that situation, because it was migrating live tenants off plaintext and a hard
 * cutover would have taken a clinic offline with no undo. Here there is no
 * plaintext copy to fall back to and never was, so the honest outcome is a
 * distinguishable error: "the key is wrong" must not look like "not configured",
 * or an operator will cheerfully overwrite good ciphertext.
 * @param props - The record and the key.
 * @param props.record - The credential record, if one exists.
 * @param props.key - The 32-byte AES key.
 * @returns Config, decrypted secrets, and any secret that failed to decrypt.
 */
export function getCredentialValues(props: { record: Basic | undefined; key: Buffer }): CredentialValues {
  const config = collect({ record: props.record, prefix: CONFIG_PREFIX });
  const secrets: Record<string, string> = {};
  const unreadableSecrets: string[] = [];

  for (const [name, ciphertext] of Object.entries(collect({ record: props.record, prefix: SECRET_PREFIX }))) {
    try {
      secrets[name] = decryptSecret({ ciphertext, key: props.key });
    } catch {
      unreadableSecrets.push(name);
    }
  }

  return { config, secrets, state: collect({ record: props.record, prefix: STATE_PREFIX }), unreadableSecrets };
}

/**
 * Reject a field name that the integration does not declare.
 * @param props - The name to check.
 * @param props.integration - Which integration is being written.
 * @param props.name - The submitted field name.
 * @param props.kind - Which bucket it was submitted in.
 */
function assertKnownField(props: { integration: IntegrationKey; name: string; kind: 'config' | 'secrets' }): void {
  const schema = INTEGRATION_SCHEMAS[props.integration];
  if (schema[props.kind].includes(props.name)) {
    return;
  }
  const otherKind = props.kind === 'config' ? 'secrets' : 'config';
  if (schema[otherKind].includes(props.name)) {
    throw new Error(`${props.integration}.${props.name} must be supplied as "${otherKind}", not "${props.kind}"`);
  }
  throw new Error(
    `Unknown ${props.integration} ${props.kind} field "${props.name}". ` +
      `Allowed: ${schema[props.kind].join(', ') || '(none)'}`
  );
}

/**
 * Create or update the credential record for an organization.
 *
 * Merges: a field that is not supplied — or supplied empty — keeps its stored
 * value, so a caller can rotate one secret without re-sending the rest, and a
 * settings form with blanked-out password boxes cannot destroy a working
 * connection. Removal is explicit, through `clear`.
 * @param props - What to write.
 * @param props.medplum - Bot-scoped Medplum client.
 * @param props.organization - The owning organization, derived from the caller.
 * @param props.integration - Which integration to write.
 * @param props.config - Non-secret fields to merge in.
 * @param props.secrets - Secret fields to encrypt and merge in.
 * @param props.state - Bot-written state to merge in.
 * @param props.clear - Field names to remove outright, config or secret.
 * @param props.key - The 32-byte AES key.
 * @returns The saved record.
 */
export async function writeCredentialRecord(props: {
  medplum: MedplumClient;
  organization: Reference<Organization>;
  integration: IntegrationKey;
  config?: Record<string, string>;
  secrets?: Record<string, string>;
  state?: Record<string, string>;
  clear?: string[];
  key: Buffer;
}): Promise<Basic> {
  const existing = await readCredentialRecord({
    medplum: props.medplum,
    organization: props.organization,
    integration: props.integration,
  });

  const merged = new Map<string, string>();
  for (const ext of existing?.extension ?? []) {
    if (ext.url && typeof ext.valueString === 'string') {
      merged.set(ext.url, ext.valueString);
    }
  }

  const apply = (
    prefix: string,
    values: Record<string, string> | undefined,
    transform?: (v: string) => string
  ): void => {
    for (const [name, value] of Object.entries(values ?? {})) {
      if (!FIELD_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid field name "${name}": expected letters and digits only`);
      }
      if (prefix !== STATE_PREFIX) {
        assertKnownField({
          integration: props.integration,
          name,
          kind: prefix === SECRET_PREFIX ? 'secrets' : 'config',
        });
      }
      if (typeof value !== 'string') {
        throw new Error(`Field "${name}" must be a string`);
      }
      // An empty value means "leave it alone", NOT "clear it". The settings form
      // renders a stored secret as an empty password box, so treating empty as a
      // delete would silently wipe a working DrChrono connection the moment
      // someone saved a change to the practice name. Clearing is explicit, via
      // `clear`.
      if (value === '') {
        continue;
      }
      merged.set(`${prefix}${name}`, transform ? transform(value) : value);
    }
  };

  apply(CONFIG_PREFIX, props.config);
  apply(SECRET_PREFIX, props.secrets, (value) => encryptSecret({ plaintext: value, key: props.key }));
  apply(STATE_PREFIX, props.state);

  for (const name of props.clear ?? []) {
    merged.delete(`${CONFIG_PREFIX}${name}`);
    merged.delete(`${SECRET_PREFIX}${name}`);
  }

  const extension: Extension[] = [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, valueString]) => ({ url, valueString }));

  const body: Basic = {
    ...existing,
    resourceType: 'Basic',
    meta: {
      ...existing?.meta,
      // Deprecated in favour of meta.accounts, but still the field Medplum
      // normalises from, and the one the surrounding Lyfe tooling reads.
      account: props.organization,
      accounts: [props.organization],
    },
    identifier: [{ system: INTEGRATION_SYSTEM, value: props.integration }],
    code: {
      coding: [{ system: INTEGRATION_SYSTEM, code: props.integration }],
      text: `${props.integration} credentials`,
    },
    subject: props.organization,
    // Basic.created is a FHIR `date`, not a `dateTime` — a full timestamp fails
    // validation under this project's strictMode.
    created: existing?.created ?? new Date().toISOString().slice(0, 10),
    extension,
  };

  return existing
    ? props.medplum.updateResource<Basic>({ ...body, id: existing.id })
    : props.medplum.createResource<Basic>(body);
}
