// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatchOperation } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Address, ContactPoint, Identifier, Organization, Parameters } from '@medplum/fhirtypes';
import {
  CANDID_BILLING_ORGANIZATION_PROFILE,
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_IS_BILLING_PROVIDER_EXTENSION,
  CANDID_IS_RENDERING_PROVIDER_EXTENSION,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_PAYER_ID_SYSTEM,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
  CHC_PAYER_ID_SYSTEM,
} from './candid';

export const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
export const EIN_SYSTEM = 'http://hl7.org/fhir/sid/us-ein';
export const ORGANIZATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/organization-type';
export const PAYER_ORGANIZATION_TYPE = 'pay';
export const PROVIDER_ORGANIZATION_TYPE = 'prov';

// Marker identifier stamped on organizations managed through Billing Settings. The billing
// organization list filters on it, so unrelated Organizations (payers, facilities, synthetic data)
// never appear no matter how many the project holds.
export const MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM = 'https://www.medplum.com/provider';
export const BILLING_ORGANIZATION_IDENTIFIER_VALUE = 'billing-organization';

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
 * Validates a billing phone number: 10 digits (after stripping formatting) whose first digit is
 * not 0 or 1. X12 claim submitters reject numbers starting with 0 or 1. The billing organization
 * profile only requires that a phone exist, so this format rule is enforced here.
 * @param phone - The candidate phone string, formatting allowed.
 * @returns True when the phone is usable on a claim.
 */
export function isValidBillingPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && !digits.startsWith('0') && !digits.startsWith('1');
}

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
 * Returns a copy of the telecom list with the first phone entry's value replaced (or a phone entry
 * appended). Non-phone entries (email, fax) are untouched. An empty value removes the phone entry.
 * @param telecom - The current telecom list.
 * @param phone - The new phone value; empty/whitespace removes the entry.
 * @returns The updated telecom list, or undefined when it would be empty.
 */
export function upsertPhone(telecom: ContactPoint[] | undefined, phone: string): ContactPoint[] | undefined {
  const trimmed = phone.trim();
  const others = telecom?.filter((t) => t.system !== 'phone') ?? [];
  const existing = telecom?.find((t) => t.system === 'phone');
  const result = trimmed ? [...others, { ...existing, system: 'phone' as const, value: trimmed }] : others;
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

export interface BillingOrganizationFormValues {
  name: string;
  npi: string;
  /** EIN; dashes accepted, stored digits-only. */
  ein: string;
  phone: string;
  address?: Address;
}

/**
 * Applies billing form values onto an Organization, stamping the `prov` (Healthcare Provider)
 * organization type so the org is found by the encounter billing picker, and the provider-app
 * marker identifier so it is listed in Billing Settings. Identifiers with unrelated systems and
 * all other existing fields are preserved.
 * @param organization - The existing Organization, or a bare `{resourceType: 'Organization'}` for create.
 * @param fields - The billing form values.
 * @returns The updated Organization resource (not persisted).
 */
export function buildUpdatedOrganization(
  organization: Organization,
  fields: BillingOrganizationFormValues
): Organization {
  let identifier = upsertIdentifier(organization.identifier, NPI_SYSTEM, fields.npi);
  identifier = upsertIdentifier(identifier, EIN_SYSTEM, fields.ein.replace(/\D/g, ''));
  identifier = upsertIdentifier(identifier, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, BILLING_ORGANIZATION_IDENTIFIER_VALUE);

  const hasProviderType = organization.type?.some((t) =>
    t.coding?.some((c) => c.system === ORGANIZATION_TYPE_SYSTEM && c.code === PROVIDER_ORGANIZATION_TYPE)
  );
  const type = hasProviderType
    ? organization.type
    : [
        ...(organization.type ?? []),
        {
          coding: [
            { system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE, display: 'Healthcare Provider' },
          ],
        },
      ];

  const profile = organization.meta?.profile ?? [];

  return {
    ...organization,
    meta: {
      ...organization.meta,
      // Claiming the profile is what makes the server validate these organizations; every writer
      // that skips it is unvalidated, so stamp it on save.
      profile: profile.includes(CANDID_BILLING_ORGANIZATION_PROFILE)
        ? profile
        : [...profile, CANDID_BILLING_ORGANIZATION_PROFILE],
    },
    name: fields.name.trim(),
    identifier,
    type,
    telecom: upsertPhone(organization.telecom, fields.phone),
    address: fields.address ? [fields.address, ...(organization.address?.slice(1) ?? [])] : organization.address,
  };
}

/**
 * Returns a copy of the Organization carrying the isBilling/isRendering extensions that
 * candid-create-provider requires. Billing organizations bill under their own NPI while the
 * rendering provider is the practitioner, so isBilling is true and isRendering false. Extensions
 * with other URLs are preserved.
 * @param organization - The billing organization.
 * @returns The Organization with the Candid provider flags set.
 */
export function withCandidProviderExtensions(organization: Organization): Organization {
  return {
    ...organization,
    extension: [
      ...(organization.extension?.filter(
        (e) => e.url !== CANDID_IS_BILLING_PROVIDER_EXTENSION && e.url !== CANDID_IS_RENDERING_PROVIDER_EXTENSION
      ) ?? []),
      { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: true },
      { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: false },
    ],
  };
}
