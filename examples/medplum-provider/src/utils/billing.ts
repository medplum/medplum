// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatchOperation } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Identifier, Organization, Parameters } from '@medplum/fhirtypes';
import {
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_PAYER_ID_SYSTEM,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
  CHC_PAYER_ID_SYSTEM,
} from './candid';

export const ORGANIZATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/organization-type';
export const PAYER_ORGANIZATION_TYPE = 'pay';

// The payer Organization fields the candid-get-payers bot owns; refresh syncs exactly these,
// leaving identifiers and extensions from other systems untouched.
const CANDID_MANAGED_IDENTIFIER_SYSTEMS = [
  CANDID_PAYER_UUID_SYSTEM,
  CHC_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_REMITTANCE_PAYER_ID_SYSTEM,
];
const CANDID_SUPPORT_EXTENSION_URLS = [
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
];

/**
 * Returns a copy of the identifier list with the value for the given system
 * replaced (or appended). Identifiers with other systems are untouched, and
 * extra properties on the replaced identifier are preserved. An empty value
 * removes the identifier for that system.
 * @param identifiers - The current identifier list.
 * @param system - The identifier system to upsert.
 * @param value - The new value; empty/whitespace removes the entry.
 * @returns The updated identifier list, or undefined when it would be empty.
 */
export function upsertIdentifier(
  identifiers: Identifier[] | undefined,
  system: string,
  value: string
): Identifier[] | undefined {
  const trimmed = value.trim();
  const others = identifiers?.filter((id) => id.system !== system) ?? [];
  const existing = identifiers?.find((id) => id.system === system);
  const result = trimmed ? [...others, { ...existing, system, value: trimmed }] : others;
  return result.length > 0 ? result : undefined;
}

/**
 * A page of payer search results. The `candid-get-payers` bot returns a Parameters resource of
 * ready-to-persist payer Organizations; see parsePayerSearchPage.
 */
export interface CandidPayerPage {
  items: Organization[];
  nextPageToken?: string;
}

/**
 * Parses the Parameters resource the `candid-get-payers` bot returns for a search: one
 * `organization` parameter per directory entry plus an optional `nextPageToken`.
 * @param result - The Parameters resource returned by the bot.
 * @returns The payer Organizations and the next-page token, when there is a next page.
 */
export function parsePayerSearchPage(result: Parameters): CandidPayerPage {
  return {
    items: (result.parameter ?? [])
      .filter((p) => p.name === 'organization' && p.resource?.resourceType === 'Organization')
      .map((p) => p.resource as Organization),
    nextPageToken: result.parameter?.find((p) => p.name === 'nextPageToken')?.valueString,
  };
}

export function getPayerCategory(org: Organization): string | undefined {
  return org.type?.flatMap((t) => t.coding ?? []).find((c) => c.system === CANDID_PAYER_CATEGORY_SYSTEM)?.code;
}

const PAYER_CATEGORY_ACRONYMS = new Set(['BCBS', 'SNF', 'TPL']);

/**
 * Formats a Candid payer category code (e.g. `AETNA_AFFILIATED`) for display.
 * @param code - The payer category code from the Candid directory.
 * @returns The human-readable category label.
 */
export function formatPayerCategory(code: string): string {
  return code
    .split('_')
    .map((word) => (PAYER_CATEGORY_ACRONYMS.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * Builds the JSON Patch operations that bring an imported payer Organization back in sync with
 * its current directory entry (a fresh Organization from the `candid-get-payers` bot): name,
 * Candid-managed identifiers, type (incl. payer category), aliases, address, support-state
 * extensions, and reactivation of a payer previously marked inactive. Identifiers and extensions
 * from other systems are preserved. Returns an empty list when nothing changed.
 * @param org - The imported payer Organization.
 * @param fresh - The payer's current directory entry as returned by the bot.
 * @returns JSON Patch operations, empty when the Organization is already in sync.
 */
export function buildPayerRefreshOps(org: Organization, fresh: Organization): PatchOperation[] {
  const ops: PatchOperation[] = [];

  let identifier = org.identifier;
  for (const system of CANDID_MANAGED_IDENTIFIER_SYSTEMS) {
    identifier = upsertIdentifier(
      identifier,
      system,
      fresh.identifier?.find((id) => id.system === system)?.value ?? ''
    );
  }

  const extension = [
    ...(org.extension?.filter((e) => !CANDID_SUPPORT_EXTENSION_URLS.includes(e.url)) ?? []),
    ...(fresh.extension?.filter((e) => CANDID_SUPPORT_EXTENSION_URLS.includes(e.url)) ?? []),
  ];

  appendSyncOp(ops, org, 'name', fresh.name);
  appendSyncOp(ops, org, 'identifier', identifier);
  appendSyncOp(ops, org, 'type', fresh.type);
  appendSyncOp(ops, org, 'alias', fresh.alias);
  appendSyncOp(ops, org, 'address', fresh.address);
  appendSyncOp(ops, org, 'extension', extension.length > 0 ? extension : undefined);
  if (org.active === false) {
    ops.push({ op: 'add', path: '/active', value: true });
  }
  return ops;
}

function appendSyncOp(
  ops: PatchOperation[],
  org: Organization,
  field: 'name' | 'identifier' | 'type' | 'alias' | 'address' | 'extension',
  value: unknown
): void {
  const current = org[field];
  if (JSON.stringify(current) === JSON.stringify(value)) {
    return;
  }
  if (value === undefined) {
    ops.push({ op: 'remove', path: `/${field}` });
  } else {
    ops.push({ op: 'add', path: `/${field}`, value });
  }
}

/**
 * Whether a `candid-get-payers` bot error means the payer no longer exists in Candid's
 * directory, as opposed to a transient/auth failure.
 * @param error - The error thrown by the bot execution.
 * @returns True when the payer was not found in the directory.
 */
export function isPayerNotFoundError(error: unknown): boolean {
  return /EntityNotFoundError|HTTP 404|not found/i.test(normalizeErrorString(error));
}
