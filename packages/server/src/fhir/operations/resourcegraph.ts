import {
  assertOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  getReferenceString,
  OperationOutcomeError,
  Operator,
  parseSearchDefinition,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import {
  Bundle,
  GraphDefinition,
  GraphDefinitionLink,
  GraphDefinitionLinkTarget,
  OperationOutcome,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';

import { Repository } from '../repo';
import { sendResponse } from '../routes';

/**
 * Handles a Resource $graph request.
 *
 * The operation fetches all the data related to this resources as defined by a GraphDefinition resource
 *
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function resourceGraphHandler(req: Request, res: Response): Promise<void> {
  const { resourceType, id } = req.params;
  const repo = res.locals.repo as Repository;

  const [outcome1, rootResource] = await repo.readResource(resourceType, id);
  assertOk(outcome1, rootResource);

  const definition = await validateQueryParameters(req, res);

  if (!definition) {
    return;
  }

  if (!definition.start || definition.start !== resourceType) {
    throw new OperationOutcomeError(badRequest('Missing or incorrect `start` type'));
  }
  const results = [rootResource] as Resource[];
  const resourceCache = {} as Record<string, Resource>;
  resourceCache[getReferenceString(rootResource)] = rootResource;
  if ((rootResource as any).url) {
    resourceCache[(rootResource as any).url] = rootResource;
  }
  await followLinks(rootResource, definition.link, results, resourceCache, repo);

  sendResponse(res, outcome1, {
    resourceType: 'Bundle',
    entry: dedupResources(results).map((r) => ({
      resource: r,
    })),
    type: 'collection',
  } as Bundle);
}

/**
 *
 * current resource is the start resource
 * for each link:
 *  evaluate the path
 *  assert we get a collection of references
 *  filter the references to have the target resourceType
 *  for each elem in the collection:
 *    read the reference
 *    add the result to the bundle
 *    follow the sublink on the element
 * @param resource
 * @param path
 */
type FhirPathLink = GraphDefinitionLink & Required<Pick<GraphDefinitionLink, 'path'>>;
function isFhirPathLink(link: GraphDefinitionLink): link is FhirPathLink {
  return link.path !== undefined;
}

type SearchLink = Omit<GraphDefinitionLink, 'path'> & {
  target: Required<Pick<GraphDefinitionLinkTarget, 'type' | 'params'>>;
};
function isSearchLink(link: GraphDefinitionLink): link is SearchLink {
  return link.path === undefined && link.target !== undefined && link.target.every((t) => t.type && t.params);
}
async function followLinks(
  resource: Resource,
  links: GraphDefinitionLink[] | undefined,
  results: Resource[],
  resourceCache: Record<string, Resource>,
  repo: Repository,
  depth: number = 0
) {
  // Circuit Breaker
  if (results.length > 1000 || depth >= 5) {
    return;
  }

  // Recursive Base Case
  if (!links || links.length == 0) {
    return;
  }
  for (const link of links) {
    if (!link.target) {
      continue;
    }
    for (const target of link.target) {
      let linkedResources = [] as Resource[];

      if (isFhirPathLink(link)) {
        linkedResources = await followFhirPathLink(link, target, resource, resourceCache, repo);
      } else if (isSearchLink(link)) {
        linkedResources = await followSearchLink(resource, link, resourceCache, repo);
      } else {
        throw new OperationOutcomeError(badRequest(`Invalid link: ${JSON.stringify(link)}`));
      }
      linkedResources = dedupResources(linkedResources);
      results.push(...linkedResources);
      for (const linkedResource of linkedResources) {
        await followLinks(linkedResource, target.link, results, resourceCache, repo, depth + 1);
      }
    }
  }
}

/**
 *
 * If link.path:
 *  Get elements
 *  For target in Targets
 *    For elem in elements:
 *      If element is reference: follow reference
 *      If element is canonical: search for resources with url===canonical
 * @param link
 * @param resource
 * @param repo
 * @param results
 */
async function followFhirPathLink(
  link: FhirPathLink,
  target: GraphDefinitionLinkTarget,
  resource: Resource,
  resourceCache: Record<string, Resource>,
  repo: Repository
): Promise<Resource[]> {
  const results = [] as Resource[];

  const elements = evalFhirPathTyped(link.path, [toTypedValue(resource)]);

  // The only kinds of links we can follow are 'reference search parameters'. This includes elements of type
  // Reference and type canonical
  if (!elements.every((elem) => elem.type === PropertyType.Reference || elem.type === PropertyType.canonical)) {
    throw new OperationOutcomeError(badRequest('Invalid link path. Must return a path to a Reference type'));
  }

  // For each of the elements we found on the current resource, follow their various targets

  const referenceElements = elements.filter((elem) => elem.type === PropertyType.Reference);
  if (referenceElements.length > 0) {
    results.push(...(await followReferenceElements(referenceElements, target, resourceCache, repo)));
  }

  const canonicalElements = elements.filter((elem) => elem.type === PropertyType.canonical);
  if (canonicalElements.length > 0) {
    results.push(...(await followCanonicalElements(canonicalElements, target, resourceCache, repo)));
  }

  return results;
}

async function followReferenceElements(
  elements: TypedValue[],
  target: GraphDefinitionLinkTarget,
  resourceCache: Record<string, Resource>,
  repo: Repository
): Promise<Resource[]> {
  const targetReferences = elements
    .filter((elem) => elem.value.reference?.split('/')[0] === target.type)
    .map((elem) => elem.value as Reference);

  const results = [] as Resource[];

  for (const ref of targetReferences) {
    if (ref.reference) {
      if (ref.reference in resourceCache) {
        results.push(resourceCache[ref.reference]);
      } else {
        const [outcome, linkedResource] = await repo.readReference(ref);
        assertOk(outcome, linkedResource);

        // Cache here to speed up subsequent loop iterations
        addToCache(linkedResource, resourceCache);
        results.push(linkedResource);
      }
    }
  }
  return results;
}

async function followCanonicalElements(
  elements: TypedValue[],
  target: GraphDefinitionLinkTarget,
  resourceCache: Record<string, Resource>,
  repo: Repository
): Promise<Resource[]> {
  if (!target?.type) {
    return [];
  }

  // Filter out Resources where we've seen the canonical URL
  const targetUrls = elements.map((elem) => elem.value as string);

  const results = [] as Resource[];
  for (const url of targetUrls) {
    if (url in resourceCache) {
      results.push(resourceCache[url]);
    } else {
      const [outcome, bundle] = (await repo.search({
        resourceType: target.type,
        filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
      })) as [OperationOutcome, Bundle];
      assertOk(outcome, bundle);
      const linkedResources = bundle?.entry?.map((entry) => entry.resource).filter((e) => !!e) as Resource[];
      if (linkedResources?.length > 1) {
        console.warn(`Warning: Found more than 1 resource with canonical URL ${url}`);
      }

      // Cache here to speed up subsequent loop iterations
      linkedResources.forEach((res) => addToCache(res, resourceCache));
      results.push(...linkedResources);
    }
  }

  return results;
}

async function followSearchLink(
  resource: Resource,
  link: GraphDefinitionLink,
  resourceCache: Record<string, Resource>,
  repo: Repository
): Promise<Resource[]> {
  let results = [] as Resource[];
  if (!link.target) {
    return [];
  }
  for (const target of link.target) {
    const searchResourceType = target.type;
    validateTargetParams(target.params);
    // Replace the {ref} string with a pointer to the current resource
    const searchParams = target.params?.replace('{ref}', getReferenceString(resource));

    // Formulate the searchURL string
    const searchRequest = parseSearchDefinition(`${searchResourceType}?${searchParams}`);

    // Parse the max count from the link description, if available
    searchRequest.count = Math.max(parseCardinality(link.max), 5000);

    // Run the search and add the results to the `results` array
    const [outcome, bundle] = await repo.search(searchRequest);
    assertOk(outcome, bundle);
    if (bundle && bundle.entry) {
      const resources = bundle.entry.map((entry) => entry.resource).filter((e): e is Resource => !!e);
      resources.forEach((res) => addToCache(res, resourceCache));

      results.push(...resources);
    }
  }
  return results;
}

/**
 * Parses and validates the operation parameters.
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateQueryParameters(req: Request, res: Response): Promise<GraphDefinition | undefined> {
  const { graph } = req.query as { graph: string };

  const repo = res.locals.repo as Repository;
  const [outcome2, bundle] = await repo.search({
    resourceType: 'GraphDefinition',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: graph }],
  });
  assertOk(outcome2, bundle);

  return bundle.entry?.[0]?.resource as GraphDefinition;
}

function validateTargetParams(params: string | undefined) {
  if (!params) {
    throw new OperationOutcomeError(badRequest(`Link target search params missing`));
  }
  if (!params.includes('{ref}')) {
    throw new OperationOutcomeError(badRequest(`Link target search params must include {ref}`));
  }
}

function parseCardinality(cardinality: string | undefined): number {
  if (!cardinality) {
    return DEFAULT_SEARCH_COUNT;
  }
  if (cardinality === '*') {
    return Number.POSITIVE_INFINITY;
  }
  return parseInt(cardinality);
}

function addToCache(resource: Resource, cache: Record<string, Resource>) {
  cache[getReferenceString(resource)] = resource;
  const url = (resource as any).url;
  if (url) {
    cache[url] = resource;
  }
}

function dedupResources(resources: Resource[]) {
  const seen = new Set<string>();
  return resources.filter((item) => {
    const key = getReferenceString(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
