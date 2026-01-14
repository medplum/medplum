// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, EMPTY, flatMapFilter, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, StructureDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../repo';
import { getFullUrl } from '../response';

/**
 * Handles a StructureDefinition profile expansion request.
 * Searches for all extensions related to the profile.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function structureDefinitionExpandProfileHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return [badRequest('StructureDefinition profile url not specified')];
  }

  const profile = await fetchProfileByUrl(ctx.repo, url);

  if (!profile) {
    return [badRequest(`StructureDefinition profile with URL ${url} not found`)];
  }

  const sds = await loadNestedStructureDefinitions(ctx.repo, profile, new Set([url]), 1);

  const bundle = bundleResults([profile, ...sds]);

  return [allOk, bundle];
}

async function fetchProfileByUrl(repo: Repository, url: string): Promise<StructureDefinition | undefined> {
  return repo.searchOne<StructureDefinition>({
    resourceType: 'StructureDefinition',
    filters: [
      {
        code: 'url',
        operator: Operator.EQUALS,
        value: url,
      },
    ],
    sortRules: [
      {
        code: 'version',
        descending: true,
      },
    ],
  });
}

async function loadNestedStructureDefinitions(
  repo: Repository,
  profile: StructureDefinition,
  searchedProfiles: Set<string>,
  depth: number
): Promise<StructureDefinition[]> {
  // Recurse at most 10 levels deep
  if (depth > 10) {
    return [];
  }

  const profilesUrlsToLoad: string[] = [];

  for (const element of profile.snapshot?.element ?? EMPTY) {
    const profileUrls = flatMapFilter(element.type, (t) => t.profile);
    for (const url of profileUrls) {
      if (!searchedProfiles.has(url)) {
        profilesUrlsToLoad.push(url);
        searchedProfiles.add(url);
      }
    }
  }

  const promises: Promise<StructureDefinition | undefined>[] = profilesUrlsToLoad.map((url) =>
    fetchProfileByUrl(repo, url)
  );
  const response = [];

  const sds = await Promise.all(promises);
  for (const result of sds) {
    if (result === undefined) {
      continue;
    }

    response.push(result);

    // recursive loop
    const nested = await loadNestedStructureDefinitions(repo, result, searchedProfiles, depth + 1);
    response.push(...nested);
  }

  return response;
}

function bundleResults(profiles: StructureDefinition[]): Bundle<StructureDefinition> {
  const entry: BundleEntry<StructureDefinition>[] = [];

  for (const profile of profiles) {
    if (profile.id !== undefined) {
      entry.push({
        fullUrl: getFullUrl('StructureDefinition', profile.id),
        resource: profile,
      });
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry,
  };
}
