// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatchOperation } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Address, ContactPoint, Identifier, Organization, Parameters, Practitioner } from '@medplum/fhirtypes';
import {
  CANDID_BILLING_ORGANIZATION_PROFILE,
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_IS_BILLING_PROVIDER_EXTENSION,
  CANDID_IS_RENDERING_PROVIDER_EXTENSION,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PRACTITIONER_PROFILE,
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
export const BILLING_PRACTITIONER_IDENTIFIER_VALUE = 'billing-practitioner';

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
 * Validates an NPI: exactly 10 digits. The CMS check digit is deliberately not verified — Candid
 * sandbox and test NPIs do not carry a valid one, and Candid itself only checks the format.
 * @param npi - The candidate NPI string.
 * @returns True when the NPI is 10 digits.
 */
export function isValidNpi(npi: string): boolean {
  return /^\d{10}$/.test(npi);
}

/**
 * Validates a billing phone number: 10 digits (after stripping formatting) whose first digit is
 * not 0 or 1. X12 claim submitters reject numbers starting with 0 or 1.
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
 * Whether an address carries everything Candid requires of a provider address: street line, city,
 * two-letter state, and ZIP. The candid-create-provider bot rejects a partial address, so the form
 * validates it here rather than letting the registration fail.
 * @param address - The address entered on the billing organization form.
 * @returns True when the address is complete enough to register with Candid.
 */
export function isCompleteBillingAddress(address: Address | undefined): boolean {
  return !!(address?.line?.[0] && address.city && /^[A-Za-z]{2}$/.test(address.state ?? '') && address.postalCode);
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

/**
 * The billing fields the practitioner form edits. The tax ID and address are only needed when the
 * practitioner bills individually: with a billing organization on their role, the organization is
 * the billing provider and supplies both.
 */
export interface BillingPractitionerFormValues {
  npi: string;
  ein: string;
  address?: Address;
}

/**
 * Returns a copy of the Practitioner with the NPI identifier, tax ID and address the Candid
 * integration needs, claiming the practitioner profile so the server validates them. Also stamps the
 * provider-app marker identifier, recording that this practitioner was set up for billing here.
 * Qualifications are left untouched: the taxonomy is not collected here.
 * @param practitioner - The practitioner being edited.
 * @param fields - The billing fields from the form.
 * @returns The updated Practitioner, ready to store.
 */
export function buildUpdatedPractitioner(
  practitioner: Practitioner,
  fields: BillingPractitionerFormValues
): Practitioner {
  const profile = practitioner.meta?.profile ?? [];

  return {
    ...practitioner,
    meta: {
      ...practitioner.meta,
      profile: profile.includes(CANDID_PRACTITIONER_PROFILE) ? profile : [...profile, CANDID_PRACTITIONER_PROFILE],
    },
    identifier: upsertIdentifier(
      upsertIdentifier(
        upsertIdentifier(practitioner.identifier, NPI_SYSTEM, fields.npi),
        EIN_SYSTEM,
        fields.ein.replace(/\D/g, '')
      ),
      MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
      BILLING_PRACTITIONER_IDENTIFIER_VALUE
    ),
    address: fields.address ? [fields.address, ...(practitioner.address?.slice(1) ?? [])] : practitioner.address,
  };
}

/**
 * Returns a copy of the Practitioner carrying the isBilling/isRendering extensions
 * candid-create-provider requires. A practitioner always renders the care; they are the billing
 * provider only when they bill individually, i.e. no billing organization is on their role.
 * @param practitioner - The practitioner being registered.
 * @param billsIndividually - Whether claims are billed under the practitioner rather than an organization.
 * @returns The Practitioner with the Candid provider flags set.
 */
export function withCandidPractitionerExtensions(
  practitioner: Practitioner,
  billsIndividually: boolean
): Practitioner {
  return {
    ...practitioner,
    extension: [
      ...(practitioner.extension?.filter(
        (e) => e.url !== CANDID_IS_BILLING_PROVIDER_EXTENSION && e.url !== CANDID_IS_RENDERING_PROVIDER_EXTENSION
      ) ?? []),
      { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: billsIndividually },
      { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: true },
    ],
  };
}

/**
 * Records the Candid provider ID a live lookup found, when the resource does not carry it already.
 * Candid registers a provider once per NPI, so a second create is rejected as a duplicate: a
 * resource whose registration succeeded in Candid but whose write-back did not is stranded until
 * its ID is recorded, which stamping it here does on the next save.
 * @param resource - The organization or practitioner being saved.
 * @param candidProviderId - The provider ID Candid returned for this NPI, if any.
 * @returns The resource carrying the Candid provider identifier.
 */
export function withCandidProviderId<T extends Organization | Practitioner>(
  resource: T,
  candidProviderId: string | undefined
): T {
  if (!candidProviderId || getIdentifier(resource, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM)) {
    return resource;
  }
  return {
    ...resource,
    identifier: [
      ...(resource.identifier ?? []),
      { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: candidProviderId },
    ],
  };
}
