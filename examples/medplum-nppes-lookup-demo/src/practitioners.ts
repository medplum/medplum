// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, formatHumanName } from '@medplum/core';
import type {
  Bundle,
  HumanName,
  Identifier,
  OperationOutcome,
  Practitioner,
  PractitionerRole,
} from '@medplum/fhirtypes';

/**
 * Search criteria sent to the nppes-lookup bot for an individual practitioner (NPI-1).
 * Field names match the NPPES NPI Registry API v2.1: https://npiregistry.cms.hhs.gov/api-page
 */
export interface PractitionerSearch {
  enumeration_type: 'NPI-1';
  number?: string;
  first_name?: string;
  last_name?: string;
  taxonomy_description?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

/** One provider from the bot's Bundle: a Practitioner and its PractitionerRole (not saved, no ids). */
export interface PractitionerResult {
  practitioner: Practitioner;
  role: PractitionerRole;
  /** The provider's NPI identifier exactly as the bot set it (system + value). Used to save and match the doctor. */
  npiIdentifier: Identifier;
}

/**
 * Removes blank fields so the bot only receives the criteria that were filled in.
 * @param search - The raw form values.
 * @returns The search with empty and whitespace-only values removed.
 */
export function cleanSearch(search: PractitionerSearch): PractitionerSearch {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) {
    const trimmed = value?.trim();
    if (trimmed) {
      result[key] = trimmed;
    }
  }
  return result as unknown as PractitionerSearch;
}

/**
 * Reads the nppes-lookup bot's searchset Bundle.
 *
 * Each Practitioner is paired with the PractitionerRole whose `practitioner.reference` equals the Practitioner's
 * `fullUrl` (a `urn:uuid:`), never by position. Skipped records are reported by the bot in an OperationOutcome
 * entry; their messages are returned as `skipped`. `entry` is absent when there are no results.
 * @param bundle - The bot's response.
 * @returns The Practitioner + PractitionerRole pairs, and messages for any records the bot skipped.
 */
export function readPractitionerBundle(bundle: Bundle): {
  results: PractitionerResult[];
  skipped: string[];
} {
  const entries = bundle.entry ?? [];
  const roles = entries.filter((e) => e.resource?.resourceType === 'PractitionerRole');
  const results: PractitionerResult[] = [];

  for (const entry of entries) {
    if (entry.resource?.resourceType !== 'Practitioner') {
      continue;
    }
    const practitioner = entry.resource;
    const role = roles.find((r) => (r.resource as PractitionerRole).practitioner?.reference === entry.fullUrl)
      ?.resource as PractitionerRole | undefined;
    // The bot's only Practitioner identifier is the NPI, so the app needs no NPI system constant of its own.
    const npiIdentifier = practitioner.identifier?.[0];
    if (role && npiIdentifier?.system && npiIdentifier.value) {
      results.push({ practitioner, role, npiIdentifier });
    }
  }

  const skipped = entries
    .filter((e) => e.resource?.resourceType === 'OperationOutcome')
    .flatMap((e) => (e.resource as OperationOutcome).issue.map((i) => i.details?.text ?? 'Skipped a record'));

  return { results, skipped };
}

interface SavedPractitioner {
  practitioner: WithId<Practitioner>;
  role: WithId<PractitionerRole>;
}

/**
 * Update-or-create one resource, keyed on an identifier, and return the stored copy.
 *
 * `upsertResource` sends `PUT <ResourceType>?identifier=<system>|<value>`: the server updates the one match,
 * or creates the resource if there is none. If nothing changed, the server replies "not modified" and the
 * client returns the input (which has no id), so in that case the stored copy is read back by identifier.
 * @param medplum - The Medplum client.
 * @param resource - The resource to save.
 * @param identifier - The identifier that uniquely finds this resource.
 * @returns The stored resource, with its id.
 */
async function upsertByIdentifier<T extends Practitioner | PractitionerRole>(
  medplum: MedplumClient,
  resource: T,
  identifier: Identifier
): Promise<WithId<T>> {
  const query = { identifier: `${identifier.system}|${identifier.value}` };
  const saved = await medplum.upsertResource(resource, query);
  if (saved.id) {
    return saved;
  }
  const stored = await medplum.searchOne(resource.resourceType, query, { cache: 'no-cache' });
  if (!stored) {
    throw new Error(`Saved ${resource.resourceType} could not be read back (${query.identifier})`);
  }
  return stored as WithId<T>;
}

/**
 * Saves one provider from the nppes-lookup bot's Bundle.
 *
 * 1. Practitioner: created only if none has this NPI, so each doctor exists once and existing records are kept.
 * 2. PractitionerRole: only after step 1 succeeds, its `urn:uuid:` link is replaced with a reference to the
 *    saved Practitioner, then it is update-or-created keyed on the identifier the bot put on it
 *    (the bot's NPPES role system | NPI). The app does not define that system itself, so it cannot drift.
 *
 * Saving the same doctor again reuses the Practitioner and updates the NPPES role instead of creating copies.
 * The role is replaced on each save, which is fine because this app owns it.
 * @param medplum - The Medplum client.
 * @param result - A Practitioner + PractitionerRole pair from the bot's Bundle.
 * @returns The stored Practitioner and PractitionerRole.
 */
export async function savePractitionerAndRole(
  medplum: MedplumClient,
  result: PractitionerResult
): Promise<SavedPractitioner> {
  // Create only if no Practitioner has this NPI. An existing one (possibly a user's own profile, or one with
  // data added elsewhere) is kept as-is, never overwritten with NPPES data.
  const npi = `${result.npiIdentifier.system}|${result.npiIdentifier.value}`;
  const practitioner = await medplum.createResourceIfNoneExist(result.practitioner, `identifier=${npi}`);

  const roleIdentifier = result.role.identifier?.[0];
  if (!roleIdentifier?.system || !roleIdentifier.value) {
    throw new Error('PractitionerRole from the bot has no identifier to save it by');
  }
  const role = await upsertByIdentifier(
    medplum,
    { ...result.role, practitioner: { ...createReference(practitioner) } },
    roleIdentifier
  );

  return { practitioner, role };
}

/**
 * Display name for a practitioner. NPPES names are upper case ("JORDAN SAMPLESON"); this formats them for display
 * only ("Jordan Sampleson"). The stored resource keeps the NPPES casing.
 * @param name - The practitioner's name.
 * @returns The formatted name.
 */
export function formatDisplayName(name: HumanName | undefined): string {
  const formatted = formatHumanName(name);
  return formatted === formatted.toUpperCase()
    ? formatted.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    : formatted;
}
