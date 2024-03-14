import { allOk, badRequest, Operator } from '@medplum/core';
import { Bundle, BundleEntry, StructureDefinition } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getAuthenticatedContext } from '../../context';
import { Repository } from '../repo';
import { getFullUrl, sendResponse } from '../response';
import { sendOutcome } from '../outcomes';

/**
 * Handles a StructureDefinition profile expansion request.
 * Searches for all extensions related to the profile.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function structureDefinitionExpandProfileHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    sendOutcome(req, res, badRequest('Profile url not specified'));
    return;
  }

  const profile = await fetchProfileByUrl(ctx.repo, url);

  if (!profile) {
    sendOutcome(req, res, badRequest('Profile not found'));
    return;
  }

  const sds = await loadNestedStructureDefinitions(ctx.repo, profile, new Set([url]), 1);

  const bundle = bundleResults([profile, ...sds]);

  await sendResponse(req, res, allOk, bundle);
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
