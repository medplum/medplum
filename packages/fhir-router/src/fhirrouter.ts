import {
  EventTarget,
  allOk,
  badRequest,
  created,
  normalizeOperationOutcome,
  notFound,
  parseSearchRequest,
} from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import type { IncomingHttpHeaders } from 'node:http';
import { Operation } from 'rfc6902';
import { LogEvent, processBatch } from './batch';
import { graphqlHandler } from './graphql';
import { FhirRepository } from './repo';
import { HttpMethod, Router } from './urlrouter';

export type FhirRequest = {
  method: HttpMethod;
  pathname: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers?: IncomingHttpHeaders;
  config?: FhirRequestConfig;
};

export type FhirRequestConfig = {
  graphqlMaxDepth?: number;
  graphqlMaxPageSize?: number;
  graphqlMaxSearches?: number;
};

export type FhirResponse = [OperationOutcome] | [OperationOutcome, Resource];

export type FhirRouteHandler = (req: FhirRequest, repo: FhirRepository, router: FhirRouter) => Promise<FhirResponse>;

export interface FhirOptions {
  introspectionEnabled?: boolean;
}

// Execute batch
async function batch(req: FhirRequest, repo: FhirRepository, router: FhirRouter): Promise<FhirResponse> {
  const bundle = req.body as Resource;
  if (bundle.resourceType !== 'Bundle') {
    return [badRequest('Not a bundle')];
  }
  const result = await processBatch(router, repo, bundle);
  return [allOk, result];
}

// Search
async function search(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const query = req.query as Record<string, string[] | string | undefined>;
  const bundle = await repo.search(parseSearchRequest(resourceType as ResourceType, query));
  return [allOk, bundle];
}

// Search multiple types
async function searchMultipleTypes(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const query = req.query as Record<string, string[] | string | undefined>;
  const searchRequest = parseSearchRequest('MultipleTypes' as ResourceType, query);
  if (!searchRequest.types || searchRequest.types.length === 0) {
    return [badRequest('No types specified')];
  }
  const bundle = await repo.search(searchRequest);
  return [allOk, bundle];
}

// Search by POST
async function searchByPost(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const query = req.body as Record<string, string[] | string | undefined>;
  const bundle = await repo.search(parseSearchRequest(resourceType as ResourceType, query));
  return [allOk, bundle];
}

// Create resource
async function createResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const resource = req.body as Resource;
  if (resource.resourceType !== resourceType) {
    return [
      badRequest(`Incorrect resource type: expected ${resourceType}, but found ${resource.resourceType || '<EMPTY>'}`),
    ];
  }
  const result = await repo.createResource(resource);
  return [created, result];
}

// Read resource by ID
async function readResourceById(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const resource = await repo.readResource(resourceType, id);
  return [allOk, resource];
}

// Read resource history
async function readHistory(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const bundle = await repo.readHistory(resourceType, id);
  return [allOk, bundle];
}

// Read resource version by version ID
async function readVersion(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id, vid } = req.params;
  const resource = await repo.readVersion(resourceType, id, vid);
  return [allOk, resource];
}

// Update resource
async function updateResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    return [badRequest('Incorrect resource type')];
  }
  if (resource.id !== id) {
    return [badRequest('Incorrect ID')];
  }
  const result = await repo.updateResource(resource, parseIfMatchHeader(req.headers?.['if-match']));
  return [allOk, result];
}

// Conditional update
async function conditionalUpdate(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType } = req.params;
  const params = req.query;
  const resource = req.body;

  const search = parseSearchRequest(resourceType as ResourceType, params);
  const result = await repo.conditionalUpdate(resource, search);
  return [result.outcome, result.resource];
}

// Delete resource
async function deleteResource(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
  const { resourceType, id } = req.params;
  await repo.deleteResource(resourceType, id);
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
  const resource = await repo.patchResource(resourceType, id, patch);
  return [allOk, resource];
}

export class FhirRouter extends EventTarget {
  readonly router = new Router<FhirRouteHandler>();
  readonly options: FhirOptions;

  constructor(options = {}) {
    super();
    this.options = options;

    this.router.add('GET', '', searchMultipleTypes);
    this.router.add('POST', '', batch);
    this.router.add('GET', ':resourceType', search);
    this.router.add('POST', ':resourceType/_search', searchByPost);
    this.router.add('POST', ':resourceType', createResource);
    this.router.add('GET', ':resourceType/:id', readResourceById);
    this.router.add('GET', ':resourceType/:id/_history', readHistory);
    this.router.add('GET', ':resourceType/:id/_history/:vid', readVersion);
    this.router.add('PUT', ':resourceType', conditionalUpdate);
    this.router.add('PUT', ':resourceType/:id', updateResource);
    this.router.add('DELETE', ':resourceType/:id', deleteResource);
    this.router.add('PATCH', ':resourceType/:id', patchResource);
    this.router.add('POST', '$graphql', graphqlHandler);
  }

  add(method: HttpMethod, path: string, handler: FhirRouteHandler): void {
    this.router.add(method, path, handler);
  }

  async handleRequest(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
    const result = this.router.find(req.method, req.pathname);
    if (!result) {
      return [notFound];
    }
    const { handler, params } = result;
    req.params = params;
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
