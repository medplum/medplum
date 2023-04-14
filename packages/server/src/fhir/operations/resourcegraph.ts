import {
  allOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  getReferenceString,
  notFound,
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
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { logger } from '../../logger';
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

  if (resourceType === 'undefined' || id === 'undefined') {
    throw new OperationOutcomeError(notFound);
  }

  const rootResource = await repo.readResource(resourceType, id);

  const definition = await validateQueryParameters(req, res);

  if (!definition.start || definition.start !== resourceType) {
    throw new OperationOutcomeError(badRequest('Missing or incorrect `start` type'));
  }
  const results = [rootResource] as Resource[];
  const resourceCache = {} as Record<string, Resource>;
  resourceCache[getReferenceString(rootResource)] = rootResource;
  if ('url' in rootResource) {
    resourceCache[(rootResource as any).url] = rootResource;
  }
  await followLinks(repo, rootResource, definition.link, results, resourceCache);

  await sendResponse(res, allOk, {
    resourceType: 'Bundle',
    entry: deduplicateResources(results).map((r) => ({
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
 *    follow the subLink on the element
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
  repo: Repository,
  resource: Resource,
  links: GraphDefinitionLink[] | undefined,
  results: Resource[],
  resourceCache: Record<string, Resource>,
  depth = 0
): Promise<void> {
  // Circuit Breaker
  if (results.length > 1000 || depth >= 5) {
    return;
  }

  // Recursive Base Case
  if (!links) {
    return;
  }
  for (const link of links) {
    for (const target of link.target || []) {
      let linkedResources: Resource[];

      if (isFhirPathLink(link)) {
        linkedResources = await followFhirPathLink(repo, link, target, resource, resourceCache);
      } else if (isSearchLink(link)) {
        linkedResources = await followSearchLink(repo, resource, link, resourceCache);
      } else {
        throw new OperationOutcomeError(badRequest(`Invalid link: ${JSON.stringify(link)}`));
      }
      linkedResources = deduplicateResources(linkedResources);
      results.push(...linkedResources);
      for (const linkedResource of linkedResources) {
        await followLinks(repo, linkedResource, target.link, results, resourceCache, depth + 1);
      }
    }
  }
}

/**
 * If link.path:
 *  Evaluate the FHIRPath expression to get the corresponding properties
 *    For elem in elements:
 *      If element is reference: follow reference
 *      If element is canonical: search for resources with url===canonical
 * @param repo The repository object for fetching data
 * @param link A link element defined in the GraphDefinition
 * @param resource The resource for which this GraphDefinition is being applied
 * @param resourceCache A cache of previously fetched resources. Used to prevent redundant reads
 * @param results The running list of all the resources found while applying this graph
 */
async function followFhirPathLink(
  repo: Repository,
  link: FhirPathLink,
  target: GraphDefinitionLinkTarget,
  resource: Resource,
  resourceCache: Record<string, Resource>
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
    results.push(...(await followReferenceElements(repo, referenceElements, target, resourceCache)));
  }

  const canonicalElements = elements.filter((elem) => elem.type === PropertyType.canonical);
  if (canonicalElements.length > 0) {
    results.push(...(await followCanonicalElements(repo, canonicalElements, target, resourceCache)));
  }

  return results;
}

async function followReferenceElements(
  repo: Repository,
  elements: TypedValue[],
  target: GraphDefinitionLinkTarget,
  resourceCache: Record<string, Resource>
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
        const linkedResource = await repo.readReference(ref);

        // Cache here to speed up subsequent loop iterations
        addToCache(linkedResource, resourceCache);
        results.push(linkedResource);
      }
    }
  }
  return results;
}

async function followCanonicalElements(
  repo: Repository,
  elements: TypedValue[],
  target: GraphDefinitionLinkTarget,
  resourceCache: Record<string, Resource>
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
      const linkedResources = await repo.searchResources({
        resourceType: target.type,
        filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
      });
      if (linkedResources?.length > 1) {
        logger.warn(`Warning: Found more than 1 resource with canonical URL ${url}`);
      }

      // Cache here to speed up subsequent loop iterations
      linkedResources.forEach((res) => addToCache(res, resourceCache));
      results.push(...linkedResources);
    }
  }

  return results;
}

/**
 *
 * Fetches all resources referenced by this GraphDefinition link,
 * where the link is specified using search parameters
 *
 * @param repo The repository object for fetching data
 * @param resource The resource for which this GraphDefinition is being applied
 * @param link A link element defined in the GraphDefinition
 * @param resourceCache A cache of previously fetched resources. Used to prevent redundant reads
 * @param results The running list of all the resources found while applying this graph
 */
async function followSearchLink(
  repo: Repository,
  resource: Resource,
  link: SearchLink,
  resourceCache: Record<string, Resource>
): Promise<Resource[]> {
  const results = [] as Resource[];
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
    const resources = await repo.searchResources(searchRequest);
    if (resources) {
      resources.forEach((res) => addToCache(res, resourceCache));
      results.push(...resources);
    }
  }
  return results;
}

/**
 * Parses and validates the operation parameters.
 * See: https://www.hl7.org/fhir/resource-operation-graph.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateQueryParameters(req: Request, res: Response): Promise<GraphDefinition> {
  const { graph } = req.query;
  if (typeof graph !== 'string') {
    throw new OperationOutcomeError(badRequest('Missing required parameter: graph'));
  }

  const repo = res.locals.repo as Repository;
  const bundle = await repo.search({
    resourceType: 'GraphDefinition',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: graph }],
  });

  const definition = bundle.entry?.[0]?.resource as GraphDefinition;
  if (!definition) {
    throw new OperationOutcomeError(notFound);
  }

  return definition;
}

function validateTargetParams(params: string | undefined): void {
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

function addToCache(resource: Resource, cache: Record<string, Resource>): void {
  cache[getReferenceString(resource)] = resource;
  const url = (resource as any).url;
  if (url) {
    cache[url] = resource;
  }
}

function deduplicateResources(resources: Resource[]): Resource[] {
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
