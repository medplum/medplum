import {
  EventTarget,
  OperationOutcomeError,
  allOk,
  badRequest,
  created,
  normalizeOperationOutcome,
  notFound,
  parseSearchRequest,
  singularize,
} from '@medplum/core';
import {
  CapabilityStatementRestInteraction,
  CapabilityStatementRestResourceInteraction,
  OperationOutcome,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { IncomingHttpHeaders } from 'node:http';
import { Operation } from 'rfc6902';
import { LogEvent, processBatch } from './batch';
import { graphqlHandler } from './graphql';
import { CreateResourceOptions, FhirRepository, RepositoryMode, UpdateResourceOptions } from './repo';
import { HttpMethod, RouteResult, Router } from './urlrouter';

export type FhirRequest = {
  method: HttpMethod;
  url: string;
  pathname: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  headers?: IncomingHttpHeaders;
  config?: FhirRequestConfig;
};

export type FhirRequestConfig = {
  graphqlBatchedSearchSize?: number;
  graphqlMaxDepth?: number;
  graphqlMaxSearches?: number;
  searchOnReader?: boolean;
  transactions?: boolean;
};

export type FhirResponseOptions = {
  contentType?: string;
  forceRawBinaryResponse?: boolean;
};

export type FhirResponse =
  | [OperationOutcome]
  | [OperationOutcome, Resource]
  | [OperationOutcome, Resource, FhirResponseOptions];

export type FhirRouteOptions = {
  batch?: boolean;
};

export type FhirRouteHandler = (
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter,
  options?: FhirRouteOptions
) => Promise<FhirResponse>;

export interface FhirOptions {
  introspectionEnabled?: boolean;
}

// Execute batch
async function batch(req: FhirRequest, repo: FhirRepository, router: FhirRouter): Promise<FhirResponse> {
  const bundle = req.body as Resource;
  if (bundle.resourceType !== 'Bundle') {
    return [badRequest('Not a bundle')];
  }

  const result = await processBatch(req, repo, router, bundle);
  return [allOk, result];
}

// Search
async function search(
  req: FhirRequest,
  repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  setSearchRepositoryMode(req, repo, options);

  const { resourceType } = req.params;
  const bundle = await repo.search(parseSearchRequest(resourceType as ResourceType, req.query));
  return [allOk, bundle];
}

// Search multiple types
async function searchMultipleTypes(
  req: FhirRequest,
  repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  setSearchRepositoryMode(req, repo, options);

  const searchRequest = parseSearchRequest('MultipleTypes' as ResourceType, req.query);
  if (!searchRequest.types || searchRequest.types.length === 0) {
    return [badRequest('No types specified')];
  }
  const bundle = await repo.search(searchRequest);
  return [allOk, bundle];
}

// Search by POST
async function searchByPost(
  req: FhirRequest,
  repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  setSearchRepositoryMode(req, repo, options);

  const { resourceType } = req.params;
  const query = req.body as Record<string, string[] | string | undefined>;
  const bundle = await repo.search(parseSearchRequest(resourceType as ResourceType, query));
  return [allOk, bundle];
}

function setSearchRepositoryMode(req: FhirRequest, repo: FhirRepository, options?: FhirRouteOptions): void {
  if (!options?.batch && req.config?.searchOnReader) {
    repo.setMode(RepositoryMode.READER);
  }
}

// Create resource
async function createResource(
  req: FhirRequest,
  repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const resource = req.body as Resource;
  const assignedId = Boolean(options?.batch);

  if (req.query?._account && typeof req.query._account === 'string') {
    // Some FHIR clients do not allow custom meta fields, so we use a query parameter instead
    // See: https://github.com/medplum/medplum/issues/5145
    resource.meta = resource.meta || {};
    resource.meta.account = { reference: req.query._account };
  }

  if (req.headers?.['if-none-exist']) {
    const ifNoneExist = singularize(req.headers['if-none-exist']);
    const result = await repo.conditionalCreate(resource, parseSearchRequest(`${resourceType}?${ifNoneExist}`), {
      assignedId,
    });
    return [result.outcome, result.resource];
  }

  return createResourceImpl(resourceType as ResourceType, resource, repo, { assignedId });
}

export async function createResourceImpl<T extends Resource>(
  resourceType: T['resourceType'],
  resource: T,
  repo: FhirRepository,
  options?: CreateResourceOptions
): Promise<FhirResponse> {
  if (resource.resourceType !== resourceType) {
    return [
      badRequest(`Incorrect resource type: expected ${resourceType}, but found ${resource.resourceType || '<EMPTY>'}`),
    ];
  }

  const result = await repo.createResource(resource, options);
  return [created, result];
}

// Read resource by ID
async function readResourceById(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const resource = await repo.readResource(resourceType as ResourceType, id);
  return [allOk, resource];
}

// Read resource history
async function readHistory(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const bundle = await repo.readHistory(resourceType as ResourceType, id);
  return [allOk, bundle];
}

// Read resource version by version ID
async function readVersion(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id, vid } = req.params;
  const resource = await repo.readVersion(resourceType as ResourceType, id, vid);
  return [allOk, resource];
}

// Update resource
async function updateResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const resource = req.body;
  return updateResourceImpl(resourceType, id, resource, repo, {
    ifMatch: parseIfMatchHeader(req.headers?.['if-match']),
  });
}

export async function updateResourceImpl<T extends Resource>(
  resourceType: T['resourceType'],
  id: string,
  resource: T,
  repo: FhirRepository,
  options?: UpdateResourceOptions
): Promise<FhirResponse> {
  if (resource.resourceType !== resourceType) {
    return [badRequest('Incorrect resource type')];
  }
  if (resource.id !== id) {
    return [badRequest('Incorrect resource ID')];
  }
  const result = await repo.updateResource(resource, options);
  return [allOk, result];
}

// Conditional update
async function conditionalUpdate(
  req: FhirRequest,
  repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const resource = req.body;

  const search = parseSearchRequest(resourceType as ResourceType, req.query);
  const result = await repo.conditionalUpdate(resource, search, { assignedId: options?.batch });
  return [result.outcome, result.resource];
}

// Delete resource
async function deleteResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  await repo.deleteResource(resourceType, id);
  return [allOk];
}

// Conditional delete
async function conditionalDelete(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;

  const search = parseSearchRequest(resourceType as ResourceType, req.query);
  await repo.conditionalDelete(search);
  return [allOk];
}

// Patch resource
async function patchResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const patch = req.body as Operation[];
  if (!patch) {
    return [badRequest('Empty patch body')];
  }
  if (!Array.isArray(patch)) {
    return [badRequest('Patch body must be an array')];
  }
  const resource = await repo.patchResource(resourceType as ResourceType, id, patch);
  return [allOk, resource];
}

// Conditional PATCH
async function conditionalPatch(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const patch = req.body as Operation[];
  if (!patch) {
    return [badRequest('Empty patch body')];
  }
  if (!Array.isArray(patch)) {
    return [badRequest('Patch body must be an array')];
  }

  const search = parseSearchRequest(resourceType as ResourceType, req.query);
  const resource = await repo.conditionalPatch(search, patch);
  return [allOk, resource];
}

/** @see http://hl7.org/fhir/R4/codesystem-restful-interaction.html */
export type RestInteraction =
  | CapabilityStatementRestInteraction['code']
  | CapabilityStatementRestResourceInteraction['code']
  | 'operation';

export type FhirRouteMetadata = {
  interaction: RestInteraction;
};

export class FhirRouter extends EventTarget {
  readonly router = new Router<FhirRouteHandler, FhirRouteMetadata>();
  readonly options: FhirOptions;

  constructor(options = {}) {
    super();
    this.options = options;

    this.router.add('GET', '', searchMultipleTypes, { interaction: 'search-system' });
    this.router.add('POST', '', batch, { interaction: 'batch' });
    this.router.add('GET', ':resourceType', search, { interaction: 'search-type' });
    this.router.add('POST', ':resourceType/_search', searchByPost, { interaction: 'search-type' });
    this.router.add('POST', ':resourceType', createResource, { interaction: 'create' });
    this.router.add('GET', ':resourceType/:id', readResourceById, { interaction: 'read' });
    this.router.add('GET', ':resourceType/:id/_history', readHistory, { interaction: 'history-instance' });
    this.router.add('GET', ':resourceType/:id/_history/:vid', readVersion, { interaction: 'vread' });
    this.router.add('PUT', ':resourceType/:id', updateResource, { interaction: 'update' });
    this.router.add('PUT', ':resourceType', conditionalUpdate, { interaction: 'update' });
    this.router.add('DELETE', ':resourceType/:id', deleteResource, { interaction: 'delete' });
    this.router.add('DELETE', ':resourceType', conditionalDelete, { interaction: 'delete' });
    this.router.add('PATCH', ':resourceType/:id', patchResource, { interaction: 'patch' });
    this.router.add('PATCH', ':resourceType', conditionalPatch, { interaction: 'patch' });
    this.router.add('POST', '$graphql', graphqlHandler, { interaction: 'operation' });
  }

  add(method: HttpMethod, path: string, handler: FhirRouteHandler, interaction?: RestInteraction): void {
    this.router.add(method, path, handler, { interaction: interaction ?? 'operation' });
  }

  find(method: HttpMethod, url: string): RouteResult<FhirRouteHandler, FhirRouteMetadata> | undefined {
    return this.router.find(method, url);
  }

  async handleRequest(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
    const url = req.url;
    // User-specified URL is parsed into component parts, which are populated back onto the request
    if (req.pathname) {
      throw new OperationOutcomeError(badRequest('FhirRequest must specify url instead of pathname'));
    }
    const result = this.find(req.method, url);
    if (!result) {
      return [notFound];
    }
    const { handler, path, params, query } = result;

    // Populate request object with parsed URL components from router
    req.params = params;
    req.pathname = path;
    if (query) {
      req.query = query;
    }
    try {
      return await handler(req, repo, this);
    } catch (err) {
      return [normalizeOperationOutcome(err)];
    }
  }

  log(level: string, message: string, data?: Record<string, any>): void {
    const event: LogEvent = { type: level, message, data };
    this.dispatchEvent(event);
  }
}

function parseIfMatchHeader(ifMatch: string | undefined): string | undefined {
  if (!ifMatch) {
    return undefined;
  }
  const match = /"([^"]+)"/.exec(ifMatch);
  return match ? match[1] : undefined;
}

export function makeSimpleRequest(method: HttpMethod, path: string, body?: any): FhirRequest {
  return {
    method,
    url: path,
    pathname: '',
    query: {},
    params: {},
    body,
  };
}
