import { allOk, badRequest, created, normalizeOperationOutcome, notFound, parseSearchRequest } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Operation } from 'rfc6902';
import { processBatch } from './batch';
import { graphqlHandler } from './graphql';
import { FhirRepository } from './repo';
import { HttpMethod, Router } from './urlrouter';

export type FhirRequest = {
  method: HttpMethod;
  pathname: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
};

export type FhirResponse = [OperationOutcome] | [OperationOutcome, Resource];

export type FhirRouteHandler = (req: FhirRequest, repo: FhirRepository, router: FhirRouter) => Promise<FhirResponse>;

interface FhirOptions {
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
  const result = await repo.updateResource(resource);
  return [allOk, result];
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
  const resource = await repo.patchResource(resourceType, id, patch);
  return [allOk, resource];
}

export class FhirRouter {
  readonly router = new Router<FhirRouteHandler>();
  readonly options: FhirOptions;

  constructor(options = {}) {
    this.options = options;

    this.router.add('POST', '', batch);
    this.router.add('GET', ':resourceType', search);
    this.router.add('POST', ':resourceType/_search', searchByPost);
    this.router.add('POST', ':resourceType', createResource);
    this.router.add('GET', ':resourceType/:id', readResourceById);
    this.router.add('GET', ':resourceType/:id/_history', readHistory);
    this.router.add('GET', ':resourceType/:id/_history/:vid', readVersion);
    this.router.add('PUT', ':resourceType/:id', updateResource);
    this.router.add('DELETE', ':resourceType/:id', deleteResource);
    this.router.add('PATCH', ':resourceType/:id', patchResource);
    this.router.add('POST', '$graphql', graphqlHandler);
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
}
