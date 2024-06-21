import {
  allOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  getReferenceString,
  notFound,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  GraphDefinition,
  GraphDefinitionLink,
  GraphDefinitionLinkTarget,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext, getLogger } from '../../context';
import { Repository } from '../repo';

/**
 * Handles a Resource $graph request.
 *
 * The operation fetches all the data related to this resources as defined by a GraphDefinition resource
 *
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function resourceGraphHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { resourceType, id } = req.params;
  const definition = await validateQueryParameters(req);
  if (!definition.start || definition.start !== resourceType) {
    throw new OperationOutcomeError(badRequest('Missing or incorrect `start` type'));
  }

  const rootResource = await ctx.repo.readResource(resourceType, id);
  const results = [rootResource] as Resource[];
  const resourceCache = {} as Record<string, Resource>;
  resourceCache[getReferenceString(rootResource)] = rootResource;
  if ('url' in rootResource) {
    resourceCache[(rootResource as { url: string }).url] = rootResource;
  }
  await followLinks(ctx.repo, rootResource, definition.link, results, resourceCache);

  return [
    allOk,
    {
      resourceType: 'Bundle',
      entry: deduplicateResources(results).map((r) => ({
        resource: r,
      })),
      type: 'collection',
    },
  ];
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
  return !!(link.path === undefined && link.target?.every((t) => t.type && t.params));
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
 * @param repo - The repository object for fetching data
 * @param link - A link element defined in the GraphDefinition
 * @param target - The target types.
 * @param resource - The resource for which this GraphDefinition is being applied
 * @param resourceCache - A cache of previously fetched resources. Used to prevent redundant reads
 * @returns The running list of all the resources found while applying this graph
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
  if (!elements.every((elem) => ([PropertyType.Reference, PropertyType.canonical] as string[]).includes(elem.type))) {
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
  // Filter out Resources where we've seen the canonical URL
  const targetUrls = elements.map((elem) => elem.value as string);

  const results = [] as Resource[];
  for (const url of targetUrls) {
    if (url in resourceCache) {
      results.push(resourceCache[url]);
    } else {
      const linkedResources = await repo.searchResources({
        resourceType: target.type as ResourceType,
        filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
      });
      if (linkedResources.length > 1) {
        getLogger().warn('Found more than 1 resource with canonical URL', { url });
      }

      // Cache here to speed up subsequent loop iterations
      linkedResources.forEach((res) => addToCache(res, resourceCache));
      results.push(...linkedResources);
    }
  }

  return results;
}

/**
 * Fetches all resources referenced by this GraphDefinition link,
 * where the link is specified using search parameters
 * @param repo - The repository object for fetching data
 * @param resource - The resource for which this GraphDefinition is being applied
 * @param link - A link element defined in the GraphDefinition
 * @param resourceCache - A cache of previously fetched resources. Used to prevent redundant reads
 * @returns The running list of all the resources found while applying this graph
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
    const params = target.params as string;
    validateTargetParams(params);

    // Replace the {ref} string with a pointer to the current resource
    const searchParams = params.replace('{ref}', getReferenceString(resource));

    // Formulate the searchURL string
    const searchRequest = parseSearchRequest(`${searchResourceType}?${searchParams}`);

    // Parse the max count from the link description, if available
    searchRequest.count = Math.min(parseCardinality(link.max), 5000);

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
 * @param req - The HTTP request.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateQueryParameters(req: FhirRequest): Promise<GraphDefinition> {
  const ctx = getAuthenticatedContext();
  const { graph } = req.query;
  if (typeof graph !== 'string') {
    throw new OperationOutcomeError(badRequest('Missing required parameter: graph'));
  }

  const definition = await ctx.repo.searchOne<GraphDefinition>({
    resourceType: 'GraphDefinition',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: graph }],
  });

  if (!definition) {
    throw new OperationOutcomeError(notFound);
  }

  return definition;
}

function validateTargetParams(params: string): void {
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
  return Number.parseInt(cardinality, 10);
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
