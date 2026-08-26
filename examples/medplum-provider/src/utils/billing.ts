// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatchOperation } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Address, ContactPoint, Identifier, Organization, Parameters } from '@medplum/fhirtypes';

export const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
export const EIN_SYSTEM = 'http://hl7.org/fhir/sid/us-ein';
export const ORGANIZATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/organization-type';
export const PROVIDER_ORGANIZATION_TYPE = 'prov';
export const PAYER_ORGANIZATION_TYPE = 'pay';

// Identifier systems the Candid bots use to resolve a payer Organization back to the Candid
// directory (see medplum-ee payer-lookup.ts). The Candid UUID is the preferred, unambiguous key.
export const CANDID_PAYER_UUID_SYSTEM = 'https://www.joincandidhealth.com/payer-uuid';
export const CHC_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/chc-payerid';
// Legacy system stamped by imports before the bot moved to Candid's payers.v4 API; kept only as
// a display fallback for previously imported payers.
export const CMS_PAYER_ID_SYSTEM = 'https://www.cms.gov/payer-id';

// Capability-specific payer ID systems stamped by the candid-get-payers bot (Candid payers.v4).
export const CANDID_ELIGIBILITY_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/eligibility-payerid';
export const CANDID_REMITTANCE_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/remittance-payerid';

// Coding system for Candid's payer category (e.g. MEDICARE, BCBS), stamped in Organization.type.
export const CANDID_PAYER_CATEGORY_SYSTEM = 'https://www.joincandidhealth.com/payer-category';

// Extensions carrying the best support state per capability across Candid's clearinghouses.
export const CANDID_ELIGIBILITY_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/eligibility-support';
export const CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/professional-claims-support';
export const CANDID_REMITTANCE_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/remittance-support';

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

// Marker identifier stamped on organizations managed through the provider app's Billing Settings.
// The billing organization list filters on it, so unrelated Organizations (payers, facilities,
// synthetic data) never appear no matter how many exist in the project.
export const MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM = 'https://www.medplum.com/provider';
export const BILLING_ORGANIZATION_IDENTIFIER_VALUE = 'billing-organization';

/**
 * Validates an NPI: exactly 10 digits with a correct check digit.
 * The check digit is computed with the Luhn algorithm over the first 9 digits
 * prefixed with the "80840" health-industry identifier, per the CMS NPI spec.
 * @param npi - The candidate NPI string.
 * @returns True when the NPI is 10 digits and the check digit verifies.
 */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) {
    return false;
  }
  const payload = '80840' + npi.slice(0, 9);
  let sum = 0;
  let double = true;
  for (let i = payload.length - 1; i >= 0; i--) {
    let digit = Number(payload[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(npi[9]);
}

/**
 * Validates a billing phone number: 10 digits (after stripping formatting) whose
 * first digit is not 0 or 1. X12 submitters reject numbers starting with 0/1.
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
 * Returns a copy of the telecom list with the first phone entry's value replaced
 * (or a phone entry appended). Non-phone entries (email, fax) are untouched.
 * An empty value removes the phone entry.
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

export function getPayerUuid(org: Organization): string | undefined {
  return org.identifier?.find((id) => id.system === CANDID_PAYER_UUID_SYSTEM)?.value;
}

/**
 * Reads the claims payer ID, falling back to the legacy CMS system for payers imported before v4.
 * @param org - The payer Organization.
 * @returns The claims payer ID, or undefined when the Organization has neither identifier.
 */
export function getPayerId(org: Organization): string | undefined {
  return (
    org.identifier?.find((id) => id.system === CHC_PAYER_ID_SYSTEM)?.value ??
    org.identifier?.find((id) => id.system === CMS_PAYER_ID_SYSTEM)?.value
  );
}

export function getPayerCategory(org: Organization): string | undefined {
  return org.type
    ?.flatMap((t) => t.coding ?? [])
    .find((c) => c.system === CANDID_PAYER_CATEGORY_SYSTEM)?.code;
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
    identifier = upsertIdentifier(identifier, system, fresh.identifier?.find((id) => id.system === system)?.value ?? '');
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
 * Applies billing form values onto an Organization, always stamping the
 * `prov` (Healthcare Provider) organization type so the org is discoverable by
 * billing pickers that filter on type. Identifiers with unrelated systems and
 * other existing fields are preserved.
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

  return {
    ...organization,
    name: fields.name.trim(),
    identifier,
    type,
    telecom: upsertPhone(organization.telecom, fields.phone),
    address: fields.address ? [fields.address, ...(organization.address?.slice(1) ?? [])] : organization.address,
  };
}
