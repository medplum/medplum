import { allOk, badRequest, Operator } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, BundleEntry, StructureDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { Repository } from '../repo';
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

  profile.snapshot?.element?.forEach((element) => {
    const profileUrls: string[] | undefined = element.type
      ?.map((t) => t.profile)
      .flat()
      .filter((p): p is NonNullable<string> => p !== undefined);

    profileUrls?.forEach((p) => {
      if (!searchedProfiles.has(p)) {
        profilesUrlsToLoad.push(p);
        searchedProfiles.add(p);
      }
    });
  });

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
